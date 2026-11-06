# t11 — Ingest-Key Lifecycle and Isolation

## Summary

Implemented and verified the documented `/v1/ingest-keys` create/list/revoke lifecycle. Plaintext is returned only on creation; database storage uses the current HMAC digest. Key management is tenant-scoped, concurrent creation enforces the five-active-key limit, and proxy usage/revocation/pepper rotation were validated. `docs/PLAN.md` B10-01 and B10-02 are checked with evidence notes.

The local PostgreSQL integration test exposed that request-dependency updates to `last_used_at` and a rotated pepper hash were not durable across the background persistence transaction. The proxy writer now persists these fields explicitly in its own transaction.

## Upstream Artifacts Consumed

- `.github/modernize/rearchitecture/artifacts/t4-backend.md` — followed its isolated Docker Postgres setup and app/test environment handling.
- `.github/modernize/rearchitecture/artifacts/t3-teamlead-plan.md` — used Step 5/T008 scope for key lifecycle and tenant isolation.
- `.github/modernize/rearchitecture/artifacts/checkpoints/t3-checklist-to-plan.yaml` — used B10-01/B10-02 acceptance and verification criteria.

## Evidence Mapping

- `t3-teamlead-plan.md#T008` → API create/list/revoke routes, key schemas/repository, and `tests/integration/test_ingest_key_lifecycle.py`.
- `t3-checklist-to-plan.yaml#B10-01` → lifecycle integration test plus live local HTTP status probes and hash/plaintext assertions.
- `t3-checklist-to-plan.yaml#B10-02` → PostgreSQL cross-tenant matrix for all ID-taking versioned routes; foreign issue/log IDs return 404 and foreign key revocation is a no-op.
- `t4-backend.md#Verification Evidence` → fresh isolated Compose Postgres migration/runtime test environment; all temporary database resources were removed after validation.

## Changes

- `apps/api/overcall/v1_api.py`, `apps/api/overcall/api_schemas.py`, `apps/api/overcall/db/repos/ingest_keys.py`: added protected key lifecycle routes, response/request models, tenant-scoped operations, per-user transaction advisory locking, and idempotent revocation.
- `apps/api/overcall/auth/ingest_keys.py`, `apps/api/overcall/deps.py`, `apps/api/overcall/proxy.py`: centralized key versioning and persist last-use/pepper rotation metadata through proxy logging without passing plaintext to the writer.
- `apps/api/tests/integration/test_ingest_key_lifecycle.py`: added PostgreSQL tests for one-time key secrecy, proxy use and revocation, key cap including concurrency, pepper rotation, and cross-tenant IDs.
- `contract/openapi.yaml`: documented the lifecycle operations and response shapes.
- `docs/PLAN.md`: checked B10-01 and B10-02 after verification.
- `.github/modernize/rearchitecture/learnings/backend/proxy-ingest-key-verification.md` and `team/backend/log.md`: recorded reusable findings.

## Test Results

- Command: `apps/api/.venv/Scripts/python.exe -m pytest -q -c apps/api/pyproject.toml apps/api/tests` (from `%TEMP%`; `PYTHONPATH` and `TEST_DATABASE_URL` pointed to the isolated local API/PostgreSQL environment)
- Passed: 123
- Failed: 0
- Skipped: 0
- Failure details: none
- Ruff check and format: passed for all seven changed Python files.
- Contract checker: passed — generated OpenAPI matches all 19 versioned paths.
- Runtime HTTP probes using a locally minted test JWT: `GET /v1/ingest-keys` 200; `POST /v1/ingest-keys` 201; list without plaintext 200; valid key proxy use 200; `DELETE /v1/ingest-keys/{id}` 204; revoked key proxy use 401. No live Supabase/provider credentials were used.
- `git diff --check`: passed.
- Warning: one existing Starlette `BlockingPortal` deprecation warning; no test failures.

## Remaining Blockers

- None for B10-01/B10-02 local acceptance. This evidence does not claim live Supabase/provider credentials, production access, or hosted verification.

## Related Structured Artifacts

- [t11-backend-batch-report.yaml](./t11-backend-batch-report.yaml) — task/requirement traceability and structured test results.
- [t11-tasks-to-impl.yaml](./checkpoints/t11-tasks-to-impl.yaml) — implementation checkpoint.
