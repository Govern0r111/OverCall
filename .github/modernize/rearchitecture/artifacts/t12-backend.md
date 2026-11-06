# t12 — Versioned API Isolation and Fixtures

## Summary

Verified B6 tenant isolation and Tier 3 gating, then added response-shape fixtures for all 16 JSON-producing B6 operations. The fixture test compares nested object/array property paths from deterministic API responses and checks each operation's top-level properties against the hand-authored OpenAPI contract. Both B6 checklist items are checked in `docs/PLAN.md`.

## Upstream Artifacts Consumed

- `.github/modernize/rearchitecture/artifacts/t4-backend.md` — followed its isolated Docker PostgreSQL and API-test environment approach.
- `.github/modernize/rearchitecture/artifacts/t11-backend.md` — used the established PostgreSQL two-user isolation matrix and separate B10 ingest-key boundary.
- `.github/modernize/rearchitecture/artifacts/t3-teamlead-plan.md` — used Step 5/T009 scope and B6-01/B6-02 acceptance criteria.
- `.github/modernize/rearchitecture/artifacts/t2-architect.md` — confirmed that the mounted, authenticated `/v1` API is the active contract surface.

## Evidence Mapping

- `t3-teamlead-plan.md#Step 5: Protected API and ingest-key contract` / `#T009` → `apps/api/tests/contract/test_v1_contract.py` covers B6 JSON response shapes and gating; `apps/api/tests/integration/test_ingest_key_lifecycle.py::test_id_taking_endpoints_hide_foreign_tenant_rows` covers issue/log isolation.
- `t11-backend.md#Evidence Mapping` / `#Test Results` → reran the PostgreSQL two-user test; foreign issue/log IDs return 404 and foreign-key revocation remains a no-op.
- `t4-backend.md#Verification Evidence` → used a fresh isolated Compose Postgres project for the API test suite.
- `docs/PLAN.md#B6 — REST API` → checked the two completed acceptance items and recorded the exact fixture coverage boundary.

## Changes

- `contract/fixtures/api/response-shapes.json` — added stable JSON property-path shape fixtures for all 16 JSON-producing B6 operations; `[]` marks array items.
- `apps/api/tests/contract/test_v1_contract.py` — added a runtime response-to-shape-fixture check and validates top-level response properties against `contract/openapi.yaml`.
- `docs/PLAN.md` — checked B6 isolation/gating and response-shape fixture items with a verification note.

The shape fixtures intentionally assert field/array structure, not volatile values such as IDs or timestamps. Exact fixture equality remains covered for the existing overview-empty and default-settings examples, and the rules endpoint is compared with `contract/rules.json`. Ingest-key JSON responses remain in B10; 204 responses have no JSON shape.

## Test Results

- Focused command: `& "$repo\apps\api\.venv\Scripts\python.exe" -m pytest -q -c "$repo\apps\api\pyproject.toml" "$repo\apps\api\tests\integration\test_ingest_key_lifecycle.py::test_id_taking_endpoints_hide_foreign_tenant_rows" "$repo\apps\api\tests\contract\test_v1_contract.py::test_tier_three_issues_require_both_gate_and_explicit_opt_in"` — **2 passed, 0 failed, 0 skipped; exit code 0**.
- Fixture test: `& "$repo\apps\api\.venv\Scripts\python.exe" -m pytest -q -c "$repo\apps\api\pyproject.toml" "$repo\apps\api\tests\contract\test_v1_contract.py::test_every_versioned_json_response_matches_contract_fixture_shape"` — **1 passed, 0 failed, 0 skipped; exit code 0**.
- Full API suite: `& "$repo\apps\api\.venv\Scripts\python.exe" -m pytest -q -c "$repo\apps\api\pyproject.toml" "$repo\apps\api\tests"` from `%TEMP%`, with `PYTHONPATH` and `TEST_DATABASE_URL` set for the repository and isolated PostgreSQL — **147 passed, 0 failed, 0 skipped; exit code 0**.
- `ruff check` and `ruff format --check` on `test_v1_contract.py` — passed.
- `apps/api/scripts/check_contract.py` — passed; generated OpenAPI matches **19 versioned paths**.
- `response-shapes.json` JSON parse and `git diff --check` — passed.
- Warnings: pytest-asyncio fixture-loop-scope deprecation and the existing Starlette `BlockingPortal` deprecation; no test failures.
- Failure details: none.

## Issues Found

None. No live Supabase credentials, production service, or external provider configuration was used or claimed.
