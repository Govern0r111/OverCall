import json
import re
import time
from datetime import UTC, datetime
from uuid import UUID, uuid4

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, Request, Response
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from .config import Settings
from .db.models import RequestLog
from .db.repos import IngestKeyRepository, RequestLogRepository, UserSettingsRepository
from .deps import IngestKeyContext, get_db_session, get_ingest_key
from .hashing import context_hash, normalize_endpoint, payload_hash
from .logging import get_logger
from .mock_llm import mock_app
from .pricing import Usage
from .pricing import estimate_cost as calculate_cost

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
    if _mode == "mock":
        headers.pop("authorization", None)
    upstream_path = "/" + path
    occurred_at = datetime.now(UTC)
    log_id = uuid4()
    started = time.perf_counter()
    error_code = None
    try:
        resp = await client.request(
            request.method,
            f"{base}{upstream_path}",
            params=list(request.query_params.multi_items()),
            content=body,
            headers=headers,
        )
        status, content, resp_headers = resp.status_code, resp.content, resp.headers
    except httpx.RequestError as exc:
        status, content, resp_headers = (
            502,
            json.dumps({"error": f"Upstream unreachable: {type(exc).__name__}"}).encode(),
            {"content-type": "application/json"},
        )
        error_code = "upstream_unreachable"
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
            caller=(
                request.headers.get("x-overcall-caller")
                if _CALLER_PATTERN.fullmatch(request.headers.get("x-overcall-caller", ""))
                else None
            ),
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
