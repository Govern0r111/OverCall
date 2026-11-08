from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import func, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from ..models import IngestKey


class IngestKeyRepository:
    """Look up proxy keys and manage keys within an explicitly supplied tenant."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_by_hash(self, key_hash: str) -> IngestKey | None:
        result = await self.session.execute(select(IngestKey).where(IngestKey.key_hash == key_hash))
        return result.scalar_one_or_none()

    async def list_for_user(self, user_id: UUID) -> list[IngestKey]:
        statement = (
            select(IngestKey)
            .where(IngestKey.user_id == user_id)
            .order_by(IngestKey.created_at.desc(), IngestKey.id.desc())
        )
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def create_for_user(
        self,
        user_id: UUID,
        *,
        name: str,
        prefix: str,
        key_hash: str,
        pepper_version: int,
        active_limit: int = 5,
    ) -> IngestKey | None:
        # Serialize per-user creation so concurrent requests cannot exceed the active-key limit.
        await self.session.execute(
            select(func.pg_advisory_xact_lock(func.hashtextextended(str(user_id), 0)))
        )
        active_count = await self.session.execute(
            select(func.count())
            .select_from(IngestKey)
            .where(IngestKey.user_id == user_id, IngestKey.revoked_at.is_(None))
        )
        if int(active_count.scalar_one()) >= active_limit:
            return None

        row = IngestKey(
            user_id=user_id,
            name=name,
            prefix=prefix,
            key_hash=key_hash,
            pepper_version=pepper_version,
        )
        self.session.add(row)
        await self.session.flush()
        return row

    async def revoke_for_user(self, user_id: UUID, key_id: UUID) -> None:
        # Scope the update in SQL; foreign and unknown ids are indistinguishable and idempotent.
        await self.session.execute(
            update(IngestKey)
            .where(
                IngestKey.user_id == user_id,
                IngestKey.id == key_id,
                IngestKey.revoked_at.is_(None),
            )
            .values(revoked_at=datetime.now(UTC))
        )
        await self.session.flush()

    async def mark_used_for_user(
        self,
        user_id: UUID,
        key_id: UUID,
        *,
        key_hash: str | None = None,
        pepper_version: int | None = None,
    ) -> None:
        now = datetime.now(UTC)
        values: dict[str, object] = {"last_used_at": func.greatest(IngestKey.last_used_at, now)}
        if key_hash is not None and pepper_version is not None:
            values["key_hash"] = key_hash
            values["pepper_version"] = pepper_version
        await self.session.execute(
            update(IngestKey)
            .where(
                IngestKey.user_id == user_id,
                IngestKey.id == key_id,
                IngestKey.revoked_at.is_(None),
            )
            .values(**values)
        )
