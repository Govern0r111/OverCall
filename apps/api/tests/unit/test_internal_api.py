from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient
from pydantic import SecretStr

from overcall.config import Settings
from overcall.deps import get_db_session
from overcall.main import create_app

INTERNAL_TOKEN = "internal-test-token-" + ("x" * 24)
DATABASE_SIZE_QUERY = "SELECT pg_database_size(current_database())"


class FakeSession:
    def __init__(self, value: Any = None, error: Exception | None = None) -> None:
        self.value = value
        self.error = error
        self.statements: list[str] = []
        self.parameters: list[dict[str, object] | None] = []
        self.commit_count = 0
        self.rollback_count = 0

    async def scalar(
        self,
        statement: Any,
        parameters: dict[str, object] | None = None,
    ) -> Any:
        self.statements.append(str(statement))
        self.parameters.append(parameters)
        if self.error is not None:
            raise self.error
        return self.value

    async def commit(self) -> None:
        self.commit_count += 1

    async def rollback(self) -> None:
        self.rollback_count += 1


def _client(
    session: FakeSession | None = None,
    *,
    internal_token: str | None = INTERNAL_TOKEN,
    settings: Settings | None = None,
) -> TestClient:
    token = SecretStr(internal_token) if internal_token is not None else None
    app = create_app(settings or Settings(app_env="test", database_url=None, internal_token=token))
    if session is not None:

        async def db_session():
            yield session

        app.dependency_overrides[get_db_session] = db_session
    return TestClient(app)


def test_internal_database_size_hides_endpoint_without_valid_bearer_token() -> None:
    with _client() as client:
        for headers in (
            {},
            {"Authorization": "Basic " + INTERNAL_TOKEN},
            {"Authorization": "Bearer wrong-token"},
        ):
            response = client.get("/internal/db-size", headers=headers)
            assert response.status_code == 404
            assert response.json()["error"]["code"] == "not_found"

        assert "/internal/db-size" not in client.get("/openapi.json").json()["paths"]


def test_internal_database_size_requires_a_configured_token() -> None:
    with _client(internal_token=None) as client:
        response = client.get(
            "/internal/db-size",
            headers={"Authorization": f"Bearer {INTERNAL_TOKEN}"},
        )

    assert response.status_code == 404


def test_internal_database_size_returns_usage_for_authorized_operator() -> None:
    session = FakeSession(value=131_072_000)
    with _client(session) as client:
        response = client.get(
            "/internal/db-size",
            headers={"Authorization": f"Bearer {INTERNAL_TOKEN}"},
        )

    assert response.status_code == 200
    assert response.json() == {
        "bytes": 131_072_000,
        "limit_bytes": 524_288_000,
        "percent": 25.0,
    }
    assert session.statements == [DATABASE_SIZE_QUERY]


def test_internal_database_size_fails_closed_when_database_query_fails() -> None:
    session = FakeSession(error=RuntimeError("database URL must not leak"))
    with _client(session) as client:
        response = client.get(
            "/internal/db-size",
            headers={"Authorization": f"Bearer {INTERNAL_TOKEN}"},
        )

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "not_ready"
    assert "database URL must not leak" not in response.text


def test_internal_database_size_rejects_invalid_database_result() -> None:
    session = FakeSession(value=None)
    with _client(session) as client:
        response = client.get(
            "/internal/db-size",
            headers={"Authorization": f"Bearer {INTERNAL_TOKEN}"},
        )

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "not_ready"


def test_internal_purge_requires_auth_before_opening_a_database_session() -> None:
    app = create_app(
        Settings(
            app_env="test",
            database_url=None,
            internal_token=SecretStr(INTERNAL_TOKEN),
        )
    )
    db_called = False

    async def db_session():
        nonlocal db_called
        db_called = True
        raise AssertionError("database dependency must not run for an unauthorized request")
        yield

    app.dependency_overrides[get_db_session] = db_session
    with TestClient(app) as client:
        response = client.post("/internal/purge")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"
    assert not db_called


def test_internal_purge_executes_configured_caps_and_commits() -> None:
    session = FakeSession(value=4)
    settings = Settings(
        app_env="test",
        database_url=None,
        internal_token=SecretStr(INTERNAL_TOKEN),
        log_retention_default_days=7,
        max_logs_per_user=321,
    )
    with _client(session, settings=settings) as client:
        response = client.post(
            "/internal/purge",
            headers={"Authorization": f"Bearer {INTERNAL_TOKEN}"},
        )

    assert response.status_code == 200
    assert response.json() == {"rows_deleted": 4}
    assert len(session.statements) == 1
    assert "public.purge_old_logs" in session.statements[0]
    assert session.parameters == [{"batch": 5000, "retention_days": 7, "max_logs_per_user": 321}]
    assert session.commit_count == 1
    assert session.rollback_count == 0


def test_internal_purge_rolls_back_and_hides_database_errors() -> None:
    session = FakeSession(error=RuntimeError("database details must not leak"))
    with _client(session) as client:
        response = client.post(
            "/internal/purge",
            headers={"Authorization": f"Bearer {INTERNAL_TOKEN}"},
        )

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "not_ready"
    assert "database details must not leak" not in response.text
    assert session.commit_count == 0
    assert session.rollback_count == 1
