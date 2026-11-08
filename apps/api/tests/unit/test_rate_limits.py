from __future__ import annotations

import asyncio
from types import SimpleNamespace
from uuid import uuid4

import pytest
from starlette.requests import Request

from overcall import deps
from overcall.auth.ingest_keys import hash_ingest_key
from overcall.auth.jwt import JWTVerificationError
from overcall.config import Settings
from overcall.deps import get_current_user, get_ingest_key
from overcall.errors import OvercallError
from overcall.rate_limits import InMemoryRateLimiter


def test_token_bucket_rejects_excess_and_reports_retry_time() -> None:
    now = [0.0]
    limiter = InMemoryRateLimiter(max_entries=2, clock=lambda: now[0])

    assert limiter.consume("user-a", limit=2, period_seconds=60) is None
    assert limiter.consume("user-a", limit=2, period_seconds=60) is None
    assert limiter.consume("user-a", limit=2, period_seconds=60) == 30

    now[0] = 30.0
    assert limiter.consume("user-a", limit=2, period_seconds=60) is None
    assert limiter.consume("user-a", limit=2, period_seconds=60) == 30


def test_token_bucket_store_is_bounded_and_evicts_least_recently_used() -> None:
    limiter = InMemoryRateLimiter(max_entries=2, clock=lambda: 0.0)

    for key in ("user-a", "user-b", "user-c"):
        assert limiter.consume(key, limit=1, period_seconds=60) is None

    assert len(limiter._buckets) == 2
    assert "user-a" not in limiter._buckets
    assert list(limiter._buckets) == ["user-b", "user-c"]


def test_current_user_rate_limit_is_per_user_and_returns_retry_after() -> None:
    user_id = uuid4()

    class Verifier:
        async def verify(self, _token: str) -> dict[str, str]:
            return {"sub": str(user_id)}

    settings = Settings(_env_file=None, app_env="test", database_url=None, rate_limit_api_rpm=1)
    app = SimpleNamespace(
        state=SimpleNamespace(
            settings=settings,
            jwt_verifier=Verifier(),
            rate_limiter=InMemoryRateLimiter(),
        )
    )
    scope = {
        "type": "http",
        "method": "GET",
        "scheme": "http",
        "path": "/v1/me",
        "query_string": b"",
        "headers": [(b"authorization", b"Bearer test-token")],
        "client": ("192.0.2.10", 1234),
        "server": ("testserver", 80),
        "http_version": "1.1",
        "app": app,
    }

    async def verify_limit() -> None:
        request = Request(scope)
        await get_current_user(request)
        with pytest.raises(OvercallError) as error:
            await get_current_user(request)
        assert error.value.code == "rate_limited"
        assert error.value.headers == {"Retry-After": "60"}

    asyncio.run(verify_limit())


def test_failed_authentication_is_throttled_per_client_ip() -> None:
    now = [0.0]

    class RejectVerifier:
        async def verify(self, _token: str) -> dict[str, str]:
            raise JWTVerificationError("invalid")

    settings = Settings(
        _env_file=None,
        app_env="test",
        database_url=None,
        rate_limit_auth_ip_rpm=1,
    )
    app = SimpleNamespace(
        state=SimpleNamespace(
            settings=settings,
            jwt_verifier=RejectVerifier(),
            rate_limiter=InMemoryRateLimiter(clock=lambda: now[0]),
        )
    )

    def request(host: str) -> Request:
        return Request(
            {
                "type": "http",
                "method": "GET",
                "scheme": "http",
                "path": "/v1/me",
                "query_string": b"",
                "headers": [(b"authorization", b"Bearer invalid")],
                "client": (host, 1234),
                "server": ("testserver", 80),
                "http_version": "1.1",
                "app": app,
            }
        )

    async def verify_limits() -> None:
        with pytest.raises(OvercallError) as first:
            await get_current_user(request("192.0.2.10"))
        assert first.value.code == "invalid_token"

        with pytest.raises(OvercallError) as throttled:
            await get_current_user(request("192.0.2.10"))
        assert throttled.value.code == "rate_limited"
        assert throttled.value.headers == {"Retry-After": "60"}

        with pytest.raises(OvercallError) as other_ip:
            await get_current_user(request("192.0.2.11"))
        assert other_ip.value.code == "invalid_token"

    asyncio.run(verify_limits())


def test_proxy_rate_limit_is_per_ingest_key_not_per_user(monkeypatch) -> None:
    user_id = uuid4()
    plaintext_keys = ["oc_" + "a" * 43, "oc_" + "b" * 43]
    pepper = "test-pepper-" + ("x" * 24)
    records = {
        hash_ingest_key(key, pepper): SimpleNamespace(
            id=uuid4(),
            user_id=user_id,
            key_hash=hash_ingest_key(key, pepper),
            revoked_at=None,
            last_used_at=None,
            pepper_version=1,
        )
        for key in plaintext_keys
    }

    class Repository:
        def __init__(self, _session) -> None:
            pass

        async def get_by_hash(self, key_hash: str):
            return records.get(key_hash)

    class Session:
        async def flush(self) -> None:
            pass

    monkeypatch.setattr(deps, "IngestKeyRepository", Repository)
    settings = Settings(
        _env_file=None,
        app_env="test",
        database_url=None,
        ingest_key_pepper=pepper,
        rate_limit_proxy_rps=1,
    )
    request = Request(
        {
            "type": "http",
            "method": "POST",
            "scheme": "http",
            "path": "/proxy/openai/v1/chat/completions",
            "query_string": b"",
            "headers": [],
            "client": ("192.0.2.10", 1234),
            "server": ("testserver", 80),
            "http_version": "1.1",
            "app": SimpleNamespace(
                state=SimpleNamespace(
                    settings=settings,
                    rate_limiter=InMemoryRateLimiter(),
                )
            ),
        }
    )
    session = Session()

    async def verify_limits() -> None:
        first = await get_ingest_key(request, plaintext=plaintext_keys[0], session=session)
        second = await get_ingest_key(request, plaintext=plaintext_keys[1], session=session)
        assert first.user_id == second.user_id == user_id
        assert first.ingest_key_id != second.ingest_key_id

        with pytest.raises(OvercallError) as error:
            await get_ingest_key(request, plaintext=plaintext_keys[0], session=session)
        assert error.value.code == "rate_limited"

    asyncio.run(verify_limits())
