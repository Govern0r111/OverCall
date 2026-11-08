# t30 — Verify retention and request caps

## Summary

Added a bounded request-body limit, an internal-token-protected purge endpoint, and a PostgreSQL retention migration covering age-based deletion, per-user row caps, and the demo-row cap. Added unit and PostgreSQL integration coverage and wired the migration into the development Compose initialization. The local application tests pass, but database behavior and the scheduled purge could not be exercised because Docker and `TEST_DATABASE_URL` are unavailable. The B11 retention/cap/soak checkbox remains unchecked.

## Upstream Artifacts Consumed

- `.github/modernize/rearchitecture/artifacts/t4-backend.md` — followed its isolated-PostgreSQL and environment-isolated test approach; its documented local database prerequisites are unavailable in this run.
- `.github/modernize/rearchitecture/artifacts/t14-backend.md` — used the SQLModel `RequestLog` metadata boundary and retained the no-body-storage convention.

## Evidence Mapping

- `docs/PLAN.md#§5.5 Log retention and capacity` → `supabase/migrations/20261106170000_retention_purge.sql` implements batched age purge, per-user cap, demo cap, and conditional daily `pg_cron` scheduling; `apps/api/tests/integration/test_retention.py` covers expiration and caps when PostgreSQL is available.
- `docs/PLAN.md#B11 — Hardening#Tasks 5` → `POST /internal/purge` uses the existing internal-token authorization and configured retention/row-cap settings; unit tests verify authorization-before-session, parameter forwarding, commit, and fail-closed error handling.
- `docs/PLAN.md#§5.2 Body handling` and `#§3.4 payload_too_large` → `RequestBodyLimitMiddleware` enforces `max_request_body_bytes` for declared and streamed bodies and returns the contracted 413 response.
- `t4-backend.md#Verification Evidence` and `#Test Results` → PostgreSQL validation approach; actual PostgreSQL execution was unavailable here.
- `t14-backend.md#Changes` → kept request data metadata-only; no request body persistence was added.

## Changes

- `apps/api/overcall/request_limits.py` and `apps/api/overcall/main.py`: count body bytes as the app consumes them, reject declared or streamed over-limit requests, and avoid copying request chunks into an additional middleware buffer.
- `apps/api/overcall/internal_api.py`: added hidden `POST /internal/purge`; bearer authorization is evaluated before session access, purge errors are sanitized, and successful purge work is committed.
- `supabase/migrations/20261106170000_retention_purge.sql`: added a `SECURITY DEFINER` function that deletes in batches of at most 5,000, applies each user's retention setting, enforces the total row cap and demo cap, revokes public/user-role execution, and schedules a daily job only where `pg_cron` is available.
- `docker-compose.dev.yml`: mounts the new migration for fresh development databases.
- `apps/api/tests/unit/test_internal_api.py`, `apps/api/tests/unit/test_request_body_limit.py`, `apps/api/tests/integration/test_retention.py`: cover protected purge handling, body-size boundaries, and real PostgreSQL retention/cap behavior.
- `docs/PLAN.md`: updates the internal purge route status and records why the combined B11 completion checkbox remains open. Pre-existing unrelated edits were preserved.

## Test Results

- Full API suite: `& 'C:\Users\abhis\OneDrive\Desktop\Overcall\apps\api\.venv\Scripts\python.exe' -m pytest -q -c 'C:\Users\abhis\OneDrive\Desktop\Overcall\apps\api\pyproject.toml' 'C:\Users\abhis\OneDrive\Desktop\Overcall\apps\api\tests'` (run from `%TEMP%`, `PYTHONPATH=C:\Users\abhis\OneDrive\Desktop\Overcall\apps\api`, ambient DB/provider settings cleared) — **164 passed, 0 failed, 8 skipped**, exit code 0.
- Focused cap/purge suite: `& 'C:\Users\abhis\OneDrive\Desktop\Overcall\apps\api\.venv\Scripts\python.exe' -m pytest -q -c 'C:\Users\abhis\OneDrive\Desktop\Overcall\apps\api\pyproject.toml' 'C:\Users\abhis\OneDrive\Desktop\Overcall\apps\api\tests\unit\test_internal_api.py' 'C:\Users\abhis\OneDrive\Desktop\Overcall\apps\api\tests\unit\test_request_body_limit.py' 'C:\Users\abhis\OneDrive\Desktop\Overcall\apps\api\tests\integration\test_retention.py' 'C:\Users\abhis\OneDrive\Desktop\Overcall\apps\api\tests\integration\test_proxy_persistence.py::test_proxy_sse_client_disconnect_closes_upstream_and_logs_in_finally'` — **13 passed, 0 failed, 1 skipped**, exit code 0.
- Ruff: `ruff.exe check` and `ruff.exe format --check` on the six changed Python files — passed.
- `git diff --check` — passed.
- Environment evidence: `docker info` reported Docker unavailable; `TEST_DATABASE_URL` is unset. The new PostgreSQL integration test therefore skipped. No database function execution, `pg_cron` job inspection, database-size measurement, hosted/production check, or seven-day soak is claimed.
- One earlier full-suite invocation overlapped an in-progress edit to the SSE test file and failed collection; the final full-suite rerun after that edit completed passed.

## Remaining Blockers

- Keep the B11 retention/cap/soak checkbox open until the migration is applied and verified against PostgreSQL, the scheduled job is confirmed in an environment with `pg_cron`, and the required seven-day synthetic-traffic soak/database-size measurement is completed.
- The separate rate-limiting and response-buffer-cap settings are not implemented or claimed verified by this task.
- No production credentials, hosted database, or real-user dataset were available or used.
