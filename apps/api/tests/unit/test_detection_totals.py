import asyncio
from datetime import UTC, datetime
from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

from overcall import v1_api
from overcall.db.models import DetectionRun
from overcall.db.models import RequestLog as DatabaseLog
from overcall.rules.base import Finding
from overcall.v1_api import _aggregate_finding_totals


def _finding(impact_kind: str, request_id: str, waste: float) -> Finding:
    return Finding(
        issue_type="test_rule",
        severity="warning",
        provider="openai",
        endpoint="/v1/chat/completions",
        title="Test finding",
        summary="",
        explanation="",
        suggested_fix="",
        affected=[],
        waste_by_request={request_id: waste},
        impact_kind=impact_kind,
    )


def test_detection_totals_keep_spend_experimental_and_reliability_separate() -> None:
    findings = [
        (SimpleNamespace(tier=1), _finding("spend", "shared-request", 0.3)),
        (SimpleNamespace(tier=1), _finding("spend", "shared-request", 0.2)),
        (SimpleNamespace(tier=3), _finding("spend", "shared-request", 0.4)),
        (SimpleNamespace(tier=1), _finding("reliability", "shared-request", 0.1)),
    ]

    totals = _aggregate_finding_totals(findings)

    assert totals.spend_by_request == {"shared-request": 0.3}
    assert totals.experimental_by_request == {"shared-request": 0.4}
    assert totals.reliability_overhead_by_request == {"shared-request": 0.1}
    assert totals.reliability_count == 1


def test_detection_run_stores_spend_and_reliability_in_separate_totals(monkeypatch) -> None:
    user_id = uuid4()
    request_id = uuid4()
    occurred_at = datetime(2026, 1, 1, tzinfo=UTC)
    log = DatabaseLog(
        id=request_id,
        user_id=user_id,
        source="proxy",
        origin="upstream",
        occurred_at=occurred_at,
        provider="openai",
        method="POST",
        endpoint="/v1/chat/completions",
        status=200,
        latency_ms=1,
        req_size=1,
        resp_size=1,
        req_hash="test-hash",
        cost_usd=Decimal("0.001"),
        cost_basis="billed",
        pricing_version="test",
    )

    class Session:
        def __init__(self) -> None:
            self.added = []

        def add(self, item) -> None:
            self.added.append(item)

        async def flush(self) -> None:
            return None

        async def commit(self) -> None:
            return None

    class RunRepository:
        def __init__(self, _session, _user_id) -> None:
            pass

        async def get(self, _run_id):
            return None

    class IssueRepository:
        def __init__(self, _session, _user_id) -> None:
            pass

        async def delete_for_source(self, source: str) -> None:
            assert source == "proxy"

    class LogRepository:
        def __init__(self, _session, _user_id) -> None:
            pass

        async def list_window(self, _start, _end, *, source, limit):
            assert source == "proxy"
            assert limit == 200_000
            return [log]

    class TestRule:
        tier = 1

        def __init__(self, rule_id: str, impact_kind: str, waste: float) -> None:
            self.id = rule_id
            self.impact_kind = impact_kind
            self.waste = waste

        def detect(self, logs, _context):
            row = logs[0]
            finding = _finding(self.impact_kind, row.id, self.waste)
            finding.affected = [row]
            return [finding]

    async def settings(_session, _user_id):
        return SimpleNamespace(thresholds={}, rules_enabled={}, tier3_enabled=True)

    monkeypatch.setattr(v1_api, "DetectionRunRepository", RunRepository)
    monkeypatch.setattr(v1_api, "IssueRepository", IssueRepository)
    monkeypatch.setattr(v1_api, "RequestLogRepository", LogRepository)
    monkeypatch.setattr(v1_api, "RULES", [
        TestRule("spend_rule", "spend", 0.3),
        TestRule("reliability_rule", "reliability", 0.1),
    ])
    monkeypatch.setattr(v1_api, "_settings", settings)

    session = Session()
    run = asyncio.run(v1_api._perform_detection(session, user_id))
    stored_run = next(item for item in session.added if isinstance(item, DetectionRun))

    assert run is stored_run
    assert stored_run.spend_savings_monthly_usd == Decimal("9.0")
    assert stored_run.reliability_count == 1
    assert stored_run.reliability_overhead_monthly_usd == Decimal("3.0")
