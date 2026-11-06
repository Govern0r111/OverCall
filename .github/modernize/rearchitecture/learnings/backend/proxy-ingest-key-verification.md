# Proxy Ingest-Key Verification

Authenticate proxy requests by HMAC lookup against the SQLModel `ingest_keys` table, not by the signed-in-user JWT seam.

## What Happened

During OverCall task t2.1.4, proxy traffic was still using the `/v1` `get_current_user` seam and could not authenticate a valid `X-Overcall-Key`. The proxy now validates the `oc_` key format, computes HMAC-SHA256 with the configured pepper, looks up the digest through `IngestKeyRepository`, rejects missing, unknown, and revoked keys, and uses the stored user/key IDs for proxy logs. An optional previous pepper is accepted and successful use rehashes the row to the current pepper.

During t11, the protected `/v1/ingest-keys` create/list/revoke endpoints were added with one-time plaintext response, a five-active-key limit, and user-scoped operations. Docker PostgreSQL revealed that `last_used_at` and pepper rehash changes flushed by the auth dependency were not durable across request/background-task session teardown. The proxy metadata writer now persists those fields explicitly in its own transaction; only the HMAC digest, never the plaintext, is passed for rotation.

## Takeaway

Keep proxy-key auth separate from JWT auth. Query the stored keyed digest directly on each request so revocation is immediate; do not cache auth results without a matching invalidation design. The current schema's key version is `1`, so update `CURRENT_INGEST_KEY_VERSION` in `auth/ingest_keys.py` if key creation/versioning changes.

Keep all user-facing key queries and updates explicitly scoped to the verified user ID. Serialize key creation with a per-user PostgreSQL transaction advisory lock so concurrent requests cannot exceed the active-key cap. Persist `last_used_at` and any pepper rehash through the proxy writer transaction, since dependency-session flushes may not survive request teardown.

## History

- 2026-11-06 (OverCall/t2.1.4): initial
- 2026-11-06 (OverCall/t11): added lifecycle endpoints, tenant isolation, concurrent cap, and durable key-use/pepper rotation guidance
