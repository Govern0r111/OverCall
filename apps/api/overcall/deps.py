from __future__ import annotations

import re
from collections.abc import AsyncIterator
from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from .auth.ingest_keys import hash_ingest_key
from .auth.jwt import JWTVerificationError, SupabaseJWTVerifier
from .db.models import IngestKey
from .db.repos import IngestKeyRepository
from .errors import OvercallError

_INGEST_KEY_PATTERN = re.compile(r"^oc_[A-Za-z0-9_-]{43}$")
_CURRENT_INGEST_KEY_VERSION = 1


@dataclass(frozen=True)
class UserContext:
    user_id: UUID
    email: str | None = None


@dataclass(frozen=True)
class IngestKeyContext:
    user_id: UUID
    ingest_key_id: UUID


async def get_db_session(request: Request) -> AsyncIterator[AsyncSession]:
    """Yield a request-scoped session; route/service code owns commit boundaries."""
    engine = getattr(request.app.state, "engine", None)
    if engine is None:
        raise OvercallError("not_ready", 503, "The service is not ready. Try again shortly.")
    async with AsyncSession(engine, expire_on_commit=False) as session:
        app_settings = getattr(request.app.state, "settings", None)
        if app_settings is not None:
            session.info["app_settings"] = app_settings
        yield session


async def get_current_user(request: Request) -> UserContext:
    """Verify a Supabase access token before exposing its tenant identity to API routes."""
    authorization = request.headers.get("authorization")
    if authorization is None:
        raise OvercallError("unauthenticated", 401, "Sign in to continue.")

    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise OvercallError("unauthenticated", 401, "Sign in to continue.")

    verifier: SupabaseJWTVerifier = request.app.state.jwt_verifier
    try:
        claims = await verifier.verify(parts[1])
        user_id = UUID(claims["sub"])
    except (JWTVerificationError, KeyError, TypeError, ValueError) as exc:
        raise OvercallError(
            "invalid_token", 401, "Your access token is invalid or expired. Sign in again."
        ) from exc

    email = claims.get("email")
    return UserContext(user_id=user_id, email=email if isinstance(email, str) else None)


async def require_ingest_key_header(request: Request) -> str:
    plaintext = request.headers.get("x-overcall-key")
    if plaintext is None:
        raise OvercallError(
            "ingest_key_missing", 401, "Add your Overcall key in the X-Overcall-Key header."
        )
    if not _INGEST_KEY_PATTERN.fullmatch(plaintext):
        raise OvercallError("ingest_key_invalid", 401, "This Overcall key is not valid.")
    return plaintext


async def get_ingest_key(
    request: Request,
    plaintext: str = Depends(require_ingest_key_header),  # noqa: B008
    session: AsyncSession = Depends(get_db_session),  # noqa: B008
) -> IngestKeyContext:
    """Authenticate proxy traffic using a stored HMAC digest; never accept JWT identity here."""
    settings = getattr(request.app.state, "settings", None)
    current_pepper = getattr(settings, "ingest_key_pepper", None)
    if current_pepper is None:
        raise OvercallError("ingest_key_invalid", 401, "This Overcall key is not valid.")

    current_secret = current_pepper.get_secret_value()
    current_hash = hash_ingest_key(plaintext, current_secret)
    candidates = [(current_hash, False)]
    previous_pepper = getattr(settings, "ingest_key_pepper_prev", None)
    if previous_pepper is not None:
        previous_secret = previous_pepper.get_secret_value()
        previous_hash = hash_ingest_key(plaintext, previous_secret)
        if previous_hash != current_hash:
            candidates.append((previous_hash, True))

    repository = IngestKeyRepository(session)
    record: IngestKey | None = None
    used_previous_pepper = False
    for candidate_hash, is_previous in candidates:
        record = await repository.get_by_hash(candidate_hash)
        if record is not None:
            used_previous_pepper = is_previous
            break

    if record is None:
        raise OvercallError("ingest_key_invalid", 401, "This Overcall key is not valid.")
    if record.revoked_at is not None:
        raise OvercallError(
            "ingest_key_revoked", 401, "This Overcall key has been revoked. Create a new key."
        )
    if record.id is None:
        raise OvercallError("ingest_key_invalid", 401, "This Overcall key is not valid.")

    if used_previous_pepper:
        record.key_hash = current_hash
        record.pepper_version = _CURRENT_INGEST_KEY_VERSION
    record.last_used_at = datetime.now(UTC)
    await session.flush()
    return IngestKeyContext(user_id=record.user_id, ingest_key_id=record.id)
