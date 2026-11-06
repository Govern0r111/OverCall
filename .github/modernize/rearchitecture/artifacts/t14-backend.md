# t14 — Verify proxy metadata persistence and redaction

## Summary

Verified the proxy metadata writer with both an instrumented ASGI response boundary and isolated local PostgreSQL. The database read-back confirms a committed `request_logs` metadata row is available within the two-second bound; request-body sentinels and plaintext ingest keys are absent. Added coverage for credential redaction and proxy success, upstream error, malformed metadata, log-write failure, and log-preparation exception paths. Updated the two verified B8 checklist items in `docs/PLAN.md`. No production-source change was needed.

This is local evidence only. No production/provider credentials, hosted services, or external accounts were used.

## Upstream Artifacts Consumed

- `.github/modernize/rearchitecture/artifacts/t4-backend.md` — followed its isolated Docker PostgreSQL and environment-isolated test approach.
- `.github/modernize/rearchitecture/artifacts/t11-backend.md` — used the ingest-key lifecycle and durable proxy-writer transaction evidence as context.
- `.github/modernize/rearchitecture/artifacts/t13-backend.md` — used the current in-process mock upstream route and transport evidence.
- `.github/modernize/rearchitecture/learnings/backend/proxy-ingest-key-verification.md` — kept proxy-key handling separate from JWT auth and checked metadata persistence with the writer transaction.
- `.github/modernize/rearchitecture/learnings/backend/mock-upstream-location.md` — used the current `mock_llm.py` transport.
- `.github/modernize/rearchitecture/learnings/backend/sqlmodel-api-persistence-boundary.md` — kept request logs tenant-scoped and metadata-only.
- `.github/modernize/rearchitecture/learnings/architect/disconnected-api-runtime-boundary.md` — kept local runtime evidence distinct from production/provider verification.

## Evidence Mapping

- `t4-backend.md#Verification Evidence` and `#Test Results` → isolated Postgres test setup, settings isolation, and full API test execution recorded below.
- `t11-backend.md#Changes` and `#Test Results` → extended the real ingest-key proxy-use flow to read back the associated persisted request-log row and check the body sentinel/plaintext key are absent.
- `t13-backend.md#Result` → proxy metadata verification uses the current in-process mock upstream path.
- `docs/PLAN.md#B8 — Proxy core#Done when` → `test_ingest_key_create_list_use_and_revoke_lifecycle` verifies PostgreSQL read-back and the elapsed bound; `test_proxy_returns_upstream_bytes_and_persists_metadata_only` verifies commit occurs after ASGI response-body send; redaction, no-body, and failure-path tests verify rows/logs and that internal exception details do not leak into responses.

## Changes

- `apps/api/tests/integration/test_ingest_key_lifecycle.py`: send a synthetic request body through the authenticated proxy, read the committed log row from PostgreSQL, assert metadata fields and the two-second bound, and ensure the request sentinel/plaintext key are absent.
- `apps/api/tests/integration/test_proxy_persistence.py`: instrument the ASGI send boundary to verify the metadata commit follows the response body and remains under two seconds; verify request/response sentinels and credentials are not stored/logged across success, upstream error, malformed metadata, persistence failure, and log-preparation exception paths.
- `apps/api/tests/unit/test_logging_redaction_basic.py`: cover proxy credential formats, including JWT, provider keys, ingest keys, authorization and token fields.
- `docs/PLAN.md`: checked only B8 metadata-persistence and redaction/no-body items, with evidence and local-only scope.

## Test Results

- Command: `python -m pytest -q -c apps/api/pyproject.toml apps/api/tests` (from `%TEMP%`, with `PYTHONPATH=apps/api`, `TEST_DATABASE_URL` pointed at isolated Docker PostgreSQL, and ambient DB/provider settings removed)
- Passed: 146
- Failed: 0
- Skipped: 0
- Failure details: none
- Final redaction-only rerun after the full suite: `python -m pytest -q -c apps/api/pyproject.toml apps/api/tests/unit/test_logging_redaction_basic.py` — 2 passed, 0 failed.
- Ruff check and format check on the three changed Python test files: passed.
- `git diff --check`: passed.
- Docker resources from project `overcall-t14` and its volume were removed after verification.
- Warnings: one existing Starlette `BlockingPortal` deprecation and the installed pytest-asyncio fixture-loop-scope deprecation warning.

## Remaining Blockers

- None for the two locally verifiable B8 checklist items.
- No production, provider-credential, hosted, or real-user verification is claimed.
