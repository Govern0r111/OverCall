import asyncio
import json
import re
import time
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from uuid import UUID, uuid4

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, Request, Response
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from .config import Settings
from .db.models import RequestLog
from .db.repos import IngestKeyRepository, RequestLogRepository, UserSettingsRepository
from .deps import IngestKeyContext, get_db_session, get_ingest_key
from .hashing import context_hash, normalize_endpoint, payload_hash
from .logging import get_logger, redact
from .mock_llm import mock_app
from .pricing import Usage
from .pricing import estimate_cost as calculate_cost
from .sse import SSEUsageTracker

logger = get_logger(__name__)
router = APIRouter(prefix="/proxy", tags=["proxy"])
http_client = httpx.AsyncClient(timeout=90)
mock_client = httpx.AsyncClient(
    transport=httpx.ASGITransport(app=mock_app), base_url="http://mock-llm", timeout=30
)

DROP_REQ = {"host", "content-length", "connection", "accept-encoding", "transfer-encoding"}
DROP_RESP = {"content-encoding", "content-length", "transfer-encoding", "connection"}
METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"]
_CALLER_PATTERN = re.compile(r"^[A-Za-z0-9._:/-]{1,64}$")


def _safe_caller(value: str) -> str | None:
    if not _CALLER_PATTERN.fullmatch(value) or redact(value) != value:
        return None
    return value


def bearer_key(headers) -> str:
    auth = headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        return auth[7:].strip()
    if auth.lower().startswith("basic "):
        import base64

        try:
            return base64.b64decode(auth[6:]).decode().split(":")[0]
        except ValueError:
            return ""
    return ""


def resolve_upstream(provider: str, headers, openai_mode: str, settings: Settings):
    if provider == "openai":
        if openai_mode == "real" and settings.allow_real_upstream:
            return http_client, settings.openai_upstream_base_url, "real"
        return mock_client, "", "mock"
    return http_client, settings.stripe_upstream_base_url, "test"


def safe_json(raw: bytes):
    try:
        return json.loads(raw) if raw else {}
    except (ValueError, UnicodeDecodeError):
        return {}


async def _read_response_with_limit(
    response: httpx.Response,
    max_bytes: int,
) -> tuple[bytes | None, AsyncIterator[bytes] | None]:
    content_length = response.headers.get("content-length")
    try:
        if content_length is not None and int(content_length) > max_bytes:
            return None, response.aiter_bytes()
    except ValueError:
        pass

    chunks: list[bytes] = []
    buffered_bytes = 0
    overflow = b""
    iterator = response.aiter_bytes().__aiter__()

    while True:
        try:
            chunk = await anext(iterator)
        except StopAsyncIteration:
            return b"".join(chunks), None

        remaining = max_bytes + 1 - buffered_bytes
        if len(chunk) > remaining:
            chunks.append(chunk[:remaining])
            overflow = chunk[remaining:]
            buffered_bytes += remaining
            break
        chunks.append(chunk)
        buffered_bytes += len(chunk)
        if buffered_bytes > max_bytes:
            break

    async def passthrough() -> AsyncIterator[bytes]:
        for buffered_chunk in chunks:
            if buffered_chunk:
                yield buffered_chunk
        if overflow:
            yield overflow
        async for remaining_chunk in iterator:
            if remaining_chunk:
                yield remaining_chunk

    return None, passthrough()


def extract_meta(provider: str, req_body: bytes, resp_body: bytes, query) -> dict:
    req, resp = safe_json(req_body), safe_json(resp_body)
    req = req if isinstance(req, dict) else {}
    resp = resp if isinstance(resp, dict) else {}
    if provider == "openai":
        usage = resp.get("usage") or {}
        usage = usage if isinstance(usage, dict) else {}
        token_details = usage.get("prompt_tokens_details") or {}
        token_details = token_details if isinstance(token_details, dict) else {}
        return {
            "model": resp.get("model") or req.get("model"),
            "prompt_tokens": int(usage.get("prompt_tokens") or 0),
            "completion_tokens": int(usage.get("completion_tokens") or 0),
            "cached_prompt_tokens": int(token_details.get("cached_tokens") or 0),
            "context_hash": context_hash(req.get("messages")),
        }
    limit = query.get("limit")
    return {
        "list_limit": int(limit) if limit and limit.isdigit() else None,
        "items_returned": len(resp["data"])
        if resp.get("object") == "list" and isinstance(resp.get("data"), list)
        else None,
    }


async def persist_proxy_log(
    session: AsyncSession,
    user_id: UUID,
    log: RequestLog,
    ingest_key: IngestKeyContext,
) -> None:
    """Write metadata after the upstream response; persistence must never fail the request."""
    try:
        await RequestLogRepository(session, user_id).add(log)
        if log.ingest_key_id is not None:
            await IngestKeyRepository(session).mark_used_for_user(
                user_id,
                log.ingest_key_id,
                key_hash=ingest_key.key_hash,
                pepper_version=ingest_key.pepper_version,
            )
        await session.commit()
    except Exception as exc:
        try:
            await session.rollback()
        except Exception:
            pass
        logger.warning("proxy_log_write_failed error_type=%s", type(exc).__name__)


@router.api_route("/{provider}/{path:path}", methods=METHODS, include_in_schema=False)
async def proxy(
    provider: str,
    path: str,
    request: Request,
    background_tasks: BackgroundTasks,
    ingest_key: IngestKeyContext = Depends(get_ingest_key),  # noqa: B008
    session: AsyncSession = Depends(get_db_session),  # noqa: B008
):
    if provider == "aws":
        return JSONResponse(
            {"error": "AWS proxying is stubbed in v1. Pricing schema is ready; forwarding is not."},
            status_code=501,
        )
    if provider not in ("openai", "stripe"):
        return JSONResponse(
            {"error": f"Unknown provider '{provider}'. Use openai or stripe."}, status_code=404
        )
    if provider == "stripe" and bearer_key(request.headers).startswith(("sk_live", "rk_live")):
        return JSONResponse(
            {"error": "v1 proxies Stripe test mode only. Use an sk_test_ key."}, status_code=403
        )

    user_settings = await UserSettingsRepository(session, ingest_key.user_id).get()
    openai_mode = user_settings.upstream_mode if user_settings is not None else "mock"
    app_settings = request.app.state.settings
    client, base, _mode = resolve_upstream(provider, request.headers, openai_mode, app_settings)
    body = await request.body()
    headers = {
        k: v
        for k, v in request.headers.items()
        if k.lower() not in DROP_REQ
        and k.lower() not in {"x-overcall-key", "x-overcall-caller"}
        and not k.lower().startswith("x-forwarded-")
    }
    headers["accept-encoding"] = "identity"
    if _mode == "mock":
        headers.pop("authorization", None)
    upstream_path = "/" + path
    occurred_at = datetime.now(UTC)
    log_id = uuid4()
    started = time.perf_counter()
    error_code = None
    try:
        stream_context = client.stream(
            request.method,
            f"{base}{upstream_path}",
            params=list(request.query_params.multi_items()),
            content=body,
            headers=headers,
        )
        resp = await stream_context.__aenter__()
    except httpx.RequestError as exc:
        status, content, resp_headers = (
            502,
            json.dumps({"error": f"Upstream unreachable: {type(exc).__name__}"}).encode(),
            {"content-type": "application/json"},
        )
        error_code = "upstream_unreachable"
    else:
        status, resp_headers = resp.status_code, resp.headers
        is_sse = "text/event-stream" in resp.headers.get("content-type", "").lower()
        usage_tracker = SSEUsageTracker(body) if is_sse and provider == "openai" else None
        response_chunks: AsyncIterator[bytes] | None = None
        content: bytes | None = None
        if is_sse:
            response_chunks = resp.aiter_raw()
        else:
            try:
                content, response_chunks = await _read_response_with_limit(
                    resp,
                    request.app.state.settings.max_response_buffer_bytes,
                )
            except httpx.RequestError as exc:
                status, content, resp_headers = (
                    502,
                    json.dumps({"error": f"Upstream unreachable: {type(exc).__name__}"}).encode(),
                    {"content-type": "application/json"},
                )
                error_code = "upstream_unreachable"
            finally:
                if content is not None or response_chunks is None:
                    await stream_context.__aexit__(None, None, None)

        if response_chunks is not None:
            out_headers = {k: v for k, v in resp_headers.items() if k.lower() not in DROP_RESP}
            out_headers["x-overcall-request-id"] = str(log_id)
            out_headers["x-accel-buffering"] = "no"
            if is_sse:
                out_headers["cache-control"] = "no-cache"

            async def stream_body():
                response_size = 0
                ttfb_ms = None
                stream_error = None
                stream_completed = False
                cancelled = False

                async def finalize_stream() -> None:
                    nonlocal stream_error
                    try:
                        await stream_context.__aexit__(None, None, None)
                    except Exception:
                        stream_error = stream_error or "upstream_dropped"
                    latency_ms = (time.perf_counter() - started) * 1000
                    try:
                        meta = extract_meta(provider, body, b"", request.query_params)
                        usage = None
                        if usage_tracker is not None:
                            usage_tracker.finish()
                            usage = usage_tracker.usage()
                            meta.update(
                                prompt_tokens=usage.prompt_tokens,
                                completion_tokens=usage.completion_tokens,
                                cached_prompt_tokens=usage.cached_prompt_tokens,
                                tokens_estimated=usage.tokens_estimated,
                            )
                        cost = calculate_cost(
                            provider, meta.get("model"), usage, status, at=occurred_at
                        )
                        log = RequestLog(
                            id=log_id,
                            user_id=ingest_key.user_id,
                            ingest_key_id=ingest_key.ingest_key_id,
                            source="proxy",
                            origin="upstream",
                            occurred_at=occurred_at,
                            provider=provider,
                            endpoint=normalize_endpoint(upstream_path),
                            method=request.method,
                            req_size=len(body),
                            req_hash=payload_hash(
                                request.method,
                                upstream_path,
                                request.url.query,
                                body,
                                request.headers.get("content-type", ""),
                            ),
                            status=status,
                            resp_size=response_size,
                            latency_ms=round(latency_ms, 1),
                            ttfb_ms=round(ttfb_ms, 1) if ttfb_ms is not None else None,
                            stream=True,
                            cost_usd=cost.cost_usd,
                            cost_basis=cost.basis,
                            pricing_version=cost.pricing_version,
                            caller=_safe_caller(request.headers.get("x-overcall-caller", "")),
                            has_idempotency_key="idempotency-key" in request.headers,
                            error_code=stream_error,
                            **meta,
                        )
                        engine = getattr(request.app.state, "engine", None)
                        if engine is None:
                            await persist_proxy_log(session, ingest_key.user_id, log, ingest_key)
                        else:
                            async with AsyncSession(engine, expire_on_commit=False) as log_session:
                                await persist_proxy_log(
                                    log_session, ingest_key.user_id, log, ingest_key
                                )
                    except Exception as exc:
                        logger.warning("proxy_log_prepare_failed error_type=%s", type(exc).__name__)

                try:
                    async for chunk in response_chunks:
                        if chunk:
                            if usage_tracker is not None:
                                usage_tracker.feed(chunk)
                            if ttfb_ms is None:
                                ttfb_ms = (time.perf_counter() - started) * 1000
                            yield chunk
                            response_size += len(chunk)
                    stream_completed = True
                except asyncio.CancelledError:
                    stream_error = "client_disconnected"
                    cancelled = True
                except httpx.HTTPError:
                    stream_error = "upstream_dropped"
                finally:
                    if not stream_completed and stream_error is None:
                        stream_error = "client_disconnected"
                    finalize_task = asyncio.create_task(finalize_stream())
                    try:
                        await asyncio.shield(finalize_task)
                    except asyncio.CancelledError:
                        await finalize_task
                        cancelled = True

                if cancelled:
                    raise asyncio.CancelledError

            return StreamingResponse(
                stream_body(),
                status_code=status,
                headers=out_headers,
                background=background_tasks,
            )

        if content is None:
            content = b""
    latency = (time.perf_counter() - started) * 1000

    try:
        meta = extract_meta(provider, body, content, request.query_params)
        response_json = safe_json(content)
        response_usage = (
            response_json.get("usage")
            if isinstance(response_json, dict) and isinstance(response_json.get("usage"), dict)
            else None
        )
        cost = calculate_cost(
            provider,
            meta.get("model"),
            (
                Usage(
                    prompt_tokens=meta.get("prompt_tokens", 0),
                    completion_tokens=meta.get("completion_tokens", 0),
                    cached_prompt_tokens=meta.get("cached_prompt_tokens", 0),
                )
                if response_usage is not None
                else None
            ),
            status,
            at=occurred_at,
        )
        log = RequestLog(
            id=log_id,
            user_id=ingest_key.user_id,
            ingest_key_id=ingest_key.ingest_key_id,
            source="proxy",
            origin="upstream",
            occurred_at=occurred_at,
            provider=provider,
            endpoint=normalize_endpoint(upstream_path),
            method=request.method,
            req_size=len(body),
            req_hash=payload_hash(
                request.method,
                upstream_path,
                request.url.query,
                body,
                request.headers.get("content-type", ""),
            ),
            status=status,
            resp_size=len(content),
            latency_ms=round(latency, 1),
            cost_usd=cost.cost_usd,
            cost_basis=cost.basis,
            pricing_version=cost.pricing_version,
            caller=_safe_caller(request.headers.get("x-overcall-caller", "")),
            has_idempotency_key="idempotency-key" in request.headers,
            error_code=error_code,
            **meta,
        )
        background_tasks.add_task(persist_proxy_log, session, ingest_key.user_id, log, ingest_key)
    except Exception as exc:
        logger.warning("proxy_log_prepare_failed error_type=%s", type(exc).__name__)

    out_headers = {k: v for k, v in resp_headers.items() if k.lower() not in DROP_RESP}
    out_headers["x-overcall-request-id"] = str(log_id)
    return Response(
        content=content,
        status_code=status,
        headers=out_headers,
        background=background_tasks,
    )
