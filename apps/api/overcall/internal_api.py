from __future__ import annotations

import hmac

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from .deps import get_db_session
from .errors import OvercallError
from .logging import get_logger

logger = get_logger(__name__)
DATABASE_SIZE_LIMIT_BYTES = 500 * 1024 * 1024

router = APIRouter()


class DatabaseSizeResponse(BaseModel):
    bytes: int
    limit_bytes: int
    percent: float


async def require_internal_authorization(request: Request) -> None:
    settings = getattr(request.app.state, "settings", None)
    configured_token = getattr(settings, "internal_token", None)
    authorization = request.headers.get("authorization", "").split()
    if (
        configured_token is None
        or len(authorization) != 2
        or authorization[0].lower() != "bearer"
        or not hmac.compare_digest(
            authorization[1].encode("utf-8"),
            configured_token.get_secret_value().encode("utf-8"),
        )
    ):
        raise OvercallError("not_found", 404, "Not found.")


@router.get(
    "/internal/db-size",
    response_model=DatabaseSizeResponse,
    include_in_schema=False,
)
async def get_database_size(
    _authorized: None = Depends(require_internal_authorization),  # noqa: B008
    session: AsyncSession = Depends(get_db_session),  # noqa: B008
) -> DatabaseSizeResponse:
    try:
        database_size = await session.scalar(text("SELECT pg_database_size(current_database())"))
    except Exception as exc:
        logger.warning("Database size query failed: %s", type(exc).__name__)
        raise OvercallError(
            "not_ready", 503, "The service is not ready. Try again shortly."
        ) from exc

    if not isinstance(database_size, int) or database_size < 0:
        logger.warning("Database size query returned an invalid result")
        raise OvercallError("not_ready", 503, "The service is not ready. Try again shortly.")

    return DatabaseSizeResponse(
        bytes=database_size,
        limit_bytes=DATABASE_SIZE_LIMIT_BYTES,
        percent=round(database_size / DATABASE_SIZE_LIMIT_BYTES * 100, 2),
    )
