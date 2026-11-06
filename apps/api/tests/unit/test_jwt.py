from __future__ import annotations

import base64
import time
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec, rsa

from overcall.auth.jwt import JWTVerificationError, SupabaseJWTVerifier
from overcall.config import Settings

SUPABASE_URL = "https://project.supabase.co"
ISSUER = f"{SUPABASE_URL}/auth/v1"
USER_ID = UUID("5d568b35-49d2-48c2-a716-c3861cb2c10b")


def _b64url_int(value: int) -> str:
    value_bytes = value.to_bytes((value.bit_length() + 7) // 8, "big")
    return base64.urlsafe_b64encode(value_bytes).rstrip(b"=").decode("ascii")


def _key_pair() -> tuple[Any, dict[str, str]]:
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    public_numbers = private_key.public_key().public_numbers()
    jwk = {
        "kty": "RSA",
        "kid": "test-key",
        "use": "sig",
        "alg": "RS256",
        "n": _b64url_int(public_numbers.n),
        "e": _b64url_int(public_numbers.e),
    }
    return private_key, jwk


def _claims(**overrides: Any) -> dict[str, Any]:
    claims = {
        "sub": str(USER_ID),
        "email": "user@example.test",
        "aud": "authenticated",
        "iss": ISSUER,
        "iat": datetime.now(UTC),
        "exp": datetime.now(UTC) + timedelta(minutes=5),
    }
    claims.update(overrides)
    return claims


def _verifier() -> SupabaseJWTVerifier:
    settings = Settings(
        app_env="test",
        supabase_url=SUPABASE_URL,
    )
    return SupabaseJWTVerifier(
        supabase_url=settings.supabase_url,
        jwt_secret=None,
        allowed_algorithms=settings.jwt_allowed_algorithms,
    )


def _token(private_key: Any, *, kid: str = "test-key", **claims: Any) -> str:
    return jwt.encode(_claims(**claims), private_key, algorithm="RS256", headers={"kid": kid})


@pytest.mark.asyncio
async def test_verifies_rs256_and_refreshes_for_an_unknown_kid(monkeypatch) -> None:
    first_private, first_jwk = _key_pair()
    second_private, second_jwk = _key_pair()
    second_jwk["kid"] = "rotated-key"
    verifier = _verifier()
    fetched: list[list[dict[str, str]]] = [
        [first_jwk],
        [first_jwk, second_jwk],
    ]
    fetch_count = 0

    async def fetch_jwks() -> list[dict[str, str]]:
        nonlocal fetch_count
        fetch_count += 1
        return fetched[min(fetch_count - 1, len(fetched) - 1)]

    monkeypatch.setattr(verifier, "_fetch_jwks", fetch_jwks)

    first_claims = await verifier.verify(_token(first_private))
    second_claims = await verifier.verify(_token(second_private, kid="rotated-key"))

    assert first_claims["sub"] == str(USER_ID)
    assert second_claims["sub"] == str(USER_ID)
    assert fetch_count == 2


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "overrides",
    [
        {"exp": datetime.now(UTC) - timedelta(seconds=31)},
        {"aud": "other"},
        {"aud": ["authenticated", "other"]},
        {"iss": "https://attacker.example/auth/v1"},
        {"sub": ""},
        {"sub": None},
    ],
)
async def test_rejects_invalid_claims(overrides: dict[str, Any], monkeypatch) -> None:
    private_key, jwk = _key_pair()
    verifier = _verifier()

    async def fetch_jwks() -> list[dict[str, str]]:
        return [jwk]

    monkeypatch.setattr(verifier, "_fetch_jwks", fetch_jwks)
    with pytest.raises(JWTVerificationError):
        await verifier.verify(_token(private_key, **overrides))


@pytest.mark.asyncio
async def test_requires_expiration_claim_and_rejects_invalid_signature(monkeypatch) -> None:
    private_key, jwk = _key_pair()
    other_private, _ = _key_pair()
    verifier = _verifier()

    async def fetch_jwks() -> list[dict[str, str]]:
        return [jwk]

    monkeypatch.setattr(verifier, "_fetch_jwks", fetch_jwks)
    missing_exp = jwt.encode(
        {key: value for key, value in _claims().items() if key != "exp"},
        private_key,
        algorithm="RS256",
        headers={"kid": "test-key"},
    )

    with pytest.raises(JWTVerificationError):
        await verifier.verify(missing_exp)
    with pytest.raises(JWTVerificationError):
        await verifier.verify(_token(other_private))


@pytest.mark.asyncio
async def test_rejects_hs256_without_explicit_legacy_secret(monkeypatch) -> None:
    verifier = _verifier()
    token = jwt.encode(_claims(), "not-a-configured-supabase-secret", algorithm="HS256")

    async def fetch_jwks() -> list[dict[str, str]]:
        pytest.fail("HS256 must not trigger a JWKS lookup")

    monkeypatch.setattr(verifier, "_fetch_jwks", fetch_jwks)
    with pytest.raises(JWTVerificationError):
        await verifier.verify(token)


@pytest.mark.asyncio
async def test_rejects_none_algorithm() -> None:
    verifier = _verifier()
    token = jwt.encode(_claims(), key="", algorithm="none")

    with pytest.raises(JWTVerificationError):
        await verifier.verify(token)


@pytest.mark.asyncio
async def test_legacy_hs256_is_accepted_only_when_secret_is_configured() -> None:
    secret = "s" * 40
    settings = Settings(
        app_env="test",
        supabase_url=SUPABASE_URL,
        supabase_jwt_secret=secret,
    )
    verifier = SupabaseJWTVerifier(
        supabase_url=settings.supabase_url,
        jwt_secret=settings.supabase_jwt_secret.get_secret_value(),
        allowed_algorithms=settings.jwt_allowed_algorithms,
    )
    token = jwt.encode(_claims(), secret, algorithm="HS256")

    claims = await verifier.verify(token)

    assert claims["sub"] == str(USER_ID)


@pytest.mark.asyncio
async def test_uses_cached_key_if_jwks_refresh_fails(monkeypatch) -> None:
    private_key, jwk = _key_pair()
    verifier = _verifier()

    async def fetch_jwks() -> list[dict[str, str]]:
        return [jwk]

    monkeypatch.setattr(verifier, "_fetch_jwks", fetch_jwks)
    token = _token(private_key)
    await verifier.verify(token)
    verifier._cache_expires_at = time.monotonic() - 1

    async def fail_fetch() -> list[dict[str, str]]:
        raise JWTVerificationError("network unavailable")

    monkeypatch.setattr(verifier, "_fetch_jwks", fail_fetch)
    assert (await verifier.verify(token))["sub"] == str(USER_ID)


def test_jwt_algorithm_configuration_is_allowlisted() -> None:
    with pytest.raises(ValueError, match="only RS256 and ES256"):
        Settings(app_env="test", supabase_jwt_algorithms="RS256,HS256")


def test_legacy_jwt_secret_must_have_at_least_32_characters() -> None:
    with pytest.raises(ValueError, match="at least 32 characters"):
        Settings(app_env="test", supabase_jwt_secret="too-short")


@pytest.mark.asyncio
async def test_verifies_es256_with_a_supabase_jwk(monkeypatch) -> None:
    private_key = ec.generate_private_key(ec.SECP256R1())
    public_numbers = private_key.public_key().public_numbers()
    jwk = {
        "kty": "EC",
        "kid": "ec-test-key",
        "use": "sig",
        "alg": "ES256",
        "crv": "P-256",
        "x": _b64url_int(public_numbers.x),
        "y": _b64url_int(public_numbers.y),
    }
    verifier = _verifier()

    async def fetch_jwks() -> list[dict[str, str]]:
        return [jwk]

    monkeypatch.setattr(verifier, "_fetch_jwks", fetch_jwks)
    token = jwt.encode(
        _claims(), private_key, algorithm="ES256", headers={"kid": "ec-test-key"}
    )

    claims = await verifier.verify(token)

    assert claims["sub"] == str(USER_ID)
