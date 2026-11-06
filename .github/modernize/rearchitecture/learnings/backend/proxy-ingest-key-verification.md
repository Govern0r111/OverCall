# Proxy Ingest-Key Verification

Authenticate proxy requests by HMAC lookup against the SQLModel `ingest_keys` table, not by the signed-in-user JWT seam.

## What Happened

During OverCall task t2.1.4, proxy traffic was still using the `/v1` `get_current_user` seam and could not authenticate a valid `X-Overcall-Key`. The proxy now validates the `oc_` key format, computes HMAC-SHA256 with the configured pepper, looks up the digest through `IngestKeyRepository`, rejects missing, unknown, and revoked keys, and uses the stored user/key IDs for proxy logs. An optional previous pepper is accepted and successful use rehashes the row to the current pepper.

## Takeaway

Keep proxy-key auth separate from JWT auth. Query the stored keyed digest directly on each request so revocation is immediate; do not cache auth results without a matching invalidation design. The current schema's key version is `1`, so update `_CURRENT_INGEST_KEY_VERSION` if key creation/versioning changes.

## History

- 2026-11-06 (OverCall/t2.1.4): initial
