# Supabase JWKS JWT Authentication

Use the configured Supabase issuer and an explicit algorithm allowlist to verify current-user JWTs; never trust the token's algorithm choice on its own.

## What Happened

During OverCall task t2.3, the `/v1` auth dependency was an intentional 401 placeholder. Supabase JWT verification was added with cached JWKS keys, unknown-`kid` refresh, stale cached-key fallback during JWKS failure, required `exp`/`aud`/`iss`/`sub` claims, and optional legacy HS256 only when its configured secret exists. Tests use locally generated RSA/EC keys and do not claim live-provider verification.

## Takeaway

Keep the configured algorithms fixed to RS256/ES256 and add HS256 only when a strong legacy secret is explicitly configured. Verify exact audience and issuer, enforce a 30-second leeway, require a UUID subject before forming `UserContext`, and fail closed when no cached/remote key can verify the token. Keep proxy ingest-key authentication separate from this JWT seam.

## History

- 2026-11-06 (OverCall/t2.3): initial
