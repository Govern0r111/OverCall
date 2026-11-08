from __future__ import annotations

from uuid import UUID

from sqlalchemy import delete

from ..models import DetectionRun
from .base import BaseRepository


class DetectionRunRepository(BaseRepository):
    """Tenant-scoped reads and creation for detection-run summaries."""

    async def get(self, run_id: UUID) -> DetectionRun | None:
        statement = self.select_for_user(DetectionRun).where(DetectionRun.id == run_id)
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def latest(self, *, is_demo_data: bool | None = None) -> DetectionRun | None:
        statement = self.select_for_user(DetectionRun)
        if is_demo_data is not None:
            statement = statement.where(DetectionRun.is_demo_data.is_(is_demo_data))
        statement = statement.order_by(
            DetectionRun.started_at.desc(), DetectionRun.id.desc()
        ).limit(1)
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def add(self, run: DetectionRun) -> DetectionRun:
        self.add_for_user(run)
        await self.flush()
        return run

    async def delete_for_source(self, source: str) -> int:
        if source not in {"demo", "proxy"}:
            raise ValueError("source must be 'demo' or 'proxy'")
        statement = delete(DetectionRun).where(
            DetectionRun.user_id == self.user_id,
            DetectionRun.is_demo_data.is_(source == "demo"),
        )
        result = await self.session.execute(statement)
        return result.rowcount or 0

    async def delete_all(self) -> int:
        result = await self.session.execute(
            delete(DetectionRun).where(DetectionRun.user_id == self.user_id)
        )
        return result.rowcount or 0
