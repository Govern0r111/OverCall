from __future__ import annotations

import asyncio
from collections import deque
from typing import Any

from fastapi.testclient import TestClient

from overcall.config import Settings
from overcall.main import create_app
from overcall.request_limits import RequestBodyLimitMiddleware


def _scope(headers: list[tuple[bytes, bytes]] | None = None) -> dict[str, Any]:
    return {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": "POST",
        "scheme": "http",
        "path": "/test",
        "raw_path": b"/test",
        "query_string": b"",
        "headers": headers or [],
        "client": ("127.0.0.1", 1234),
        "server": ("testserver", 80),
    }


async def _run_middleware(
    messages: list[dict[str, Any]],
    *,
    max_body_bytes: int,
    headers: list[tuple[bytes, bytes]] | None = None,
) -> tuple[list[dict[str, Any]], list[bytes]]:
    received = deque(messages)
    output: list[dict[str, Any]] = []
    forwarded: list[bytes] = []

    async def receive() -> dict[str, Any]:
        return received.popleft()

    async def send(message: dict[str, Any]) -> None:
        output.append(message)

    async def app(_scope, inner_receive, inner_send) -> None:
        while True:
            message = await inner_receive()
            if message["type"] != "http.request":
                break
            forwarded.append(message.get("body", b""))
            if not message.get("more_body", False):
                break
        await inner_send({"type": "http.response.start", "status": 200, "headers": []})
        await inner_send({"type": "http.response.body", "body": b"ok"})

    middleware = RequestBodyLimitMiddleware(app, max_body_bytes=max_body_bytes)
    await middleware(_scope(headers), receive, send)
    return output, forwarded


def test_body_limit_rejects_content_length_over_cap() -> None:
    output, forwarded = asyncio.run(
        _run_middleware(
            [{"type": "http.request", "body": b"12345", "more_body": False}],
            max_body_bytes=4,
            headers=[(b"content-length", b"5")],
        )
    )

    assert output[0]["status"] == 413
    assert b"payload_too_large" in output[1]["body"]
    assert forwarded == []


def test_body_limit_rejects_chunked_body_over_cap() -> None:
    output, forwarded = asyncio.run(
        _run_middleware(
            [
                {"type": "http.request", "body": b"ab", "more_body": True},
                {"type": "http.request", "body": b"cde", "more_body": False},
            ],
            max_body_bytes=4,
        )
    )

    assert output[0]["status"] == 413
    assert b"payload_too_large" in output[1]["body"]
    assert forwarded == [b"ab"]


def test_body_limit_replays_accepted_chunks_unchanged() -> None:
    output, forwarded = asyncio.run(
        _run_middleware(
            [
                {"type": "http.request", "body": b"ab", "more_body": True},
                {"type": "http.request", "body": b"cd", "more_body": False},
            ],
            max_body_bytes=4,
        )
    )

    assert output[0]["status"] == 200
    assert forwarded == [b"ab", b"cd"]


def test_request_body_limit_is_wired_into_the_application() -> None:
    settings = Settings(app_env="test", database_url=None, max_request_body_bytes=4)
    with TestClient(create_app(settings)) as client:
        response = client.post("/healthz", content=b"12345")

    assert response.status_code == 413
    assert response.json()["error"]["code"] == "payload_too_large"
    assert response.headers["x-overcall-request-id"]
