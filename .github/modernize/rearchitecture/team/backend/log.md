## [t2.1] Confirmed API runtime and legacy persistence blockers
- Codebase/domain discoveries: `create_app` exposes only health/readiness; the historical `/api` router, engine, and proxy depend on Mongo-style collection symbols absent from the SQLModel database package. The repo currently has no endpoint contract script and the B6 OpenAPI contract is absent.
- Wrong assumptions and corrections: Mounting the old routers is not a safe fix; imports fail and their persistence operations have no implementation in the current repository layer.
- Debugging dead-ends and what actually worked: Direct route import reproduced the missing `issues_col` ImportError. TestClient confirmed `/healthz` 200, `/readyz` 503 without DB, and `/api/overview` 404. Full backend pytest exposed two pre-existing environment/CORS failures.
- Techniques/patterns worth reusing for future tasks: Trace app factory → route registration → persistence implementation → browser URL; do not add fake collection aliases to make the legacy router importable.
- Learnings consumed: [architect/disconnected-api-runtime-boundary]

## [t2.1.1] Implemented repository/session foundation
- Codebase/domain discoveries: SQLModel tables already carry `user_id`; request-scoped `AsyncSession` injection and repository ownership are enough to support later `/v1` route work without changing the schema.
- Wrong assumptions and corrections: Repository methods should not commit internally; transaction boundaries belong to API/service operations so detection replacement and source deletion can remain atomic.
- Debugging dead-ends and what actually worked: Running pytest from `apps/api` inherited local settings and caused two environment-sensitive failures. Running from a temp directory with the expected CORS origin and no Supabase/test-DB variables produced a clean suite without reading or changing `.env`.
- Techniques/patterns worth reusing for future tasks: Scope every query and delete by the injected user ID; force that ID on inserts; use escaped SQLAlchemy bind parameters for search; order keyset pages by timestamp plus UUID; keep Tier 3 hidden by default.
- Learnings consumed: [backend/sqlmodel-api-persistence-boundary, architect/disconnected-api-runtime-boundary]

## [t2.1.2] Implemented repo-backed `/v1` API contract
- Codebase/domain discoveries: The API can use the SQLModel repositories without reviving the unmounted collection-backed legacy router. FastAPI's generated OpenAPI can be compared to JSON-formatted YAML using a standard-library JSON parser.
- Wrong assumptions and corrections: Matching response field names alone does not establish contract parity; also compare required fields and normalized property types. Passing route runtime tests with fake repositories does not establish PostgreSQL integration or complete two-user route isolation.
- Debugging dead-ends and what actually worked: The system Python lacked `pydantic_settings`; use `apps/api/.venv` for project checks. Repository-wide Ruff reports pre-existing style issues in untouched legacy files; run scoped checks for task files and preserve those files.
- Techniques/patterns worth reusing for future tasks: Keep expected response `x-response-required` and `x-response-types` next to each operation; normalize arrays, component refs, and nullable unions before comparing. Keep exact fixture equality claims separate from schema drift claims.
- Learnings consumed: [backend/sqlmodel-api-persistence-boundary, architect/disconnected-api-runtime-boundary]

## [t2.1.3] Adapted proxy logs to tenant-scoped SQLModel persistence
- Codebase/domain discoveries: The proxy row schema uses `occurred_at`, `cost_basis`, and `pricing_version`; the pricing estimator returns a literal-string basis in its `CostResult`. `RequestLogRepository.add` forces the tenant ID and flushes without owning the service transaction.
- Wrong assumptions and corrections: `CostResult.basis` is already a string, not an enum with `.value`; using `.value` prevented log construction. A response body with malformed usage metadata must still be passed through unchanged.
- Debugging dead-ends and what actually worked: A full API run exposed the invalid `.basis.value` assumption; direct proxy integration tests caught it, and the final full suite passed after correction. The live unauthenticated proxy probe returns 401 because proxy-key authentication is not yet wired to the fail-closed auth seam.
- Techniques/patterns worth reusing for future tasks: Schedule metadata persistence after forming the upstream response; use `RequestLogRepository` and commit at the service boundary; roll back and log only the exception type on persistence failure so logging cannot fail customer traffic. Keep bodies and credentials out of the stored row.
- Learnings consumed: [backend/openapi-contract-drift, backend/sqlmodel-api-persistence-boundary, architect/disconnected-api-runtime-boundary]

## [t2.1.4] Wired repo-backed proxy-key authentication
- Codebase/domain discoveries: The existing `IngestKey` table stores keyed digests and the proxy log schema already supports `ingest_key_id`; `get_current_user` remains a separate fail-closed JWT seam for `/v1`.
- Wrong assumptions and corrections: A valid proxy key must not be passed through the JWT dependency. Tests must account for the auth dependency flushing `last_used_at` before the log persistence flush.
- Debugging dead-ends and what actually worked: Running the proxy suite with a fake session initially exposed a stale `user.user_id` reference and a fake flush failure firing during authentication; using the ingest-key context and failing only the second flush restored the intended logging fail-open test.
- Techniques/patterns worth reusing for future tasks: HMAC-SHA256 lookup by the stored digest is compatible with the current SQLModel table. Looking up on each request avoids stale revocation state; if a cache is introduced later, pair it with bounded TTLs and an explicit invalidation design.
- Learnings consumed: [backend/sqlmodel-api-persistence-boundary, backend/openapi-contract-drift, architect/disconnected-api-runtime-boundary]

## [t2.1.3] Freshly re-verified proxy persistence after key remediation
- Codebase/domain discoveries: The test asserts the authenticated route writes a tenant/key-scoped metadata-only `RequestLog`, commits it, and preserves the upstream response if logging fails.
- Wrong assumptions and corrections: A clean controlled-session runtime test proves local route/repository-boundary behavior but is not evidence of a live PostgreSQL write; two database integration checks remain skipped without a test database.
- Debugging dead-ends and what actually worked: Re-running the focused proxy suite and full API suite from the system temp directory with project test environment variables unset produced clean results and avoided ambient local configuration.
- Techniques/patterns worth reusing for future tasks: Rerun the exact failing boundary's integration test after remediation, then the full module suite and contract drift check; keep live DB/production claims separate from fake-session evidence.
- Learnings consumed: [backend/proxy-ingest-key-verification, backend/sqlmodel-api-persistence-boundary, architect/disconnected-api-runtime-boundary]

## [t2.1] Re-verified API route wiring and backend runtime
- Codebase/domain discoveries: `create_app` now mounts the SQLModel-backed `/v1` router and the ingest-key-protected proxy router. A database-free local HTTP run can verify readiness failure and fail-closed auth without mistaking missing infrastructure for a missing route.
- Wrong assumptions and corrections: Protected route probes should expect 401 (and `/readyz` 503 without a database), not success; Uvicorn plus OpenAPI enumeration complements the contract suite and fake-session integration tests.
- Debugging dead-ends and what actually worked: Isolated temp-directory test execution with database/provider variables removed reproduced a clean result: 9 focused proxy tests and 77 full API tests passed; the two PostgreSQL checks skipped explicitly for missing `TEST_DATABASE_URL`.
- Techniques/patterns worth reusing for future tasks: Verify the app over local HTTP, check the full route contract, rerun the focused boundary suite and full module suite, and report PostgreSQL/auth-provider coverage separately. Preserve outstanding two-user isolation and all-fixture checks as open B6 work.
- Learnings consumed: [backend/openapi-contract-drift, backend/proxy-ingest-key-verification, backend/sqlmodel-api-persistence-boundary]

## [t2.3] Implemented Supabase current-user JWT verification
- Codebase/domain discoveries: `create_app` owns a verifier configured from `SUPABASE_URL`, `SUPABASE_JWT_ALGORITHMS`, and optional `SUPABASE_JWT_SECRET`; `/v1` repositories continue to receive only UUID identity through `UserContext`.
- Wrong assumptions and corrections: A local signing key plus mocked JWKS is good evidence for cryptographic and route behavior, but it does not prove a real Supabase project's provider configuration or key set.
- Debugging dead-ends and what actually worked: The API venv initially lacked PyJWT; adding the pinned `PyJWT[crypto]` dependency let RSA/EC verification tests run. A test-client request to `/v1/me` with a generated RS256 token verified the real app dependency and route.
- Techniques/patterns worth reusing for future tasks: Test all mounted `/v1` operations with valid request shapes and no bearer token; separately verify a locally signed RS256/ES256 JWT. Keep external provider checks and PostgreSQL-only tests explicit when credentials/DB are unavailable.
- Learnings consumed: [backend/openapi-contract-drift, backend/proxy-ingest-key-verification, backend/sqlmodel-api-persistence-boundary, architect/disconnected-api-runtime-boundary]

## [t2.4] Aligned detection-run lifecycle values
- Codebase/domain discoveries: The `detection_runs` constraint stores successful completion as `succeeded`, while the existing API response vocabulary is `completed`; both `/v1/detection/run` and `/v1/detection/runs/latest` need the same translation.
- Wrong assumptions and corrections: Changing only the database write would cause the latest-run endpoint to expose `succeeded`; status translation belongs at both API response boundaries.
- Debugging dead-ends and what actually worked: No `TEST_DATABASE_URL` was configured, so PostgreSQL integration checks remained skipped. The TestClient route workflow verified persisted ORM status and public response semantics.
- Techniques/patterns worth reusing for future tasks: Keep storage enums aligned with SQL constraints, map public lifecycle labels in one helper, and test both write and read API paths.
- Learnings consumed: [backend/sqlmodel-api-persistence-boundary]
