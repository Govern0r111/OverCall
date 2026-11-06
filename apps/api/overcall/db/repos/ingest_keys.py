from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from ..models import IngestKey


class IngestKeyRepository:
    """Look up ingest keys by their stored keyed digest."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_by_hash(self, key_hash: str) -> IngestKey | None:
        result = await self.session.execute(select(IngestKey).where(IngestKey.key_hash == key_hash))
        return result.scalar_one_or_none()
