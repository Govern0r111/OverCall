from __future__ import annotations

import base64
import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import UUID

import jwt
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient

from overcall import v1_api
from overcall.config import Settings
from overcall.db.models import UserSettings
from overcall.deps import get_db_session
from overcall.main import create_app

USER_ID = UUID("5d568b35-49d2-48c2-a716-c3861cb2c10b")
ROOT = Path(__file__).resolve().parents[4]


def test_missing_and_invalid_bearer_tokens_are_rejected(client: TestClient) -> None:
    missing = client.get("/v1/me")
    assert missing.status_code == 401
    assert missing.json()["error"]["code"] == "unauthenticated"

    malformed_scheme = client.get("/v1/me", headers={"Authorization": "Basic abc"})
    assert malformed_scheme.status_code == 401
    assert malformed_scheme.json()["error"]["code"] == "unauthenticated"

    invalid_token = client.get("/v1/me", headers={"Authorization": "Bearer not-a-jwt"})
    assert invalid_token.status_code == 401
    assert invalid_token.json()["error"]["code"] == "invalid_token"


def test_every_v1_operation_rejects_a_missing_token(client: TestClient) -> None:
    settings_body = json.loads(
        (ROOT / "contract" / "fixtures" / "api" / "settings.default.json").read_text(
            encoding="utf-8"
        )
    )
    settings_body.pop("updated_at")
    checks = [
        ("GET", "/v1/me", None),
        ("GET", "/v1/overview", None),
        ("GET", "/v1/issues", None),
        ("GET", f"/v1/issues/{USER_ID}", None),
        ("GET", "/v1/logs?q=abcd", None),
        ("GET", "/v1/logs/facets", None),
        ("GET", f"/v1/logs/{USER_ID}", None),
        ("GET", "/v1/providers", None),
        ("GET", "/v1/settings", None),
        ("PUT", "/v1/settings", settings_body),
        ("POST", "/v1/settings/reset", {"confirm": True}),
        ("GET", "/v1/rules", None),
        ("POST", "/v1/detection/run", None),
        ("GET", "/v1/detection/runs/latest", None),
        ("GET", "/v1/accuracy", None),
        ("POST", "/v1/demo/load", {"seed": 42, "days": 1}),
        ("DELETE", "/v1/demo", None),
        ("DELETE", "/v1/data", {"confirm": "delete my data"}),
    ]
    client.app.state.settings.rate_limit_auth_ip_rpm = len(checks)

    for method, path, body in checks:
        response = client.request(method, path, json=body)
        assert response.status_code == 401, (method, path, response.status_code, response.text)
        assert response.json()["error"]["code"] == "unauthenticated", (method, path)


def test_signed_token_authenticates_the_current_user_on_a_v1_route(monkeypatch) -> None:
    settings = Settings(
        app_env="test",
        supabase_url="https://project.supabase.co",
    )
    app = create_app(settings)
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    public_numbers = private_key.public_key().public_numbers()

    def b64url_int(value: int) -> str:
        value_bytes = value.to_bytes((value.bit_length() + 7) // 8, "big")
        return base64.urlsafe_b64encode(value_bytes).rstrip(b"=").decode("ascii")

    jwk = {
        "kty": "RSA",
        "kid": "route-test-key",
        "use": "sig",
        "alg": "RS256",
        "n": b64url_int(public_numbers.n),
        "e": b64url_int(public_numbers.e),
    }

    async def fetch_jwks() -> list[dict[str, str]]:
        return [jwk]

    monkeypatch.setattr(app.state.jwt_verifier, "_fetch_jwks", fetch_jwks)

    class FakeResult:
        def scalar_one(self) -> int:
            return 0

    class FakeSession:
        info = {"app_settings": settings}

        async def commit(self) -> None:
            return None

        async def execute(self, _statement) -> FakeResult:
            return FakeResult()

    class FakeSettingsRepository:
        def __init__(self, _session, _user_id) -> None:
            pass

        async def get_or_create(self) -> UserSettings:
            return UserSettings(user_id=USER_ID)

    class FakeRequestLogRepository:
        def __init__(self, _session, _user_id) -> None:
            pass

        async def count(self, **_kwargs) -> int:
            return 0

        async def list_logs(self, **_kwargs) -> list:
            return []

    monkeypatch.setattr(v1_api, "UserSettingsRepository", FakeSettingsRepository)
    monkeypatch.setattr(v1_api, "RequestLogRepository", FakeRequestLogRepository)

    async def db_session():
        yield FakeSession()

    app.dependency_overrides[get_db_session] = db_session
    now = datetime.now(UTC)
    token = jwt.encode(
        {
            "sub": str(USER_ID),
            "email": "user@example.test",
            "aud": "authenticated",
            "iss": f"{settings.supabase_url}/auth/v1",
            "iat": now,
            "exp": now + timedelta(minutes=5),
        },
        private_key,
        algorithm="RS256",
        headers={"kid": "route-test-key"},
    )

    with TestClient(app) as test_client:
        response = test_client.get("/v1/me", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    assert response.json()["id"] == str(USER_ID)
    assert response.json()["email"] == "user@example.test"
