from __future__ import annotations

import asyncio
import os
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import NullPool

from overcall import v1_api
from overcall.config import Settings
from overcall.db.models import Issue
from overcall.deps import UserContext, get_current_user, get_db_session
from overcall.main import create_app
from overcall.rules.base import Finding


def _database_url() -> str:
    value = os.getenv("TEST_DATABASE_URL")
    if not value:
        pytest.skip("TEST_DATABASE_URL is required for PostgreSQL atomicity integration test")
    if value.startswith("postgresql://"):
        return value.replace("postgresql://", "postgresql+asyncpg://", 1)
    return value


class ProducingTier1Rule:
    id = "duplicate_calls"
    name = "Duplicate calls"
    tier = 1

    def detect(self, _logs, _context) -> list[Finding]:
        return [
            Finding(
                issue_type=self.id,
                severity="info",
                provider="openai",
                endpoint="/v1/chat/completions",
                title="Atomicity test issue",
                summary="Test-only issue.",
                explanation="Injected to exercise the delete-and-replace transaction.",
                suggested_fix="No action.",
                affected=[],
                waste_by_request={},
            )
        ]


def test_detection_failure_after_issue_delete_preserves_previous_state(monkeypatch) -> None:
    url = _database_url()
    engine = create_async_engine(
        url,
        connect_args={"statement_cache_size": 0},
        poolclass=NullPool,
    )
    user_id = uuid4()
    old_run_id = uuid4()
    old_issue_id = uuid4()

    async def seed() -> None:
        async with engine.begin() as connection:
            await connection.execute(
                text("insert into auth.users (id) values (:user_id)"),
                {"user_id": user_id},
            )
            await connection.execute(
                text(
                    """
                    insert into public.detection_runs (id, user_id, status, is_demo_data)
                    values (:run_id, :user_id, 'succeeded', false)
                    """
                ),
                {"run_id": old_run_id, "user_id": user_id},
            )
            await connection.execute(
                text(
                    """
                    insert into public.issues (
                        id, user_id, run_id, rule_id, tier, experimental, provider,
                        endpoint, severity, impact_kind, title, summary, explanation,
                        suggested_fix, affected_count, is_demo_data
                    ) values (
                        :issue_id, :user_id, :run_id, 'duplicate_calls', 1, false,
                        'openai', '/v1/chat/completions', 'warning', 'spend',
                        'Old issue', 'Keep this row on rollback.',
                        'This row predates the failed replacement.', 'No action.',
                        1, false
                    )
                    """
                ),
                {"issue_id": old_issue_id, "user_id": user_id, "run_id": old_run_id},
            )

    asyncio.run(seed())
    settings = Settings(
        app_env="test",
        database_url=None,
        release="test",
    )
    app = create_app(settings)

    async def current_user() -> UserContext:
        return UserContext(user_id=user_id)

    async def db_session():
        async with AsyncSession(engine, expire_on_commit=False) as session:

            def fail_new_issue_flush(sync_session: Session, _flush_context, _instances) -> None:
                if any(isinstance(value, Issue) for value in sync_session.new):
                    raise RuntimeError("simulated failure after issue deletion")

            event.listen(session.sync_session, "before_flush", fail_new_issue_flush)
            yield session

    app.dependency_overrides[get_current_user] = current_user
    app.dependency_overrides[get_db_session] = db_session
    monkeypatch.setattr(v1_api, "RULES", [ProducingTier1Rule()])

    try:
        with TestClient(app, raise_server_exceptions=False) as client:
            response = client.post("/v1/detection/run")
        assert response.status_code == 500

        async def persisted_state() -> tuple[list[object], int]:
            async with engine.connect() as connection:
                issue_rows = (
                    await connection.execute(
                        text(
                            """
                            select id, run_id, title
                            from public.issues
                            where user_id = :user_id
                            """
                        ),
                        {"user_id": user_id},
                    )
                ).all()
                run_count = await connection.scalar(
                    text("select count(*) from public.detection_runs where user_id = :user_id"),
                    {"user_id": user_id},
                )
                return issue_rows, int(run_count or 0)

        issue_rows, run_count = asyncio.run(persisted_state())
        assert [(row.id, row.run_id, row.title) for row in issue_rows] == [
            (old_issue_id, old_run_id, "Old issue")
        ]
        assert run_count == 1
    finally:

        async def cleanup() -> None:
            async with engine.begin() as connection:
                await connection.execute(
                    text("delete from auth.users where id = :user_id"),
                    {"user_id": user_id},
                )
            await engine.dispose()

        asyncio.run(cleanup())
