from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import and_, case, delete, or_, select

from ..models import Issue
from .base import BaseRepository


class IssueRepository(BaseRepository):
    """Tenant-scoped issue lookups with an explicit experimental-tier gate."""

    async def get(self, issue_id: UUID) -> Issue | None:
        statement = self.select_for_user(Issue).where(Issue.id == issue_id)
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def list_issues(
        self,
        *,
        limit: int = 200,
        cursor: tuple[datetime, UUID] | None = None,
        priority_cursor: tuple[str, str, Decimal, UUID] | None = None,
        severity: str | None = None,
        provider: str | None = None,
        tier: int | None = None,
        impact_kind: str | None = None,
        is_demo_data: bool | None = None,
        include_experimental: bool = False,
    ) -> list[Issue]:
        if not 1 <= limit <= 201:
            raise ValueError("limit must be between 1 and 200")

        conditions = [Issue.user_id == self.user_id]
        if severity is not None:
            conditions.append(Issue.severity == severity)
        if provider is not None:
            conditions.append(Issue.provider == provider)
        if tier is not None:
            conditions.append(Issue.tier == tier)
        if impact_kind is not None:
            conditions.append(Issue.impact_kind == impact_kind)
        if is_demo_data is not None:
            conditions.append(Issue.is_demo_data.is_(is_demo_data))
        if not include_experimental:
            conditions.extend((Issue.tier != 3, Issue.experimental.is_(False)))
        if cursor is not None:
            cursor_time, cursor_id = cursor
            conditions.append(
                or_(
                    Issue.detected_at < cursor_time,
                    and_(Issue.detected_at == cursor_time, Issue.id < cursor_id),
                )
            )
        severity_order = case(
            (Issue.severity == "critical", 0),
            (Issue.severity == "warning", 1),
            else_=2,
        )
        impact_order = case((Issue.impact_kind == "spend", 0), else_=1)
        if priority_cursor is not None:
            cursor_severity, cursor_impact, cursor_amount, cursor_id = priority_cursor
            severity_rank = {"critical": 0, "warning": 1, "info": 2}[cursor_severity]
            impact_rank = {"spend": 0, "reliability": 1}[cursor_impact]
            conditions.append(
                or_(
                    severity_order > severity_rank,
                    and_(
                        severity_order == severity_rank,
                        impact_order > impact_rank,
                    ),
                    and_(
                        severity_order == severity_rank,
                        impact_order == impact_rank,
                        Issue.projected_monthly_usd < cursor_amount,
                    ),
                    and_(
                        severity_order == severity_rank,
                        impact_order == impact_rank,
                        Issue.projected_monthly_usd == cursor_amount,
                        Issue.id > cursor_id,
                    ),
                )
            )

        statement = select(Issue).where(*conditions)
        if priority_cursor is not None or cursor is None:
            statement = statement.order_by(
                severity_order,
                impact_order,
                Issue.projected_monthly_usd.desc(),
                Issue.id.asc(),
            )
        else:
            statement = statement.order_by(Issue.detected_at.desc(), Issue.id.desc())
        statement = statement.limit(limit)
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def list_for_run(
        self,
        run_id: UUID,
        *,
        is_demo_data: bool | None = None,
    ) -> list[Issue]:
        statement = self.select_for_user(Issue).where(Issue.run_id == run_id)
        if is_demo_data is not None:
            statement = statement.where(Issue.is_demo_data.is_(is_demo_data))
        statement = statement.order_by(Issue.detected_at.desc(), Issue.id.desc())
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def add(self, issue: Issue) -> Issue:
        self.add_for_user(issue)
        await self.flush()
        return issue

    async def delete_demo(self) -> int:
        return await self.delete_for_source("demo")

    async def delete_for_source(self, source: str) -> int:
        if source not in {"demo", "proxy"}:
            raise ValueError("source must be 'demo' or 'proxy'")
        statement = delete(Issue).where(
            Issue.user_id == self.user_id,
            Issue.is_demo_data.is_(source == "demo"),
        )
        result = await self.session.execute(statement)
        return result.rowcount or 0

    async def delete_all(self) -> int:
        result = await self.session.execute(delete(Issue).where(Issue.user_id == self.user_id))
        return result.rowcount or 0
