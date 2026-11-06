# t4 — Local API and Docker Postgres Foundation

## Summary

Verified the local FastAPI runtime against an isolated Docker Postgres 15.19 instance. The startup and readiness endpoints, migrations, schema/RLS parity, metadata-only schema, and legacy-reference scan passed. Fixed two schema-parity test assumptions and made the legacy scanner distinguish actual Supabase imports from identifiers such as `SupabaseJWTVerifier`.

The authorized development Supabase project was not accessed. Accordingly, the combined Docker/Supabase migration criterion remains unchecked with its blocker recorded in `docs/PLAN.md`.

## Upstream Artifacts Consumed

- `.github/modernize/rearchitecture/artifacts/t3-teamlead-plan.md` — Step 1/T001 scope and mandatory local validation.
- `.github/modernize/rearchitecture/artifacts/checkpoints/t3-checklist-to-plan.yaml` — B1-01 through B1-04 evidence and gate definitions.
- `.github/modernize/rearchitecture/artifacts/t2.1-backend.md` — current mounted API routes and prior verification limits.
- `.github/modernize/rearchitecture/learnings/backend/sqlmodel-api-persistence-boundary.md` — use the SQLModel API boundary; do not restore Mongo collection aliases.
- `.github/modernize/rearchitecture/learnings/backend/openapi-contract-drift.md` — verify contract checks separately from database schema tests.
- `.github/modernize/rearchitecture/learnings/backend/detection-run-status-boundary.md` — keep PostgreSQL-specific verification distinct from TestClient evidence.
- `.github/modernize/rearchitecture/learnings/backend/proxy-ingest-key-verification.md` — proxy-key and current-user JWT paths remain separate.
- `.github/modernize/rearchitecture/learnings/backend/supabase-jwks-jwt-authentication.md` — local verification does not imply live Supabase-provider verification.

## Evidence Mapping

- `t3-teamlead-plan.md#Step 1: Local application and database foundation` and `#T001` → Docker migration, PostgreSQL test suite, API startup probes, and legacy check below.
- `t3-checklist-to-plan.yaml#B1-01` → isolated Uvicorn startup; `/healthz` and `/readyz` each returned HTTP 200.
- `t3-checklist-to-plan.yaml#B1-02` → Docker Postgres migrations ran and tables/RLS were verified; the separate development Supabase migration remains blocked and unchecked.
- `t3-checklist-to-plan.yaml#B1-03` → PostgreSQL schema-parity/RLS and no-body-column checks passed.
- `t3-checklist-to-plan.yaml#B1-04` → legacy-reference script and scanner regression tests passed locally; `.github/workflows/ci.yml` invokes the script. No hosted CI result is claimed.
- `t2.1-backend.md#Runtime and Route Evidence` → previous route registration evidence supplemented here with a live local API and PostgreSQL readiness response.

## Changes

- `apps/api/tests/integration/test_schema_parity.py`: includes unqualified SQLModel tables in PostgreSQL's default `public` schema and compares PostgreSQL `REAL`/`DOUBLE PRECISION` semantics rather than expecting inspector precision metadata to equal SQLAlchemy's `Float(24)` precision. Also avoids treating `Float` as a fixed-precision `Numeric`.
- `apps/api/overcall/models.py`: removed unused `from_mongo` and `to_mongo` compatibility aliases.
- `apps/api/scripts/check_legacy_dependencies.py`: matches Supabase package imports precisely and checks package names separately in requirements manifests, avoiding false positives on identifiers such as `SupabaseJWTVerifier`.
- `apps/api/tests/unit/test_legacy_dependency_check.py`: added positive and negative regression cases for import matching and legacy dependency names.
- `docs/PLAN.md`: checked B1-01, B1-03, and B1-04 after direct verification; B1-02 remains unchecked because its Supabase portion requires user-controlled access.

## Verification Evidence

- Docker: `docker info` succeeded; Docker Compose `v2.40.3`; Docker Postgres `15.19`.
- Compose command: `docker compose -p overcall-t4 -f docker-compose.dev.yml up -d --wait --wait-timeout 90 postgres` — exit 0. Fresh isolated volume ran `00_auth_stub.sql`, `10_init.sql`, and `20_rls_retention.sql`; all six public tables were present and RLS was enabled on each.
- Uvicorn: `python -m uvicorn overcall.main:app --host 127.0.0.1 --port 8000` from a temporary working directory with the API on `PYTHONPATH` and `DATABASE_URL` pointed at the isolated Postgres instance. `/healthz` → `200 {"status":"ok","release":"local"}`; `/readyz` → `200 {"status":"ok"}`.
- Cleanup: the temporary Uvicorn process and isolated Compose project/volume were stopped and removed after verification.

## Test Results

- Focused command: `.\\.venv\\Scripts\\python.exe -m pytest -q -c pyproject.toml tests/integration/test_schema_parity.py tests/security/test_no_body_columns.py tests/unit/test_legacy_dependency_check.py` (from `apps/api`, `TEST_DATABASE_URL` pointed to Docker Postgres) — **23 passed, 0 failed, 0 skipped; exit code 0**.
- Full API command: `& 'C:\\Users\\abhis\\OneDrive\\Desktop\\Overcall\\apps\\api\\.venv\\Scripts\\python.exe' -m pytest -q -c 'C:\\Users\\abhis\\OneDrive\\Desktop\\Overcall\\apps\\api\\pyproject.toml' 'C:\\Users\\abhis\\OneDrive\\Desktop\\Overcall\\apps\\api\\tests'` (from `%TEMP%`, app-specific ambient settings removed, `PYTHONPATH` and `TEST_DATABASE_URL` set for the repo and isolated Postgres) — **119 passed, 0 failed, 0 skipped; exit code 0**.
- Legacy check: `apps/api/.venv/Scripts/python.exe scripts/check_legacy_dependencies.py` — **passed; exit code 0**. Its CI invocation is present in `.github/workflows/ci.yml`.
- Ruff: `ruff check` and `ruff format --check` on the four touched backend files — **passed; exit code 0**.
- Worktree validation: `git diff --check` — **passed; exit code 0**.
- An initial full-suite run from `apps/api` inherited ambient app settings and had two environment-sensitive failures (`test_production_fails_fast_when_required_secrets_are_missing` and `test_cors_headers_are_only_added_to_versioned_api`). Rerunning from `%TEMP%` with those settings isolated produced the full-suite result above.
- One non-blocking Starlette `BlockingPortal` deprecation warning was emitted by pytest.

## Remaining Blocker

- The development Supabase migration was not attempted. It requires a user-authorized project and credentials; Docker/Postgres evidence does not substitute for it. `docs/PLAN.md` leaves the combined migration criterion unchecked.
- `.github/modernize/rearchitecture/context.md` and `decisions.md` were not present; the consumed t3 plan documents their absence. No project principles were inferred from those missing files.
