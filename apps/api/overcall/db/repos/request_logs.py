from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import and_, delete, func, or_, select

from ..models import RequestLog
from .base import BaseRepository


class RequestLogRepository(BaseRepository):
    """Tenant-scoped query and write operations for metadata-only request logs."""

    async def get(self, log_id: UUID) -> RequestLog | None:
        statement = self.select_for_user(RequestLog).where(RequestLog.id == log_id)
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def list_logs(
        self,
        *,
        limit: int = 200,
        cursor: tuple[datetime, UUID] | None = None,
        source: str | None = None,
        provider: str | None = None,
        method: str | None = None,
        endpoint: str | None = None,
        caller: str | None = None,
        model: str | None = None,
        status: int | None = None,
        occurred_from: datetime | None = None,
        occurred_to: datetime | None = None,
        query: str | None = None,
        status_class: str | None = None,
        issue_id: UUID | None = None,
    ) -> list[RequestLog]:
        if not 1 <= limit <= 201:
            raise ValueError("limit must be between 1 and 200")

        conditions = [RequestLog.user_id == self.user_id]
        if source is not None:
            conditions.append(RequestLog.source == source)
        if provider is not None:
            conditions.append(RequestLog.provider == provider)
        if method is not None:
            conditions.append(RequestLog.method == method)
        if endpoint is not None:
            conditions.append(RequestLog.endpoint == endpoint)
        if caller is not None:
            conditions.append(RequestLog.caller == caller)
        if model is not None:
            conditions.append(RequestLog.model == model)
        if status is not None:
            conditions.append(RequestLog.status == status)
        if occurred_from is not None:
            conditions.append(RequestLog.occurred_at >= occurred_from)
        if occurred_to is not None:
            conditions.append(RequestLog.occurred_at <= occurred_to)
        if status_class is not None:
            if status_class not in {"2xx", "3xx", "4xx", "5xx"}:
                raise ValueError("status_class must be one of 2xx, 3xx, 4xx, 5xx")
            status_group = int(status_class[0])
            conditions.extend(
                [
                    RequestLog.status >= status_group * 100,
                    RequestLog.status < (status_group + 1) * 100,
                ]
            )
        if issue_id is not None:
            from ..models import IssueRequest

            conditions.append(
                RequestLog.id.in_(
                    select(IssueRequest.request_id).where(
                        IssueRequest.user_id == self.user_id,
                        IssueRequest.issue_id == issue_id,
                    )
                )
            )
        if cursor is not None:
            cursor_time, cursor_id = cursor
            conditions.append(
                or_(
                    RequestLog.occurred_at < cursor_time,
                    and_(
                        RequestLog.occurred_at == cursor_time,
                        RequestLog.id < cursor_id,
                    ),
                )
            )
        if query:
            escaped = query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            pattern = f"%{escaped}%"
            conditions.append(
                or_(
                    RequestLog.provider.ilike(pattern, escape="\\"),
                    RequestLog.method.ilike(pattern, escape="\\"),
                    RequestLog.endpoint.ilike(pattern, escape="\\"),
                    RequestLog.caller.ilike(pattern, escape="\\"),
                    RequestLog.model.ilike(pattern, escape="\\"),
                    RequestLog.req_hash.ilike(f"{escaped}%", escape="\\"),
                )
            )

        statement = (
            select(RequestLog)
            .where(*conditions)
            .order_by(RequestLog.occurred_at.desc(), RequestLog.id.desc())
            .limit(limit)
        )
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def count(self, *, source: str | None = None, provider: str | None = None) -> int:
        statement = (
            select(func.count()).select_from(RequestLog).where(RequestLog.user_id == self.user_id)
        )
        if source is not None:
            statement = statement.where(RequestLog.source == source)
        if provider is not None:
            statement = statement.where(RequestLog.provider == provider)
        result = await self.session.execute(statement)
        return int(result.scalar_one())

    async def list_window(
        self,
        start: datetime,
        end: datetime,
        *,
        source: str | None = None,
        limit: int = 200_000,
    ) -> list[RequestLog]:
        if not 1 <= limit <= 200_000:
            raise ValueError("limit must be between 1 and 200000")
        statement = self.select_for_user(RequestLog).where(
            RequestLog.occurred_at >= start,
            RequestLog.occurred_at <= end,
        )
        if source is not None:
            statement = statement.where(RequestLog.source == source)
        statement = statement.order_by(RequestLog.occurred_at.asc(), RequestLog.id.asc()).limit(
            limit
        )
        result = await self.session.execute(statement)
        return list(result.scalars().all())

    async def add(self, log: RequestLog) -> RequestLog:
        self.add_for_user(log)
        await self.flush()
        return log

    async def delete_for_source(self, source: str) -> int:
        if source not in {"demo", "proxy"}:
            raise ValueError("source must be 'demo' or 'proxy'")
        statement = delete(RequestLog).where(
            RequestLog.user_id == self.user_id,
            RequestLog.source == source,
        )
        result = await self.session.execute(statement)
        return result.rowcount or 0

    async def delete_all(self) -> int:
        result = await self.session.execute(
            delete(RequestLog).where(RequestLog.user_id == self.user_id)
        )
        return result.rowcount or 0
