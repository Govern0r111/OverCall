from __future__ import annotations

import asyncio
import os
from urllib.parse import urlparse
from uuid import UUID

import asyncpg


async def seed_user() -> None:
    database_url = os.getenv("TEST_DATABASE_URL")
    user_id = os.getenv("E2E_USER_ID")
    if not database_url or not user_id:
        raise RuntimeError("TEST_DATABASE_URL and E2E_USER_ID are required.")
    if urlparse(database_url).hostname not in {"localhost", "127.0.0.1", "host.docker.internal"}:
        raise RuntimeError("Refusing to seed a non-local E2E database.")

    connection = await asyncpg.connect(database_url)
    try:
        await connection.execute(
            "insert into auth.users (id) values ($1) on conflict (id) do nothing",
            UUID(user_id),
        )
    finally:
        await connection.close()


if __name__ == "__main__":
    asyncio.run(seed_user())
