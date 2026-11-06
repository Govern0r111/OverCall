from __future__ import annotations

import hashlib
import hmac
import logging
import secrets
import time
from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import uuid4

import httpx
from fastapi.testclient import TestClient
from pydantic import SecretStr

from overcall import proxy
from overcall.config import Settings
from overcall.db.models import IngestKey, RequestLog
from overcall.deps import get_db_session
from overcall.main import create_app

USER_ID = uuid4()
REQUEST_SENTINEL = "request-body-sentinel-must-not-be-stored"
INGEST_KEY_PEPPER = "test-ingest-key-pepper-" + ("x" * 24)
PREVIOUS_INGEST_KEY_PEPPER = "previous-ingest-key-pepper-" + ("y" * 19)


class FakeResult:
    def __init__(self, item: object | None) -> None:
        self.item = item

    def scalar_one_or_none(self) -> object | None:
        return self.item


class FakeSession:
    def __init__(
        self,
        *,
        fail_flush: bool | str = False,
        ingest_keys: list[IngestKey] | None = None,
    ) -> None:
        self.added: list[object] = []
        self.commit_count = 0
        self.rollback_count = 0
        self.fail_flush = fail_flush
        self.flush_count = 0
        self.ingest_keys = ingest_keys or []
        self.response_sent_at: float | None = None
        self.commit_at: float | None = None

    def add(self, item: object) -> None:
        self.added.append(item)

    async def execute(self, statement) -> FakeResult:
        values = set(statement.compile().params.values())
        match = next((key for key in self.ingest_keys if key.key_hash in values), None)
        return FakeResult(match)

    async def flush(self) -> None:
        self.flush_count += 1
        if self.fail_flush and self.flush_count > 1:
            failure = (
                self.fail_flush
                if isinstance(self.fail_flush, str)
                else "simulated database failure"
            )
            raise RuntimeError(failure)

    async def commit(self) -> None:
        self.commit_count += 1
        self.commit_at = time.perf_counter()

    async def rollback(self) -> None:
        self.rollback_count += 1


class FakeRequestLogRepositorySettings:
    def __init__(self, _session, _user_id) -> None:
        pass

    async def get(self):
        return SimpleNamespace(upstream_mode="mock")


class FakeUpstreamClient:
    def __init__(self, response: httpx.Response) -> None:
        self.response = response
        self.request_args: tuple | None = None

    async def request(self, method: str, url: str, **kwargs) -> httpx.Response:
        self.request_args = (method, url, kwargs)
        return self.response


def _client(
    session: FakeSession,
    settings: Settings | None = None,
    *,
    observe_response: bool = False,
) -> TestClient:
    app = create_app(
        settings
        or Settings(
            app_env="test",
            database_url=None,
            release="test",
            ingest_key_pepper=SecretStr(INGEST_KEY_PEPPER),
        )
    )

    async def db_session():
        yield session

    app.dependency_overrides[get_db_session] = db_session
    if observe_response:
        fastapi_app = app

        async def record_response(scope, receive, send) -> None:
            async def record_send(message) -> None:
                await send(message)
                if (
                    scope["type"] == "http"
                    and message["type"] == "http.response.body"
                    and not message.get("more_body", False)
                ):
                    session.response_sent_at = time.perf_counter()

            await fastapi_app(scope, receive, record_send)

        app = record_response
    return TestClient(app)


def _seed_key(
    session: FakeSession,
    *,
    pepper: str = INGEST_KEY_PEPPER,
    revoked_at: datetime | None = None,
) -> tuple[str, IngestKey]:
    plaintext = "oc_" + secrets.token_urlsafe(32)
    key_hash = hmac.new(pepper.encode(), plaintext.encode(), hashlib.sha256).hexdigest()
    row = IngestKey(
        id=uuid4(),
        user_id=USER_ID,
        name="integration test",
        prefix=plaintext[:9],
        key_hash=key_hash,
        revoked_at=revoked_at,
    )
    session.ingest_keys.append(row)
    return plaintext, row


def test_proxy_returns_upstream_bytes_and_persists_metadata_only(monkeypatch, caplog) -> None:
    session = FakeSession()
    ingest_key, ingest_key_row = _seed_key(session)
    request_body = (
        '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"'
        + REQUEST_SENTINEL
        + ' sk_test_1234567890ABCDEF"}]}'
    ).encode()
    upstream_body = (
        b'{"model":"gpt-4o-mini","usage":{"prompt_tokens":12,"completion_tokens":4},'
        b'"choices":[],"echo":"response-body-sentinel sk-proj-abcdefghijklmnop1234"}'
    )
    upstream = FakeUpstreamClient(
        httpx.Response(207, content=upstream_body, headers={"x-upstream-id": "up_123"})
    )
    monkeypatch.setattr(proxy, "mock_client", upstream)
    monkeypatch.setattr(proxy, "UserSettingsRepository", FakeRequestLogRepositorySettings)

    caplog.set_level(logging.WARNING, logger="overcall.proxy")
    with _client(session, observe_response=True) as client:
        response = client.post(
            "/proxy/openai/v1/chat/completions",
            content=request_body,
            headers={
                "authorization": "Bearer provider-secret",
                "content-type": "application/json",
                "x-overcall-caller": "checkout",
                "x-overcall-key": ingest_key,
                "x-forwarded-for": "192.0.2.1",
            },
        )

    assert response.status_code == 207
    assert response.content == upstream_body
    assert response.headers["x-upstream-id"] == "up_123"
    assert response.headers["x-overcall-request-id"]
    assert upstream.request_args is not None
    method, url, forwarded = upstream.request_args
    assert (method, url) == ("POST", "/v1/chat/completions")
    assert forwarded["content"] == request_body
    assert "authorization" not in forwarded["headers"]
    assert "x-overcall-key" not in forwarded["headers"]
    assert "x-forwarded-for" not in forwarded["headers"]

    assert len(session.added) == 1
    row = session.added[0]
    assert isinstance(row, RequestLog)
    assert row.user_id == USER_ID
    assert row.ingest_key_id == ingest_key_row.id
    assert row.source == "proxy"
    assert row.origin == "upstream"
    assert row.endpoint == "/v1/chat/completions"
    assert row.status == 207
    assert row.req_size == len(request_body)
    assert row.resp_size == len(upstream_body)
    assert row.prompt_tokens == 12
    assert row.completion_tokens == 4
    assert row.cost_basis == "billed"
    assert row.cost_usd >= 0
    assert row.pricing_version
    assert session.commit_count == 1
    row_text = repr(row.model_dump())
    for sensitive_value in (
        REQUEST_SENTINEL,
        "response-body-sentinel",
        "sk_test_1234567890ABCDEF",
        "sk-proj-abcdefghijklmnop1234",
        ingest_key,
    ):
        assert sensitive_value not in row_text
        assert sensitive_value not in caplog.text
    assert ingest_key_row.last_used_at is not None
    assert session.response_sent_at is not None
    assert session.commit_at is not None
    assert 0 <= session.commit_at - session.response_sent_at < 2


def test_proxy_reaches_mock_upstream_in_process(monkeypatch) -> None:
    session = FakeSession()
    ingest_key, _ = _seed_key(session)
    monkeypatch.setattr(proxy, "UserSettingsRepository", FakeRequestLogRepositorySettings)

    with _client(session) as client:
        response = client.post(
            "/proxy/openai/v1/chat/completions",
            json={
                "model": "gpt-4o-mini",
                "messages": [{"role": "user", "content": "local mock request"}],
            },
            headers={"content-type": "application/json", "x-overcall-key": ingest_key},
        )

    assert response.status_code == 200
    assert response.json()["object"] == "chat.completion"
    assert response.json()["choices"][0]["message"]["content"]
    assert len(session.added) == 1
    assert session.added[0].source == "proxy"


def test_proxy_logging_failure_does_not_change_upstream_response(monkeypatch, caplog) -> None:
    failure_secret = "sk_test_1234567890ABCDEF"
    session = FakeSession(fail_flush=f"simulated database failure token={failure_secret}")
    ingest_key, _ = _seed_key(session)
    upstream_body = b'{"error":"upstream response"}'
    upstream = FakeUpstreamClient(httpx.Response(503, content=upstream_body))
    monkeypatch.setattr(proxy, "mock_client", upstream)
    monkeypatch.setattr(proxy, "UserSettingsRepository", FakeRequestLogRepositorySettings)

    caplog.set_level(logging.WARNING, logger="overcall.proxy")
    with _client(session) as client:
        response = client.get("/proxy/openai/v1/models", headers={"x-overcall-key": ingest_key})

    assert response.status_code == 503
    assert response.content == upstream_body
    assert session.rollback_count == 1
    assert session.commit_count == 0
    assert failure_secret not in caplog.text
    assert failure_secret not in response.text
    assert "proxy_log_write_failed" in caplog.text


def test_proxy_log_preparation_exception_is_redacted_and_upstream_response_is_preserved(
    monkeypatch, caplog
) -> None:
    session = FakeSession()
    ingest_key, _ = _seed_key(session)
    upstream_body = b'{"model":"gpt-4o-mini","usage":{"prompt_tokens":2,"completion_tokens":1}}'
    upstream = FakeUpstreamClient(httpx.Response(207, content=upstream_body))
    preparation_secret = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature12345678"

    def fail_cost_calculation(*_args, **_kwargs):
        raise RuntimeError(f"token={preparation_secret}")

    monkeypatch.setattr(proxy, "mock_client", upstream)
    monkeypatch.setattr(proxy, "calculate_cost", fail_cost_calculation)
    monkeypatch.setattr(proxy, "UserSettingsRepository", FakeRequestLogRepositorySettings)

    caplog.set_level(logging.WARNING, logger="overcall.proxy")
    with _client(session) as client:
        response = client.get("/proxy/openai/v1/models", headers={"x-overcall-key": ingest_key})

    assert response.status_code == 207
    assert response.content == upstream_body
    assert session.added == []
    assert preparation_secret not in caplog.text
    assert preparation_secret not in response.text
    assert "proxy_log_prepare_failed" in caplog.text


def test_proxy_upstream_error_body_is_not_persisted_or_logged(monkeypatch, caplog) -> None:
    session = FakeSession()
    ingest_key, _ = _seed_key(session)
    error_secret = "sk_test_1234567890ABCDEF"
    upstream_body = f'{{"error":"upstream rejected token={error_secret}"}}'.encode()
    upstream = FakeUpstreamClient(httpx.Response(503, content=upstream_body))
    monkeypatch.setattr(proxy, "mock_client", upstream)
    monkeypatch.setattr(proxy, "UserSettingsRepository", FakeRequestLogRepositorySettings)

    caplog.set_level(logging.WARNING, logger="overcall.proxy")
    with _client(session) as client:
        response = client.get("/proxy/openai/v1/models", headers={"x-overcall-key": ingest_key})

    assert response.status_code == 503
    assert response.content == upstream_body
    assert len(session.added) == 1
    log_text = repr(session.added[0].model_dump())
    assert error_secret not in log_text
    assert error_secret not in caplog.text


def test_malformed_upstream_metadata_does_not_change_upstream_response(monkeypatch) -> None:
    session = FakeSession()
    ingest_key, _ = _seed_key(session)
    upstream_body = b'{"usage":"unexpected","echo":"response-body-sentinel"}'
    upstream = FakeUpstreamClient(httpx.Response(200, content=upstream_body))
    monkeypatch.setattr(proxy, "mock_client", upstream)
    monkeypatch.setattr(proxy, "UserSettingsRepository", FakeRequestLogRepositorySettings)

    with _client(session) as client:
        response = client.get("/proxy/openai/v1/models", headers={"x-overcall-key": ingest_key})

    assert response.status_code == 200
    assert response.content == upstream_body
    assert len(session.added) == 1
    assert "response-body-sentinel" not in repr(session.added[0].model_dump())


def test_proxy_rejects_missing_ingest_key() -> None:
    app = create_app(
        Settings(
            app_env="test",
            database_url=None,
            release="test",
            ingest_key_pepper=SecretStr(INGEST_KEY_PEPPER),
        )
    )
    with TestClient(app) as client:
        response = client.get("/proxy/openai/v1/models")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "ingest_key_missing"


def test_proxy_rejects_unknown_ingest_key_before_forwarding(monkeypatch) -> None:
    session = FakeSession()
    upstream = FakeUpstreamClient(httpx.Response(200, content=b"should not be called"))
    monkeypatch.setattr(proxy, "mock_client", upstream)

    with _client(session) as client:
        response = client.get(
            "/proxy/openai/v1/models",
            headers={"x-overcall-key": "oc_" + ("a" * 43)},
        )

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "ingest_key_invalid"
    assert upstream.request_args is None
    assert session.added == []


def test_proxy_rejects_ingest_key_when_pepper_is_unconfigured(monkeypatch) -> None:
    session = FakeSession()
    ingest_key, _ = _seed_key(session)
    upstream = FakeUpstreamClient(httpx.Response(200, content=b"should not be called"))
    monkeypatch.setattr(proxy, "mock_client", upstream)
    settings = Settings(app_env="test", database_url=None, release="test")

    with _client(session, settings) as client:
        response = client.get("/proxy/openai/v1/models", headers={"x-overcall-key": ingest_key})

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "ingest_key_invalid"
    assert upstream.request_args is None
    assert session.flush_count == 0


def test_proxy_rejects_revoked_ingest_key_before_forwarding(monkeypatch) -> None:
    session = FakeSession()
    ingest_key, _ = _seed_key(session, revoked_at=datetime.now(UTC))
    upstream = FakeUpstreamClient(httpx.Response(200, content=b"should not be called"))
    monkeypatch.setattr(proxy, "mock_client", upstream)

    with _client(session) as client:
        response = client.get("/proxy/openai/v1/models", headers={"x-overcall-key": ingest_key})

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "ingest_key_revoked"
    assert upstream.request_args is None
    assert session.added == []


def test_proxy_rehashes_previous_pepper_key_on_success(monkeypatch) -> None:
    session = FakeSession()
    ingest_key, row = _seed_key(session, pepper=PREVIOUS_INGEST_KEY_PEPPER)
    previous_hash = row.key_hash
    monkeypatch.setattr(proxy, "UserSettingsRepository", FakeRequestLogRepositorySettings)
    settings = Settings(
        app_env="test",
        database_url=None,
        release="test",
        ingest_key_pepper=SecretStr(INGEST_KEY_PEPPER),
        ingest_key_pepper_prev=SecretStr(PREVIOUS_INGEST_KEY_PEPPER),
    )

    with _client(session, settings) as client:
        response = client.get("/proxy/openai/v1/models", headers={"x-overcall-key": ingest_key})

    assert response.status_code == 200
    assert row.key_hash != previous_hash
    assert (
        row.key_hash
        == hmac.new(INGEST_KEY_PEPPER.encode(), ingest_key.encode(), hashlib.sha256).hexdigest()
    )
    assert row.pepper_version == 1
    assert row.last_used_at is not None
