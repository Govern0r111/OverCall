from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

from fastapi.responses import JSONResponse

from .logging import get_request_id

PAYLOAD_TOO_LARGE = {
    "error": {
        "code": "payload_too_large",
        "message": "The request is larger than the configured limit.",
    }
}


class RequestBodyLimitMiddleware:
    """Reject oversized request bodies without copying them into middleware buffers."""

    def __init__(self, app, *, max_body_bytes: int) -> None:
        self.app = app
        self.max_body_bytes = max_body_bytes

    async def __call__(
        self,
        scope: dict[str, Any],
        receive: Callable[[], Awaitable[dict[str, Any]]],
        send: Callable[[dict[str, Any]], Awaitable[None]],
    ) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        for name, value in scope.get("headers", []):
            if name.lower() == b"content-length":
                try:
                    declared_length = int(value)
                except ValueError:
                    break
                if declared_length > self.max_body_bytes:
                    await self._reject(scope, receive, send)
                    return
                break

        body_size = 0
        too_large = False
        response_started = False

        async def limited_receive() -> dict[str, Any]:
            nonlocal body_size, too_large
            message = await receive()
            if message["type"] == "http.request":
                body_size += len(message.get("body", b""))
                if body_size > self.max_body_bytes:
                    too_large = True
                    raise _RequestBodyTooLarge
            return message

        async def guarded_send(message: dict[str, Any]) -> None:
            nonlocal response_started
            if too_large:
                return
            if message["type"] == "http.response.start":
                response_started = True
            await send(message)

        try:
            await self.app(scope, limited_receive, guarded_send)
        except _RequestBodyTooLarge:
            pass

        if too_large and not response_started:
            await self._reject(scope, receive, send)

    @staticmethod
    async def _reject(scope, receive, send) -> None:
        content = {
            **PAYLOAD_TOO_LARGE,
            "error": {
                **PAYLOAD_TOO_LARGE["error"],
                "request_id": get_request_id(),
            },
        }
        response = JSONResponse(content=content, status_code=413)
        await response(scope, receive, send)


class _RequestBodyTooLarge(Exception):
    pass
