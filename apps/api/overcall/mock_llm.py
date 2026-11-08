import asyncio
import hashlib
import itertools
import json
import time
from collections.abc import AsyncIterator
from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, Response, StreamingResponse

mock_app = FastAPI(title="Overcall mock OpenAI server")
REPLY = "This is a mock completion from Overcall's local LLM server. No real model was called."
_REQUEST_SEQUENCE = itertools.count(1)
_ALLOWED_FAILURE_STATUSES = {429, 500, 503}
_MAX_LATENCY_MS = 5_000
_MAX_RESPONSE_BYTES = 1_000_000


def _error_response(
    message: str,
    *,
    code: str,
    status_code: int = 400,
    param: str | None = None,
) -> JSONResponse:
    return JSONResponse(
        {
            "error": {
                "message": message,
                "type": "invalid_request_error" if status_code == 400 else "mock_error",
                "param": param,
                "code": code,
            }
        },
        status_code=status_code,
    )


def _json_response(
    request: Request,
    data: dict[str, Any],
    *,
    status_code: int = 200,
    headers: dict[str, str] | None = None,
) -> Response:
    response = JSONResponse(data, status_code=status_code, headers=headers)
    raw_target = request.headers.get("x-mock-resp-bytes")
    if raw_target is None:
        return response
    try:
        target = int(raw_target)
    except ValueError:
        return _error_response(
            "X-Mock-Resp-Bytes must be an integer.",
            code="invalid_mock_response_size",
            param="X-Mock-Resp-Bytes",
        )
    if not 0 <= target <= _MAX_RESPONSE_BYTES:
        return _error_response(
            f"X-Mock-Resp-Bytes must be between 0 and {_MAX_RESPONSE_BYTES}.",
            code="invalid_mock_response_size",
            param="X-Mock-Resp-Bytes",
        )
    if target <= len(response.body):
        return response
    padded_headers = {
        key: value
        for key, value in response.headers.items()
        if key.lower() not in {"content-length", "content-type"}
    }
    return Response(
        response.body + b" " * (target - len(response.body)),
        status_code=status_code,
        headers=padded_headers,
        media_type="application/json",
    )


@mock_app.middleware("http")
async def inject_latency(request: Request, call_next):
    raw_delay = request.headers.get("x-mock-latency-ms")
    if raw_delay is not None:
        try:
            delay_ms = int(raw_delay)
        except ValueError:
            return _error_response(
                "X-Mock-Latency-Ms must be an integer.",
                code="invalid_mock_latency",
                param="X-Mock-Latency-Ms",
            )
        if not 0 <= delay_ms <= _MAX_LATENCY_MS:
            return _error_response(
                f"X-Mock-Latency-Ms must be between 0 and {_MAX_LATENCY_MS}.",
                code="invalid_mock_latency",
                param="X-Mock-Latency-Ms",
            )
        if delay_ms:
            await asyncio.sleep(delay_ms / 1000)
    return await call_next(request)


def forced_error(request: Request) -> Response | None:
    raw_status = request.headers.get("x-mock-status")
    if raw_status is None:
        return None
    try:
        status = int(raw_status)
    except ValueError:
        return _error_response(
            "X-Mock-Status must be one of 429, 500, or 503.",
            code="invalid_mock_status",
            param="X-Mock-Status",
        )
    if status not in _ALLOWED_FAILURE_STATUSES:
        return _error_response(
            "X-Mock-Status must be one of 429, 500, or 503.",
            code="invalid_mock_status",
            param="X-Mock-Status",
        )
    headers: dict[str, str] = {}
    raw_retry_after = request.headers.get("x-mock-retry-after")
    if raw_retry_after is not None:
        try:
            retry_after = int(raw_retry_after)
        except ValueError:
            return _error_response(
                "X-Mock-Retry-After must be an integer.",
                code="invalid_mock_retry_after",
                param="X-Mock-Retry-After",
            )
        if not 0 <= retry_after <= 3600:
            return _error_response(
                "X-Mock-Retry-After must be between 0 and 3600 seconds.",
                code="invalid_mock_retry_after",
                param="X-Mock-Retry-After",
            )
        headers["Retry-After"] = str(retry_after)
    return _json_response(
        request,
        {
            "error": {
                "message": "Mock error forced via X-Mock-Status",
                "type": "mock_error",
                "code": status,
            }
        },
        status_code=status,
        headers=headers,
    )


async def _json_body(request: Request) -> tuple[dict[str, Any] | None, Response | None]:
    try:
        body = await request.json()
    except (json.JSONDecodeError, UnicodeDecodeError):
        return None, _error_response(
            "Request body must be valid JSON.",
            code="invalid_json",
        )
    if not isinstance(body, dict):
        return None, _error_response(
            "Request body must be a JSON object.",
            code="invalid_request",
        )
    return body, None


def _count_tokens(text: str, model: str) -> int:
    try:
        import tiktoken
    except ImportError:
        return max(1, len(text) // 4)

    encoding_name = (
        "o200k_base"
        if model.startswith(("gpt-4o", "gpt-4.1", "o1", "o3", "o4"))
        else "cl100k_base"
    )
    try:
        encoding = tiktoken.get_encoding(encoding_name)
    except ValueError:
        return max(1, len(text) // 4)
    return max(1, len(encoding.encode(text)))


def _chat_result(body: dict[str, Any]) -> dict[str, Any] | JSONResponse:
    model = body.get("model")
    messages = body.get("messages")
    if not isinstance(model, str) or not model.strip():
        return _error_response(
            "The model field is required.",
            code="missing_required_parameter",
            param="model",
        )
    if not isinstance(messages, list) or not messages:
        return _error_response(
            "The messages field is required and must be a non-empty array.",
            code="missing_required_parameter",
            param="messages",
        )
    if any(not isinstance(message, dict) for message in messages):
        return _error_response(
            "Each messages entry must be an object.",
            code="invalid_messages",
            param="messages",
        )
    try:
        count = int(body.get("n", 1))
    except (TypeError, ValueError):
        return _error_response("n must be a positive integer.", code="invalid_n", param="n")
    if not 1 <= count <= 4:
        return _error_response("n must be between 1 and 4.", code="invalid_n", param="n")

    canonical = json.dumps(body, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    request_hash = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    content = f"{REPLY} Reference {request_hash[:8]}."
    prompt_tokens = (
        sum(
            _count_tokens(str(message.get("content", "")), model) + 4
            for message in messages
        )
        + 2
    )
    raw_limit = body.get("max_completion_tokens", body.get("max_tokens"))
    limit = None
    if raw_limit is not None:
        try:
            limit = int(raw_limit)
        except (TypeError, ValueError):
            return _error_response(
                "max_tokens must be a positive integer.",
                code="invalid_max_tokens",
                param="max_tokens",
            )
        if limit < 1:
            return _error_response(
                "max_tokens must be a positive integer.",
                code="invalid_max_tokens",
                param="max_tokens",
            )

    sequence = next(_REQUEST_SEQUENCE)
    response_id = f"chatcmpl-mock-{time.time_ns()}-{sequence}"
    choice_contents = [
        content if index == 0 else f"{content} Option {index + 1}."
        for index in range(count)
    ]
    completion_tokens = sum(
        min(_count_tokens(choice_content, model), limit)
        if limit is not None
        else _count_tokens(choice_content, model)
        for choice_content in choice_contents
    )
    usage = {
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "total_tokens": prompt_tokens + completion_tokens,
    }
    return {
        "id": response_id,
        "object": "chat.completion",
        "created": int(time.time()),
        "model": model,
        "choices": [
            {
                "index": index,
                "message": {
                    "role": "assistant",
                    "content": choice_content,
                },
                "finish_reason": "stop",
            }
            for index, choice_content in enumerate(choice_contents)
        ],
        "usage": usage,
    }


def _sse_chunk(
    response_id: str,
    created: int,
    model: str,
    delta: dict[str, str],
    finish_reason: str | None = None,
    choice_index: int = 0,
) -> bytes:
    return (
        "data: "
        + json.dumps(
            {
                "id": response_id,
                "object": "chat.completion.chunk",
                "created": created,
                "model": model,
                "choices": [
                    {
                        "index": choice_index,
                        "delta": delta,
                        "finish_reason": finish_reason,
                    }
                ],
            },
            separators=(",", ":"),
            ensure_ascii=False,
        )
        + "\n\n"
    ).encode("utf-8")


def _usage_chunk(response_id: str, created: int, model: str, usage: dict[str, int]) -> bytes:
    return (
        "data: "
        + json.dumps(
            {
                "id": response_id,
                "object": "chat.completion.chunk",
                "created": created,
                "model": model,
                "choices": [],
                "usage": usage,
            },
            separators=(",", ":"),
        )
        + "\n\n"
    ).encode("utf-8")


async def _stream_chat(
    result: dict[str, Any],
    *,
    include_usage: bool,
    drop_after_chunks: int | None,
) -> AsyncIterator[bytes]:
    response_id = result["id"]
    created = result["created"]
    model = result["model"]
    chunks = []
    for choice in result["choices"]:
        choice_index = choice["index"]
        content = choice["message"]["content"]
        chunks.append(
            _sse_chunk(
                response_id,
                created,
                model,
                {"role": "assistant", "content": ""},
                choice_index=choice_index,
            )
        )
        chunks.extend(
            _sse_chunk(
                response_id,
                created,
                model,
                {"content": content[index : index + 24]},
                choice_index=choice_index,
            )
            for index in range(0, len(content), 24)
        )
        chunks.append(
            _sse_chunk(
                response_id,
                created,
                model,
                {},
                "stop",
                choice_index=choice_index,
            )
        )
    if include_usage:
        chunks.append(_usage_chunk(response_id, created, model, result["usage"]))

    for index, chunk in enumerate(chunks, start=1):
        yield chunk
        if drop_after_chunks is not None and index >= drop_after_chunks:
            return
        await asyncio.sleep(0)
    yield b"data: [DONE]\n\n"


@mock_app.post("/v1/chat/completions")
async def chat_completions(request: Request) -> Response:
    if (error := forced_error(request)) is not None:
        return error
    body, error = await _json_body(request)
    if error is not None:
        return error
    result = _chat_result(body or {})
    if isinstance(result, Response):
        return result
    if body and body.get("stream") is True:
        raw_drop_after = request.headers.get("x-mock-drop-after-chunks")
        drop_after_chunks = None
        if raw_drop_after is not None:
            try:
                drop_after_chunks = int(raw_drop_after)
            except ValueError:
                return _error_response(
                    "X-Mock-Drop-After-Chunks must be a positive integer.",
                    code="invalid_mock_drop_after_chunks",
                    param="X-Mock-Drop-After-Chunks",
                )
            if drop_after_chunks < 1:
                return _error_response(
                    "X-Mock-Drop-After-Chunks must be a positive integer.",
                    code="invalid_mock_drop_after_chunks",
                    param="X-Mock-Drop-After-Chunks",
                )
        stream_options = body.get("stream_options")
        include_usage = (
            isinstance(stream_options, dict) and stream_options.get("include_usage") is True
        )
        return StreamingResponse(
            _stream_chat(
                result,
                include_usage=include_usage,
                drop_after_chunks=drop_after_chunks,
            ),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )
    return _json_response(request, result)


@mock_app.post("/v1/embeddings")
async def embeddings(request: Request) -> Response:
    if (error := forced_error(request)) is not None:
        return error
    body, error = await _json_body(request)
    if error is not None:
        return error
    model = body.get("model") if body else None
    inputs = body.get("input") if body else None
    if not isinstance(model, str) or not model.strip():
        return _error_response(
            "The model field is required.",
            code="missing_required_parameter",
            param="model",
        )
    if inputs is None or inputs == "":
        return _error_response(
            "The input field is required.",
            code="missing_required_parameter",
            param="input",
        )
    values = inputs if isinstance(inputs, list) else [inputs]
    vectors = []
    for index, value in enumerate(values):
        digest = hashlib.sha256(f"{model}:{value}".encode()).digest()
        vector = [
            round((int.from_bytes(digest[offset : offset + 2], "big") / 32767.5) - 1, 6)
            for offset in range(0, 16, 2)
        ]
        vectors.append({"object": "embedding", "index": index, "embedding": vector})
    prompt_tokens = _count_tokens(json.dumps(values, ensure_ascii=False), model)
    return _json_response(
        request,
        {
            "object": "list",
            "data": vectors,
            "model": model,
            "usage": {"prompt_tokens": prompt_tokens, "total_tokens": prompt_tokens},
        },
    )


@mock_app.get("/v1/models")
async def models(request: Request) -> Response:
    ids = ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4.1-mini", "text-embedding-3-small"]
    return _json_response(
        request,
        {
            "object": "list",
            "data": [
                {"id": model, "object": "model", "owned_by": "mock"}
                for model in ids
            ],
        },
    )
