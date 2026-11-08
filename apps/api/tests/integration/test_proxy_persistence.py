from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import json
import logging
import random
import secrets
import string
import time
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from types import SimpleNamespace
from urllib.parse import quote
from uuid import uuid4

import httpx
import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from overcall import proxy
from overcall.config import Settings
from overcall.db.models import IngestKey, RequestLog
from overcall.deps import get_db_session
from overcall.main import create_app

USER_ID = uuid4()
REQUEST_SENTINEL = "request-body-sentinel-must-not-be-stored"
TEST_OPENAI_KEY = "sk" + "_test_1234567890ABCDEF"
TEST_OPENAI_PROJECT_KEY = "sk" + "-proj-abcdefghijklmnop1234"
INGEST_KEY_PEPPER = "test-ingest-key-pepper-" + ("x" * 24)
PREVIOUS_INGEST_KEY_PEPPER = "previous-ingest-key-pepper-" + ("y" * 19)


def _credential_fuzz_corpus() -> tuple[str, ...]:
    generator = random.Random(20261108)
    alphabet = string.ascii_letters + string.digits

    def segment(length: int) -> str:
        return "".join(generator.choices(alphabet, k=length))

    return (
        "sk-live-" + segment(32),
        "sk-proj-" + segment(32),
        "oc_" + segment(36),
        "eyJ" + segment(16) + "." + segment(16) + "." + segment(16),
    )


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


class FakeSessionContext:
    def __init__(self, session: FakeSession) -> None:
        self.session = session

    async def __aenter__(self) -> FakeSession:
        return self.session

    async def __aexit__(self, *_args) -> None:
        return None


class FakeEngine:
    async def dispose(self) -> None:
        return None


class FakeRequestLogRepositorySettings:
    def __init__(self, _session, _user_id) -> None:
        pass

    async def get(self):
        return SimpleNamespace(upstream_mode="mock")


class FakeUpstreamClient:
    def __init__(self, response: httpx.Response) -> None:
        self.response = response
        self.request_args: tuple | None = None

    @asynccontextmanager
    async def stream(self, method: str, url: str, **kwargs):
        self.request_args = (method, url, kwargs)
        try:
            yield self.response
        finally:
            await self.response.aclose()


class TrackingByteStream(httpx.AsyncByteStream):
    def __init__(
        self,
        chunks: list[bytes],
        *,
        fail_after_chunks: int | None = None,
        delay_after_first_chunk: float = 0,
    ) -> None:
        self.chunks = chunks
        self.fail_after_chunks = fail_after_chunks
        self.delay_after_first_chunk = delay_after_first_chunk
        self.yield_count = 0
        self.closed = False

    async def __aiter__(self):
        for index, chunk in enumerate(self.chunks):
            if index == 1 and self.delay_after_first_chunk:
                await asyncio.sleep(self.delay_after_first_chunk)
            if self.fail_after_chunks == index:
                request = httpx.Request("POST", "http://upstream/v1/chat/completions")
                raise httpx.ReadError("upstream stream ended unexpectedly", request=request)
            self.yield_count += 1
            yield chunk
        if self.fail_after_chunks == len(self.chunks):
            request = httpx.Request("POST", "http://upstream/v1/chat/completions")
            raise httpx.ReadError("upstream stream ended unexpectedly", request=request)

    async def aclose(self) -> None:
        self.closed = True


def _client(
    session: FakeSession,
    settings: Settings | None = None,
    *,
    observe_response: bool = False,
    engine: object | None = None,
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
    if engine is not None:
        app.state.engine = engine
    fastapi_app = app

    async def db_session():
        if engine is not None:
            fastapi_app.state.engine = engine
        yield session

    app.dependency_overrides[get_db_session] = db_session
    if observe_response:

        async def record_response(scope, receive, send) -> None:
            disconnect_event = asyncio.Event()

            async def record_receive():
                if disconnect_event.is_set():
                    return {"type": "http.disconnect"}
                receive_task = asyncio.create_task(receive())
                disconnect_task = asyncio.create_task(disconnect_event.wait())
                done, pending = await asyncio.wait(
                    {receive_task, disconnect_task}, return_when=asyncio.FIRST_COMPLETED
                )
                for task in pending:
                    task.cancel()
                if pending:
                    await asyncio.gather(*pending, return_exceptions=True)
                if disconnect_task in done:
                    return {"type": "http.disconnect"}
                return receive_task.result()

            async def record_send(message) -> None:
                upstream_stream = getattr(session, "upstream_stream", None)
                upstream_yield_count = (
                    upstream_stream.yield_count if upstream_stream is not None else None
                )
                await send(message)
                if scope["type"] == "http" and message["type"] == "http.response.body":
                    if message.get("body"):
                        session.response_body_chunks = (
                            getattr(session, "response_body_chunks", 0) + 1
                        )
                        if upstream_yield_count is not None:
                            session.response_chunk_upstream_counts = getattr(
                                session, "response_chunk_upstream_counts", []
                            )
                            session.response_chunk_upstream_counts.append(
                                upstream_yield_count
                            )
                        if (
                            getattr(session, "disconnect_after_first_chunk", False)
                            and session.response_body_chunks == 1
                        ):
                            disconnect_event.set()
                    if not message.get("more_body", False):
                        session.response_sent_at = time.perf_counter()

            await fastapi_app(scope, record_receive, record_send)

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
        + f" {TEST_OPENAI_KEY}" + '"}]}'
    ).encode()
    upstream_body = (
        b'{"model":"gpt-4o-mini","usage":{"prompt_tokens":12,"completion_tokens":4},'
        b'"choices":[],"echo":"response-body-sentinel '
        + TEST_OPENAI_PROJECT_KEY.encode()
        + b'"}'
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
        TEST_OPENAI_KEY,
        TEST_OPENAI_PROJECT_KEY,
        ingest_key,
    ):
        assert sensitive_value not in row_text
        assert sensitive_value not in caplog.text
    assert ingest_key_row.last_used_at is not None
    assert session.response_sent_at is not None
    assert session.commit_at is not None
    assert 0 <= session.commit_at - session.response_sent_at < 2


def test_proxy_streams_non_sse_response_above_buffer_limit(monkeypatch) -> None:
    session = FakeSession()
    ingest_key, _ = _seed_key(session)
    chunks = [b"first-", b"second-", b"third"]
    byte_stream = TrackingByteStream(chunks)
    session.upstream_stream = byte_stream
    response = httpx.Response(
        200,
        headers={"content-type": "application/octet-stream"},
        stream=byte_stream,
        request=httpx.Request("GET", "http://upstream/v1/files"),
    )
    monkeypatch.setattr(proxy, "mock_client", FakeUpstreamClient(response))
    monkeypatch.setattr(proxy, "UserSettingsRepository", FakeRequestLogRepositorySettings)
    settings = Settings(
        app_env="test",
        database_url=None,
        release="test",
        ingest_key_pepper=SecretStr(INGEST_KEY_PEPPER),
        max_response_buffer_bytes=4,
    )

    with _client(session, settings, observe_response=True) as client:
        result = client.get(
            "/proxy/openai/v1/files",
            headers={"x-overcall-key": ingest_key},
        )

    assert result.status_code == 200
    assert result.content == b"".join(chunks)
    upstream_counts = session.response_chunk_upstream_counts
    assert upstream_counts[0] == 1
    assert upstream_counts[-1] == len(chunks)
    assert any(count < len(chunks) for count in upstream_counts)
    assert byte_stream.closed
    assert len(session.added) == 1
    log = session.added[0]
    assert isinstance(log, RequestLog)
    assert log.stream is True
    assert log.resp_size == sum(map(len, chunks))


def test_proxy_does_not_persist_encoded_credentials_from_path(monkeypatch, caplog) -> None:
    session = FakeSession()
    ingest_key, _ = _seed_key(session)
    secret = "sk" + "_live_" + ("A" * 32)
    authorization = "Bearer " + secret
    encoded_secret = base64.urlsafe_b64encode(secret.encode()).decode().rstrip("=")
    encoded_query_secret = quote(f"token={secret} /", safe="")
    body = json.dumps({"token": secret}).encode()
    response = httpx.Response(
        200,
        content=b"ok",
        request=httpx.Request("GET", "http://upstream/v1/files"),
    )
    monkeypatch.setattr(proxy, "mock_client", FakeUpstreamClient(response))
    monkeypatch.setattr(proxy, "UserSettingsRepository", FakeRequestLogRepositorySettings)

    with _client(session) as client:
        result = client.post(
            f"/proxy/openai/v1/files/{encoded_secret}?credential={encoded_query_secret}",
            content=body,
            headers={
                "x-overcall-key": ingest_key,
                "authorization": authorization,
                "content-type": "application/json",
            },
        )

    assert result.status_code == 200
    assert len(session.added) == 1
    log = session.added[0]
    assert isinstance(log, RequestLog)
    assert log.endpoint == "/v1/files/{id}"
    assert secret not in repr(log.model_dump())
    assert encoded_secret not in repr(log.model_dump())
    assert encoded_query_secret not in repr(log.model_dump())
    assert secret not in caplog.text
    assert encoded_secret not in caplog.text
    assert encoded_query_secret not in caplog.text


@pytest.mark.parametrize(
    "failure_mode,expected_status",
    [
        ("success", 200),
        ("upstream_http_error", 503),
        ("upstream_unreachable", 502),
        ("upstream_timeout", 502),
    ],
)
@pytest.mark.parametrize(
    "secret",
    _credential_fuzz_corpus(),
    ids=("live-key", "project-key", "ingest-key", "jwt"),
)
def test_proxy_redaction_survives_randomized_credentials_on_success_and_upstream_errors(
    monkeypatch, caplog, failure_mode: str, expected_status: int, secret: str
) -> None:
    session = FakeSession()
    ingest_key, _ = _seed_key(session)
    encoded_path_secret = base64.urlsafe_b64encode(secret.encode()).decode().rstrip("=")
    encoded_query_secret = quote(f"token={secret} /", safe="")
    malformed_body = b'{"token":"' + secret.encode()

    if failure_mode in {"upstream_unreachable", "upstream_timeout"}:
        class FailingStream:
            async def __aenter__(self):
                request = httpx.Request("POST", "http://mock-llm/v1/files")
                if failure_mode == "upstream_timeout":
                    raise httpx.ReadTimeout(f"timed out forwarding {secret}", request=request)
                raise httpx.ConnectError(f"failed to forward {secret}", request=request)

            async def __aexit__(self, *_args):
                return None

        class FailingUpstreamClient:
            def stream(self, *_args, **_kwargs):
                return FailingStream()

        upstream = FailingUpstreamClient()
    else:
        status = 200 if failure_mode == "success" else 503
        response_body = b"ok" if status == 200 else json.dumps({"error": secret}).encode()
        upstream = FakeUpstreamClient(httpx.Response(status, content=response_body))

    monkeypatch.setattr(proxy, "mock_client", upstream)
    monkeypatch.setattr(proxy, "UserSettingsRepository", FakeRequestLogRepositorySettings)
    caplog.set_level(logging.WARNING, logger="overcall.proxy")

    with _client(session) as client:
        response = client.post(
            f"/proxy/openai/v1/files/{encoded_path_secret}?credential={encoded_query_secret}",
            content=malformed_body,
            headers={
                "x-overcall-key": ingest_key,
                "authorization": f"Bearer {secret}",
                "x-overcall-caller": secret,
                "content-type": "application/json",
            },
        )

    assert response.status_code == expected_status
    assert len(session.added) == 1
    log = session.added[0]
    assert isinstance(log, RequestLog)
    assert log.endpoint == "/v1/files/{id}"
    assert log.caller is None
    persisted = repr(log.model_dump()) + repr([key.model_dump() for key in session.ingest_keys])
    if failure_mode in {"upstream_unreachable", "upstream_timeout"}:
        assert secret not in response.text
    for value in (secret, encoded_path_secret, encoded_query_secret, f"Bearer {secret}"):
        assert value not in persisted
        assert value not in caplog.text


@pytest.mark.parametrize(
    "secret",
    _credential_fuzz_corpus(),
    ids=("live-key", "project-key", "ingest-key", "jwt"),
)
def test_oversized_secret_body_is_rejected_without_persistence_or_logging(
    caplog, secret: str
) -> None:
    session = FakeSession()
    ingest_key, _ = _seed_key(session)
    settings = Settings(
        app_env="test",
        database_url=None,
        release="test",
        ingest_key_pepper=SecretStr(INGEST_KEY_PEPPER),
        max_request_body_bytes=64,
    )
    encoded_path_secret = base64.urlsafe_b64encode(secret.encode()).decode().rstrip("=")
    caplog.set_level(logging.WARNING)

    with _client(session, settings) as client:
        response = client.post(
            f"/proxy/openai/v1/files/{encoded_path_secret}",
            content=(secret + ("x" * 128)).encode(),
            headers={"x-overcall-key": ingest_key},
        )

    assert response.status_code == 413
    assert session.added == []
    assert secret not in caplog.text
    assert encoded_path_secret not in caplog.text


def test_proxy_preserves_a_valid_caller_label(monkeypatch) -> None:
    session = FakeSession()
    ingest_key, _ = _seed_key(session)
    monkeypatch.setattr(
        proxy,
        "mock_client",
        FakeUpstreamClient(httpx.Response(200, content=b"ok")),
    )
    monkeypatch.setattr(proxy, "UserSettingsRepository", FakeRequestLogRepositorySettings)

    with _client(session) as client:
        response = client.post(
            "/proxy/openai/v1/files",
            content=b"{}",
            headers={"x-overcall-key": ingest_key, "x-overcall-caller": "checkout"},
        )

    assert response.status_code == 200
    assert len(session.added) == 1
    log = session.added[0]
    assert isinstance(log, RequestLog)
    assert log.caller == "checkout"


def test_proxy_limits_concurrent_upstream_requests(monkeypatch) -> None:
    session = FakeSession()
    ingest_key, _ = _seed_key(session)

    class ConcurrentUpstreamClient:
        def __init__(self) -> None:
            self.active = 0
            self.max_active = 0

        @asynccontextmanager
        async def stream(self, method: str, url: str, **_kwargs):
            self.active += 1
            self.max_active = max(self.max_active, self.active)
            try:
                await asyncio.sleep(0.05)
                yield httpx.Response(
                    200,
                    content=b"ok",
                    request=httpx.Request(method, f"http://upstream{url}"),
                )
            finally:
                self.active -= 1

    upstream = ConcurrentUpstreamClient()
    monkeypatch.setattr(proxy, "mock_client", upstream)
    monkeypatch.setattr(proxy, "UserSettingsRepository", FakeRequestLogRepositorySettings)
    settings = Settings(
        _env_file=None,
        app_env="test",
        database_url=None,
        release="test",
        ingest_key_pepper=SecretStr(INGEST_KEY_PEPPER),
        max_inflight=1,
        rate_limit_proxy_rps=50,
    )
    app = create_app(settings)

    async def db_session():
        yield session

    app.dependency_overrides[get_db_session] = db_session

    async def make_requests() -> None:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://testserver",
        ) as client:
            responses = await asyncio.gather(
                *(
                    client.get(
                        "/proxy/openai/v1/files",
                        headers={"x-overcall-key": ingest_key},
                    )
                    for _ in range(2)
                )
            )
        assert sorted(response.status_code for response in responses) == [200, 503]
        overloaded = next(response for response in responses if response.status_code == 503)
        assert overloaded.json()["error"]["code"] == "overloaded"
        assert overloaded.headers["retry-after"] == "1"
        assert (
            overloaded.headers["x-overcall-request-id"]
            == overloaded.json()["error"]["request_id"]
        )

    asyncio.run(make_requests())
    assert upstream.max_active == 1


def _streaming_response(
    chunks: list[bytes],
    *,
    fail_after_chunks: int | None = None,
    delay_after_first_chunk: float = 0,
) -> tuple[httpx.Response, TrackingByteStream]:
    stream = TrackingByteStream(
        chunks,
        fail_after_chunks=fail_after_chunks,
        delay_after_first_chunk=delay_after_first_chunk,
    )
    response = httpx.Response(
        206,
        headers={
            "content-type": "text/event-stream",
            "x-upstream-id": "up_stream_123",
        },
        stream=stream,
        request=httpx.Request("POST", "http://upstream/v1/chat/completions"),
    )
    return response, stream


def _stream_request(
    client: TestClient,
    ingest_key: str,
    *,
    accept_event_stream: bool = True,
    extra_headers: dict[str, str] | None = None,
) -> httpx.Response:
    headers = {
        "content-type": "application/json",
        "x-overcall-key": ingest_key,
    }
    if accept_event_stream:
        headers["accept"] = "text/event-stream"
    headers.update(extra_headers or {})
    return client.post(
        "/proxy/openai/v1/chat/completions",
        content=b'{"model":"gpt-4o-mini","messages":[{"role":"user","content":"stream"}]}',
        headers=headers,
    )


def test_proxy_streams_sse_chunks_as_received_and_closes_upstream(monkeypatch) -> None:
    session = FakeSession()
    log_session = FakeSession()
    engine = FakeEngine()
    ingest_key, _ = _seed_key(session)
    chunks = [b"data: first\n\n", b"data: second\n\n"]
    response, byte_stream = _streaming_response(chunks)
    upstream = FakeUpstreamClient(response)
    session.upstream_stream = byte_stream
    monkeypatch.setattr(proxy, "mock_client", upstream)
    monkeypatch.setattr(proxy, "UserSettingsRepository", FakeRequestLogRepositorySettings)
    monkeypatch.setattr(
        proxy,
        "AsyncSession",
        lambda passed_engine, **_kwargs: (
            FakeSessionContext(log_session) if passed_engine is engine else None
        ),
    )

    with _client(session, observe_response=True, engine=engine) as client:
        result = _stream_request(client, ingest_key)

    assert result.status_code == 206
    assert result.content == b"".join(chunks)
    assert result.headers["content-type"] == "text/event-stream"
    assert result.headers["x-upstream-id"] == "up_stream_123"
    assert result.headers["cache-control"] == "no-cache"
    assert result.headers["x-accel-buffering"] == "no"
    assert upstream.request_args is not None
    assert upstream.request_args[2]["headers"]["accept"] == "text/event-stream"
    assert session.response_chunk_upstream_counts == [1, 2]
    assert byte_stream.closed
    assert session.added == []
    assert len(log_session.added) == 1
    row = log_session.added[0]
    assert isinstance(row, RequestLog)
    assert row.stream is True
    assert row.status == 206
    assert row.resp_size == sum(map(len, chunks))
    assert row.ttfb_ms is not None
    assert row.error_code is None
    assert log_session.commit_count == 1


def test_proxy_stream_extracts_usage_from_final_sse_event(monkeypatch) -> None:
    session = FakeSession()
    ingest_key, _ = _seed_key(session)
    chunks = [
        b'data: {"choices":[{"index":0,"delta":{"content":"hello"}}]}\n\n',
        b'data: {"choices":[],"usage":{"prompt_tokens":12,"completion_tokens":4,'
        b'"prompt_tokens_details":{"cached_tokens":3}}}\n\n',
        b"data: [DONE]\n\n",
    ]
    response, _ = _streaming_response(chunks)
    monkeypatch.setattr(proxy, "mock_client", FakeUpstreamClient(response))
    monkeypatch.setattr(proxy, "UserSettingsRepository", FakeRequestLogRepositorySettings)

    with _client(session) as client:
        result = _stream_request(client, ingest_key)

    assert result.content == b"".join(chunks)
    assert len(session.added) == 1
    log = session.added[0]
    assert isinstance(log, RequestLog)
    assert log.prompt_tokens == 12
    assert log.completion_tokens == 4
    assert log.cached_prompt_tokens == 3
    assert log.tokens_estimated is False
    assert log.cost_basis == "billed"


def test_proxy_estimates_tokens_when_stream_has_no_usage_event(monkeypatch) -> None:
    session = FakeSession()
    ingest_key, _ = _seed_key(session)
    chunks = [
        b'data: {"choices":[{"index":0,"delta":{"content":"a generated response"}}]}\n\n',
        b"data: [DONE]\n\n",
    ]
    response, _ = _streaming_response(chunks)
    monkeypatch.setattr(proxy, "mock_client", FakeUpstreamClient(response))
    monkeypatch.setattr(proxy, "UserSettingsRepository", FakeRequestLogRepositorySettings)

    with _client(session) as client:
        _stream_request(client, ingest_key)

    assert len(session.added) == 1
    log = session.added[0]
    assert isinstance(log, RequestLog)
    assert log.prompt_tokens > 0
    assert log.completion_tokens > 0
    assert log.tokens_estimated is True
    assert log.cost_basis == "estimated"


def test_proxy_detects_sse_from_response_content_type(monkeypatch) -> None:
    session = FakeSession()
    ingest_key, _ = _seed_key(session)
    chunks = [b"data: response-selected-stream\n\n"]
    response, byte_stream = _streaming_response(chunks)
    upstream = FakeUpstreamClient(response)
    monkeypatch.setattr(proxy, "mock_client", upstream)
    monkeypatch.setattr(proxy, "UserSettingsRepository", FakeRequestLogRepositorySettings)

    with _client(session) as client:
        result = _stream_request(client, ingest_key, accept_event_stream=False)

    assert result.status_code == 206
    assert result.content == chunks[0]
    assert upstream.request_args is not None
    assert upstream.request_args[2]["headers"]["accept"] == "*/*"
    assert len(session.added) == 1
    assert session.added[0].stream is True
    assert byte_stream.closed


def test_proxy_sse_client_disconnect_closes_upstream_and_logs_in_finally(
    monkeypatch, caplog
) -> None:
    session = FakeSession()
    session.disconnect_after_first_chunk = True
    ingest_key, _ = _seed_key(session)
    caller_secret = TEST_OPENAI_PROJECT_KEY
    chunks = [b"data: first\n\n", b"data: second\n\n"]
    response, byte_stream = _streaming_response(chunks, delay_after_first_chunk=0.25)
    upstream = FakeUpstreamClient(response)
    monkeypatch.setattr(proxy, "mock_client", upstream)
    monkeypatch.setattr(proxy, "UserSettingsRepository", FakeRequestLogRepositorySettings)
    caplog.set_level(logging.WARNING, logger="overcall.proxy")

    with _client(session, observe_response=True) as client:
        result = _stream_request(
            client,
            ingest_key,
            extra_headers={"x-overcall-caller": caller_secret},
        )

    assert result.status_code == 206
    assert result.content == chunks[0]
    assert byte_stream.closed
    assert len(session.added) == 1
    row = session.added[0]
    assert isinstance(row, RequestLog)
    assert row.stream is True
    assert row.status == 206
    assert row.resp_size == len(chunks[0])
    assert row.error_code == "client_disconnected"
    assert row.caller is None
    assert caller_secret not in repr(row.model_dump())
    assert caller_secret not in caplog.text
    assert session.commit_count == 1


def test_proxy_sse_upstream_drop_closes_and_logs_partial_stream(monkeypatch) -> None:
    session = FakeSession()
    ingest_key, _ = _seed_key(session)
    chunks = [b"data: first\n\n", b"data: second\n\n"]
    response, byte_stream = _streaming_response(chunks, fail_after_chunks=1)
    upstream = FakeUpstreamClient(response)
    monkeypatch.setattr(proxy, "mock_client", upstream)
    monkeypatch.setattr(proxy, "UserSettingsRepository", FakeRequestLogRepositorySettings)

    with _client(session, observe_response=True) as client:
        result = _stream_request(client, ingest_key)

    assert result.status_code == 206
    assert result.content == chunks[0]
    assert byte_stream.closed
    assert len(session.added) == 1
    row = session.added[0]
    assert isinstance(row, RequestLog)
    assert row.stream is True
    assert row.resp_size == len(chunks[0])
    assert row.error_code == "upstream_dropped"
    assert session.commit_count == 1


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
    failure_secret = TEST_OPENAI_KEY
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
    preparation_secret = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature12345678"  # gitleaks:allow
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
    error_secret = TEST_OPENAI_KEY
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
