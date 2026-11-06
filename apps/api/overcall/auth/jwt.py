from __future__ import annotations

import asyncio
import time
from typing import Any

import httpx
import jwt
from jwt.exceptions import PyJWTError

_JWKS_CACHE_TTL_SECONDS = 300
_JWKS_TIMEOUT_SECONDS = 5
_JWT_LEEWAY_SECONDS = 30
_MAX_JWKS_KEYS = 100
_AUDIENCE = "authenticated"


class JWTVerificationError(Exception):
    """Raised when an access token cannot be verified against configured Supabase keys."""


class SupabaseJWTVerifier:
    def __init__(
        self,
        *,
        supabase_url: str | None,
        jwt_secret: str | None,
        allowed_algorithms: tuple[str, ...],
        cache_ttl_seconds: int = _JWKS_CACHE_TTL_SECONDS,
    ) -> None:
        self._issuer = f"{supabase_url.rstrip('/')}/auth/v1" if supabase_url else None
        self._jwks_url = f"{self._issuer}/.well-known/jwks.json" if self._issuer else None
        self._jwt_secret = jwt_secret
        self._allowed_algorithms = frozenset(allowed_algorithms)
        self._cache_ttl_seconds = cache_ttl_seconds
        self._jwks: dict[str, dict[str, Any]] = {}
        self._cache_expires_at = 0.0
        self._cache_lock = asyncio.Lock()

    async def verify(self, token: str) -> dict[str, Any]:
        if not self._issuer or not token:
            raise JWTVerificationError("JWT verification is not configured.")

        try:
            header = jwt.get_unverified_header(token)
        except PyJWTError as exc:
            raise JWTVerificationError("The token header is invalid.") from exc

        algorithm = header.get("alg")
        if not isinstance(algorithm, str) or algorithm not in self._allowed_algorithms:
            raise JWTVerificationError("The token algorithm is not allowed.")

        if algorithm == "HS256":
            if self._jwt_secret is None:
                raise JWTVerificationError("Legacy HS256 verification is not configured.")
            signing_key: Any = self._jwt_secret
        else:
            kid = header.get("kid")
            if not isinstance(kid, str) or not kid:
                raise JWTVerificationError("The token has no signing key id.")
            jwk = await self._get_jwk(kid)
            if jwk.get("use") not in (None, "sig"):
                raise JWTVerificationError("The JWK is not a signing key.")
            key_ops = jwk.get("key_ops")
            if key_ops is not None and (
                not isinstance(key_ops, list) or "verify" not in key_ops
            ):
                raise JWTVerificationError("The JWK cannot verify signatures.")
            if jwk.get("alg") not in (None, algorithm):
                raise JWTVerificationError("The JWK algorithm does not match the token.")
            try:
                signing_key = jwt.PyJWK.from_dict(jwk, algorithm=algorithm).key
            except (PyJWTError, TypeError, ValueError) as exc:
                raise JWTVerificationError("The signing key is invalid.") from exc

        try:
            claims = jwt.decode(
                token,
                signing_key,
                algorithms=tuple(self._allowed_algorithms),
                audience=_AUDIENCE,
                issuer=self._issuer,
                leeway=_JWT_LEEWAY_SECONDS,
                options={
                    "require": ["exp", "aud", "iss", "sub"],
                    "strict_aud": True,
                },
            )
        except PyJWTError as exc:
            raise JWTVerificationError("The token claims or signature are invalid.") from exc

        if not isinstance(claims.get("sub"), str) or not claims["sub"]:
            raise JWTVerificationError("The token subject is invalid.")
        return claims

    async def _get_jwk(self, kid: str) -> dict[str, Any]:
        cached_key = self._jwks.get(kid)
        if cached_key is not None and time.monotonic() < self._cache_expires_at:
            return cached_key

        async with self._cache_lock:
            cached_key = self._jwks.get(kid)
            cache_is_fresh = time.monotonic() < self._cache_expires_at
            if cached_key is not None and cache_is_fresh:
                return cached_key

            try:
                keys = await self._fetch_jwks()
            except JWTVerificationError:
                if cached_key is not None:
                    return cached_key
                raise

            self._jwks = {
                jwk["kid"]: jwk
                for jwk in keys
                if isinstance(jwk, dict) and isinstance(jwk.get("kid"), str) and jwk["kid"]
            }
            self._cache_expires_at = time.monotonic() + self._cache_ttl_seconds
            key = self._jwks.get(kid)
            if key is None:
                raise JWTVerificationError("The signing key id is not present in the JWKS.")
            return key

    async def _fetch_jwks(self) -> list[dict[str, Any]]:
        if self._jwks_url is None:
            raise JWTVerificationError("The JWKS URL is not configured.")
        try:
            async with httpx.AsyncClient(timeout=_JWKS_TIMEOUT_SECONDS) as client:
                response = await client.get(self._jwks_url)
                response.raise_for_status()
                document = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise JWTVerificationError("The Supabase JWKS endpoint is unavailable.") from exc

        keys = document.get("keys") if isinstance(document, dict) else None
        if (
            not isinstance(keys, list)
            or not keys
            or len(keys) > _MAX_JWKS_KEYS
            or any(not isinstance(key, dict) for key in keys)
        ):
            raise JWTVerificationError("The Supabase JWKS document is invalid.")
        return keys
