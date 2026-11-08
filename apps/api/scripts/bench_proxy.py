from __future__ import annotations

import argparse
import asyncio
import json
import math
import sys
import time
from datetime import UTC, datetime
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import httpx
from pydantic import SecretStr

ROOT = Path(__file__).resolve().parents[3]
API_ROOT = ROOT / "apps" / "api"
sys.path.insert(0, str(API_ROOT))

from overcall.api_schemas import Thresholds  # noqa: E402
from overcall.auth.ingest_keys import hash_ingest_key  # noqa: E402
from overcall.config import Settings  # noqa: E402
from overcall.db.models import IngestKey, UserSettings  # noqa: E402
from overcall.deps import get_db_session  # noqa: E402
from overcall.main import create_app  # noqa: E402
from overcall.mock_llm import mock_app  # noqa: E402
from overcall.rules import RULES  # noqa: E402
from overcall.rules.base import RuleContext  # noqa: E402
from overcall.synthetic.generator import SyntheticGenerator  # noqa: E402

_PEPPER = "benchmark-pepper-" + ("x" * 40)
_KEY = "oc_" + ("A" * 43)
_BODY = json.dumps(
    {
        "model": "gpt-4o-mini",
        "messages": [{"role": "user", "content": "benchmark request"}],
    },
    separators=(",", ":"),
).encode()
_P50_BUDGET_MS = 15.0
_DETECTION_BUDGET_MS = 2_000.0


class _FakeResult:
    def __init__(self, item: IngestKey | None) -> None:
        self.item = item

    def scalar_one_or_none(self) -> IngestKey | None:
        return self.item


class _FakeSession:
    def __init__(self, ingest_key: IngestKey) -> None:
        self.ingest_key = ingest_key
        self.added: list[object] = []

    async def execute(self, statement) -> _FakeResult:
        values = set(statement.compile().params.values())
        item = self.ingest_key if self.ingest_key.key_hash in values else None
        return _FakeResult(item)

    async def get(self, model, _identity):
        if model is UserSettings:
            return SimpleNamespace(upstream_mode="mock")
        return None

    def add(self, item: object) -> None:
        self.added.append(item)

    async def flush(self) -> None:
        return None

    async def commit(self) -> None:
        return None

    async def rollback(self) -> None:
        return None


class _TimedASGIApp:
    def __init__(self, app) -> None:
        self.app = app
        self.response_sent_at = 0.0

    async def __call__(self, scope, receive, send) -> None:
        async def timed_send(message) -> None:
            await send(message)
            if (
                message["type"] == "http.response.body"
                and not message.get("more_body", False)
            ):
                self.response_sent_at = time.perf_counter()

        await self.app(scope, receive, timed_send)


def _percentile(samples: list[float], quantile: float) -> float:
    ordered = sorted(samples)
    if not ordered:
        raise ValueError("at least one sample is required")
    position = (len(ordered) - 1) * quantile
    lower = math.floor(position)
    upper = math.ceil(position)
    weight = position - lower
    return ordered[lower] * (1 - weight) + ordered[upper] * weight


async def _post(client: httpx.AsyncClient, path: str, headers: dict[str, str]) -> None:
    response = await client.post(path, content=_BODY, headers=headers)
    if response.status_code != 200:
        raise RuntimeError(f"Benchmark request to {path} returned {response.status_code}")


async def _drive_proxy_traffic(
    client: httpx.AsyncClient,
    stop: asyncio.Event,
    headers: dict[str, str],
) -> int:
    requests = 0
    while True:
        await _post(client, "/proxy/openai/v1/chat/completions", headers)
        requests += 1
        if stop.is_set():
            return requests


def _generate_detection_rows(count: int):
    generator = SyntheticGenerator(
        seed=42,
        days=7,
        size="standard",
        start=datetime(2026, 1, 16, tzinfo=UTC),
    )
    generator.baseline(count)
    logs, _truth = generator.finish()
    return logs


def _run_detection(logs) -> None:
    context = RuleContext(w=Thresholds(), window_days=7)
    for rule in RULES:
        rule.detect(logs, context)


async def run_benchmark(*, requests: int = 200, detection_rows: int = 100_000) -> dict:
    if requests < 1:
        raise ValueError("requests must be greater than zero")
    if detection_rows < 1:
        raise ValueError("detection_rows must be greater than zero")

    warmups = min(10, max(3, requests // 10))
    settings = Settings(
        _env_file=None,
        app_env="test",
        database_url=None,
        ingest_key_pepper=SecretStr(_PEPPER),
        rate_limit_proxy_rps=max(10_000, requests + warmups + 10),
        release="proxy-benchmark",
    )
    user_id = uuid4()
    ingest_key = IngestKey(
        id=uuid4(),
        user_id=user_id,
        name="benchmark",
        prefix=_KEY[:9],
        key_hash=hash_ingest_key(_KEY, _PEPPER),
        pepper_version=1,
    )
    app = create_app(settings)

    async def session_dependency():
        yield _FakeSession(ingest_key)

    app.dependency_overrides[get_db_session] = session_dependency
    timed_proxy = _TimedASGIApp(app)
    timed_mock = _TimedASGIApp(mock_app)
    proxy_headers = {"content-type": "application/json", "x-overcall-key": _KEY}
    mock_headers = {"content-type": "application/json"}
    proxy_transport = httpx.ASGITransport(app=timed_proxy)
    mock_transport = httpx.ASGITransport(app=timed_mock)

    async with (
        httpx.AsyncClient(transport=proxy_transport, base_url="http://benchmark") as proxy_client,
        httpx.AsyncClient(transport=mock_transport, base_url="http://mock") as mock_client,
    ):
        for _ in range(warmups):
            await _post(mock_client, "/v1/chat/completions", mock_headers)
            await _post(proxy_client, "/proxy/openai/v1/chat/completions", proxy_headers)

        mock_samples: list[float] = []
        proxy_samples: list[float] = []
        added_samples: list[float] = []
        for _ in range(requests):
            started = time.perf_counter()
            await _post(mock_client, "/v1/chat/completions", mock_headers)
            mock_latency = (timed_mock.response_sent_at - started) * 1000

            started = time.perf_counter()
            await _post(proxy_client, "/proxy/openai/v1/chat/completions", proxy_headers)
            proxy_latency = (timed_proxy.response_sent_at - started) * 1000

            mock_samples.append(mock_latency)
            proxy_samples.append(proxy_latency)
            added_samples.append(proxy_latency - mock_latency)

        logs = _generate_detection_rows(detection_rows)
        stop = asyncio.Event()
        traffic_task = asyncio.create_task(
            _drive_proxy_traffic(proxy_client, stop, proxy_headers)
        )
        await asyncio.sleep(0)
        started = time.perf_counter()
        try:
            await asyncio.to_thread(_run_detection, logs)
        finally:
            detection_latency = (time.perf_counter() - started) * 1000
            stop.set()
        concurrent_requests = await traffic_task

    return {
        "generated_at": datetime.now(UTC).isoformat(),
        "proxy": {
            "requests": requests,
            "mock_p50_ms": _percentile(mock_samples, 0.50),
            "mock_p95_ms": _percentile(mock_samples, 0.95),
            "proxy_p50_ms": _percentile(proxy_samples, 0.50),
            "proxy_p95_ms": _percentile(proxy_samples, 0.95),
            "added_latency_p50_ms": _percentile(added_samples, 0.50),
            "added_latency_p95_ms": _percentile(added_samples, 0.95),
        },
        "detection": {
            "rows": len(logs),
            "duration_ms": detection_latency,
            "concurrent_proxy_requests": concurrent_requests,
        },
        "budgets": {
            "added_latency_p50_ms": _P50_BUDGET_MS,
            "detection_duration_ms": _DETECTION_BUDGET_MS,
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Measure proxy overhead and detection runtime under proxy traffic."
    )
    parser.add_argument("--requests", type=int, default=200)
    parser.add_argument("--detection-rows", type=int, default=100_000)
    parser.add_argument(
        "--out",
        type=Path,
        default=ROOT / "validation" / "reports" / "proxy-benchmark.json",
    )
    args = parser.parse_args()
    report = asyncio.run(
        run_benchmark(requests=args.requests, detection_rows=args.detection_rows)
    )
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(
        json.dumps(report, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(report, indent=2, sort_keys=True))
    if report["proxy"]["added_latency_p50_ms"] > _P50_BUDGET_MS:
        print("FAIL: median added proxy latency exceeds its budget.", file=sys.stderr)
        return 1
    if report["detection"]["duration_ms"] >= _DETECTION_BUDGET_MS:
        print(
            "FAIL: detection exceeded its budget while proxy traffic was active.",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
