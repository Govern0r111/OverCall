from __future__ import annotations

import asyncio
import os
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool


def _database_url() -> str:
    value = os.getenv("TEST_DATABASE_URL")
    if not value:
        pytest.skip("TEST_DATABASE_URL is required for PostgreSQL retention integration test")
    if value.startswith("postgresql://"):
        return value.replace("postgresql://", "postgresql+asyncpg://", 1)
    return value


def test_purge_removes_expired_rows_and_enforces_user_and_demo_caps() -> None:
    engine = create_async_engine(
        _database_url(),
        connect_args={"statement_cache_size": 0},
        poolclass=NullPool,
    )
    user_with_retention = uuid4()
    user_for_row_cap = uuid4()
    now = datetime.now(UTC)

    rows = {
        "expired_proxy": (user_with_retention, "proxy", now - timedelta(days=10)),
        "expired_demo": (user_with_retention, "demo", now - timedelta(days=10)),
        "recent_proxy": (user_with_retention, "proxy", now - timedelta(days=3)),
        "older_demo": (user_with_retention, "demo", now - timedelta(days=2)),
        "newest_demo": (user_with_retention, "demo", now - timedelta(days=1)),
        "cap_oldest": (user_for_row_cap, "proxy", now - timedelta(days=4)),
        "cap_second": (user_for_row_cap, "proxy", now - timedelta(days=3)),
        "cap_third": (user_for_row_cap, "proxy", now - timedelta(days=2)),
        "cap_newest": (user_for_row_cap, "proxy", now - timedelta(days=1)),
    }

    async def run() -> None:
        async with engine.begin() as connection:
            await connection.execute(
                text("insert into auth.users (id) values (:first), (:second)"),
                {"first": user_with_retention, "second": user_for_row_cap},
            )
            await connection.execute(
                text(
                    "insert into public.user_settings (user_id, retention_days) "
                    "values (:user_id, 7)"
                ),
                {"user_id": user_with_retention},
            )
            for name, (user_id, source, occurred_at) in rows.items():
                await connection.execute(
                    text(
                        """
                        insert into public.request_logs (
                            id, user_id, source, occurred_at, provider, method, endpoint,
                            status, latency_ms, req_size, resp_size, req_hash, cost_basis
                        ) values (
                            :id, :user_id, :source, :occurred_at, 'openai', 'POST',
                            '/v1/chat/completions', 200, 1, 0, 0, :req_hash, 'estimated'
                        )
                        """
                    ),
                    {
                        "id": uuid4(),
                        "user_id": user_id,
                        "source": source,
                        "occurred_at": occurred_at,
                        "req_hash": name,
                    },
                )

            deleted = await connection.scalar(
                text(
                    """
                    select public.purge_old_logs(
                        batch => 2,
                        default_retention_days => 7,
                        max_logs_per_user => 3,
                        max_demo_logs_per_user => 1
                    )
                    """
                )
            )
            assert deleted == 4

            survivors = (
                (await connection.execute(text("select req_hash from public.request_logs")))
                .scalars()
                .all()
            )
            assert set(survivors) == {
                "recent_proxy",
                "newest_demo",
                "cap_second",
                "cap_third",
                "cap_newest",
            }

    try:
        asyncio.run(run())
    finally:
        asyncio.run(_cleanup(engine, user_with_retention, user_for_row_cap))
        asyncio.run(engine.dispose())


async def _cleanup(engine, *user_ids) -> None:
    async with engine.begin() as connection:
        await connection.execute(
            text("delete from auth.users where id = any(:user_ids)"),
            {"user_ids": list(user_ids)},
        )
