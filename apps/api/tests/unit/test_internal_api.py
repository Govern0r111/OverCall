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

    async def scalar(self, statement: Any) -> Any:
        self.statements.append(str(statement))
        if self.error is not None:
            raise self.error
        return self.value


def _client(
    session: FakeSession | None = None,
    *,
    internal_token: str | None = INTERNAL_TOKEN,
) -> TestClient:
    token = SecretStr(internal_token) if internal_token is not None else None
    app = create_app(Settings(app_env="test", database_url=None, internal_token=token))
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
