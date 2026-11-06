from __future__ import annotations

import asyncio
import hashlib
import hmac
import os
import secrets
import time
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool

from overcall.config import Settings
from overcall.db.repos import IngestKeyRepository
from overcall.deps import UserContext, get_current_user, get_db_session
from overcall.main import create_app

INGEST_KEY_PEPPER = "local-ingest-key-test-pepper-" + ("x" * 24)
PREVIOUS_INGEST_KEY_PEPPER = "previous-ingest-key-test-pepper-" + ("y" * 23)


def _database_url() -> str:
    value = os.getenv("TEST_DATABASE_URL")
    if not value:
        pytest.skip("TEST_DATABASE_URL is required for PostgreSQL integration tests")
    if value.startswith("postgresql://"):
        return value.replace("postgresql://", "postgresql+asyncpg://", 1)
    return value


@pytest.fixture
def api_and_database():
    url = _database_url()
    engine = create_async_engine(
        url,
        connect_args={"statement_cache_size": 0},
        poolclass=NullPool,
    )
    owner_id = uuid4()
    other_id = uuid4()
    issue_id = uuid4()
    run_id = uuid4()
    log_id = uuid4()

    async def seed() -> None:
        async with engine.begin() as connection:
            await connection.execute(
                text("insert into auth.users (id) values (:owner), (:other)"),
                {"owner": owner_id, "other": other_id},
            )
            await connection.execute(
                text(
                    """
                    insert into public.detection_runs (id, user_id, status, is_demo_data)
                    values (:id, :user_id, 'succeeded', false)
                    """
                ),
                {"id": run_id, "user_id": owner_id},
            )
            await connection.execute(
                text(
                    """
                    insert into public.issues (
                        id, user_id, run_id, rule_id, tier, experimental, provider,
                        endpoint, severity, impact_kind, title, summary, explanation,
                        suggested_fix, affected_count, is_demo_data
                    ) values (
                        :id, :user_id, :run_id, 'duplicate_calls', 1, false, 'openai',
                        '/v1/chat/completions', 'warning', 'spend', 'Duplicate calls',
                        'Repeated calls', 'The same call was repeated.', 'Cache the result.',
                        1, false
                    )
                    """
                ),
                {"id": issue_id, "user_id": owner_id, "run_id": run_id},
            )
            await connection.execute(
                text(
                    """
                    insert into public.request_logs (
                        id, user_id, source, origin, occurred_at, provider, method,
                        endpoint, status, latency_ms, req_size, resp_size, req_hash,
                        cost_basis
                    ) values (
                        :id, :user_id, 'proxy', 'upstream', now(), 'openai', 'GET',
                        '/v1/models', 200, 1, 1, 1, 'integration-test-hash', 'billed'
                    )
                    """
                ),
                {"id": log_id, "user_id": owner_id},
            )

    asyncio.run(seed())

    settings = Settings(
        app_env="test",
        database_url=SecretStr(url),
        release="test",
        ingest_key_pepper=SecretStr(INGEST_KEY_PEPPER),
        ingest_key_pepper_prev=SecretStr(PREVIOUS_INGEST_KEY_PEPPER),
    )
    app = create_app(settings)
    identity = {"user_id": owner_id}

    async def current_user() -> UserContext:
        return UserContext(user_id=identity["user_id"])

    async def db_session():
        async with AsyncSession(engine, expire_on_commit=False) as session:
            session.info["app_settings"] = settings
            yield session

    app.dependency_overrides[get_current_user] = current_user
    app.dependency_overrides[get_db_session] = db_session
    try:
        with TestClient(app) as client:
            yield client, engine, identity, owner_id, other_id, issue_id, log_id
    finally:

        async def cleanup() -> None:
            async with engine.begin() as connection:
                await connection.execute(
                    text("delete from auth.users where id in (:owner, :other)"),
                    {"owner": owner_id, "other": other_id},
                )
            await engine.dispose()

        asyncio.run(cleanup())


def test_ingest_key_create_list_use_and_revoke_lifecycle(api_and_database, caplog) -> None:
    client, engine, identity, owner_id, other_id, _issue_id, _log_id = api_and_database
    created = client.post("/v1/ingest-keys", json={"name": "  checkout-service  "})

    assert created.status_code == 201
    result = created.json()
    plaintext = result["key"]
    key_id = UUID(result["id"])
    assert result["name"] == "checkout-service"
    assert result["prefix"] == plaintext[:9]
    assert plaintext.startswith("oc_")
    assert len(plaintext) == 46

    listed = client.get("/v1/ingest-keys")
    assert listed.status_code == 200
    assert len(listed.json()) == 1
    assert "key" not in listed.json()[0]
    assert listed.json()[0]["last_used_at"] is None

    async def stored_key() -> tuple[str, str]:
        async with engine.connect() as connection:
            row = (
                await connection.execute(
                    text(
                        """
                        select key_hash, prefix
                        from public.ingest_keys
                        where id = :id and user_id = :user_id
                        """
                    ),
                    {"id": key_id, "user_id": owner_id},
                )
            ).one()
            return row.key_hash, row.prefix

    key_hash, stored_prefix = asyncio.run(stored_key())
    assert (
        key_hash
        == hmac.new(INGEST_KEY_PEPPER.encode(), plaintext.encode(), hashlib.sha256).hexdigest()
    )
    assert plaintext not in key_hash
    assert stored_prefix == plaintext[:9]
    assert plaintext not in caplog.text

    # Proxy use validates the stored digest and updates last_used_at without caching auth.
    body_sentinel = "proxy-metadata-test-body-sentinel"
    started = time.perf_counter()
    used = client.post(
        "/proxy/openai/v1/chat/completions",
        json={
            "model": "gpt-4o-mini",
            "messages": [{"role": "user", "content": body_sentinel}],
        },
        headers={"x-overcall-key": plaintext},
    )
    assert used.status_code == 200
    used_key = client.get("/v1/ingest-keys").json()[0]
    assert used_key["last_used_at"] is not None, caplog.text

    async def stored_proxy_log() -> dict:
        async with engine.connect() as connection:
            row = (
                (
                    await connection.execute(
                        text(
                            """
                        select id, ingest_key_id, source, origin, provider, endpoint, status,
                               req_size, resp_size, req_hash, model, prompt_tokens,
                               completion_tokens, cost_basis, pricing_version
                        from public.request_logs
                        where user_id = :user_id and ingest_key_id = :key_id
                        order by occurred_at desc
                        limit 1
                        """
                        ),
                        {"user_id": owner_id, "key_id": key_id},
                    )
                )
                .mappings()
                .one()
            )
            return dict(row)

    proxy_log = asyncio.run(stored_proxy_log())
    assert time.perf_counter() - started < 2
    assert proxy_log["ingest_key_id"] == key_id
    assert proxy_log["source"] == "proxy"
    assert proxy_log["origin"] == "upstream"
    assert proxy_log["provider"] == "openai"
    assert proxy_log["endpoint"] == "/v1/chat/completions"
    assert proxy_log["status"] == 200
    assert proxy_log["req_size"] > 0
    assert proxy_log["resp_size"] > 0
    assert proxy_log["req_hash"]
    assert proxy_log["cost_basis"] == "billed"
    assert proxy_log["pricing_version"]
    assert body_sentinel not in repr(proxy_log)
    assert plaintext not in repr(proxy_log)
    assert plaintext not in caplog.text

    for index in range(4):
        response = client.post("/v1/ingest-keys", json={"name": f"worker-{index}"})
        assert response.status_code == 201
    assert client.post("/v1/ingest-keys", json={"name": "sixth"}).status_code == 409
    assert client.post("/v1/ingest-keys", json={"name": " "}).status_code == 422

    identity["user_id"] = other_id
    assert client.get("/v1/ingest-keys").json() == []
    assert client.delete(f"/v1/ingest-keys/{key_id}").status_code == 204

    identity["user_id"] = owner_id
    active_owner_key = next(
        key for key in client.get("/v1/ingest-keys").json() if key["id"] == str(key_id)
    )
    assert active_owner_key["revoked_at"] is None
    assert client.delete(f"/v1/ingest-keys/{key_id}").status_code == 204
    assert client.delete(f"/v1/ingest-keys/{key_id}").status_code == 204
    revoked = next(key for key in client.get("/v1/ingest-keys").json() if key["id"] == str(key_id))
    assert revoked["revoked_at"] is not None

    rejected = client.get("/proxy/openai/v1/models", headers={"x-overcall-key": plaintext})
    assert rejected.status_code == 401
    assert rejected.json()["error"]["code"] == "ingest_key_revoked"


def test_id_taking_endpoints_hide_foreign_tenant_rows(api_and_database) -> None:
    client, _engine, identity, owner_id, other_id, issue_id, log_id = api_and_database
    key_response = client.post("/v1/ingest-keys", json={"name": "owner-key"})
    assert key_response.status_code == 201
    key_id = key_response.json()["id"]
    plaintext = key_response.json()["key"]

    assert client.get(f"/v1/issues/{issue_id}").status_code == 200
    assert client.get(f"/v1/logs/{log_id}").status_code == 200

    identity["user_id"] = other_id
    assert client.get("/v1/ingest-keys").json() == []
    assert client.get(f"/v1/issues/{issue_id}").status_code == 404
    assert client.get(f"/v1/logs/{log_id}").status_code == 404
    assert client.delete(f"/v1/ingest-keys/{key_id}").status_code == 204

    identity["user_id"] = owner_id
    assert client.get(f"/v1/issues/{issue_id}").status_code == 200
    assert client.get(f"/v1/logs/{log_id}").status_code == 200
    proxy_response = client.get("/proxy/openai/v1/models", headers={"x-overcall-key": plaintext})
    assert proxy_response.status_code == 200


def test_concurrent_key_creation_enforces_five_active_key_limit(api_and_database) -> None:
    _client, engine, _identity, owner_id, _other_id, _issue_id, _log_id = api_and_database

    async def create_key(index: int) -> bool:
        plaintext = f"oc_{secrets.token_urlsafe(32)}"
        key_hash = hmac.new(
            INGEST_KEY_PEPPER.encode(), plaintext.encode(), hashlib.sha256
        ).hexdigest()
        async with AsyncSession(engine, expire_on_commit=False) as session:
            row = await IngestKeyRepository(session).create_for_user(
                owner_id,
                name=f"parallel-{index}",
                prefix=plaintext[:9],
                key_hash=key_hash,
                pepper_version=1,
            )
            await session.commit()
            return row is not None

    async def create_all() -> list[bool]:
        return await asyncio.gather(*(create_key(index) for index in range(8)))

    outcomes = asyncio.run(create_all())
    assert sum(outcomes) == 5


def test_proxy_use_persists_pepper_rotation(api_and_database) -> None:
    client, engine, _identity, owner_id, _other_id, _issue_id, _log_id = api_and_database
    plaintext = f"oc_{secrets.token_urlsafe(32)}"
    previous_hash = hmac.new(
        PREVIOUS_INGEST_KEY_PEPPER.encode(), plaintext.encode(), hashlib.sha256
    ).hexdigest()
    key_id = uuid4()

    async def seed_previous_key() -> None:
        async with engine.begin() as connection:
            await connection.execute(
                text(
                    """
                    insert into public.ingest_keys
                        (id, user_id, name, prefix, key_hash, pepper_version)
                    values
                        (:id, :user_id, 'previous-pepper', :prefix, :key_hash, 1)
                    """
                ),
                {
                    "id": key_id,
                    "user_id": owner_id,
                    "prefix": plaintext[:9],
                    "key_hash": previous_hash,
                },
            )

    asyncio.run(seed_previous_key())
    response = client.get("/proxy/openai/v1/models", headers={"x-overcall-key": plaintext})
    assert response.status_code == 200

    async def read_rotated_key() -> tuple[str, int, object | None]:
        async with engine.connect() as connection:
            row = (
                await connection.execute(
                    text(
                        """
                        select key_hash, pepper_version, last_used_at
                        from public.ingest_keys
                        where id = :id and user_id = :user_id
                        """
                    ),
                    {"id": key_id, "user_id": owner_id},
                )
            ).one()
            return row.key_hash, row.pepper_version, row.last_used_at

    current_hash, pepper_version, last_used_at = asyncio.run(read_rotated_key())
    assert (
        current_hash
        == hmac.new(INGEST_KEY_PEPPER.encode(), plaintext.encode(), hashlib.sha256).hexdigest()
    )
    assert current_hash != previous_hash
    assert pepper_version == 1
    assert last_used_at is not None
