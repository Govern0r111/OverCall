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

## [t13] Verified the in-process mock upstream
- Codebase/domain discoveries: `apps/api/overcall/proxy.py` routes mock-mode requests through `httpx.ASGITransport(app=mock_app)` from `apps/api/overcall/mock_llm.py`; the proxy integration test reaches that app without an external upstream.
- Wrong assumptions and corrections: The B7 file list in `docs/PLAN.md` uses old `overcall/mock_openai/{app,tokens}.py` paths; the working implementation is `overcall/mock_llm.py`.
- Debugging dead-ends and what actually worked: The named integration test and then the full proxy integration module both passed; no production-code changes were needed.
- Techniques/patterns worth reusing for future tasks: Verify transport wiring alongside an end-to-end TestClient flow; preserve distinct checklist items for streaming/failure injection and public-route isolation rather than inferring them from a successful chat request.
- Learnings consumed: [backend/proxy-ingest-key-verification, backend/sqlmodel-api-persistence-boundary]

## [t4] Verified local API and Docker Postgres foundation
- Codebase/domain discoveries: `docker-compose.dev.yml` initializes the auth stub and both SQL migrations into a fresh Postgres 15 database; SQLModel public tables use `schema=None`, and PostgreSQL reports `Float(24)` as `REAL`.
- Wrong assumptions and corrections: The schema-parity test had only been skipped without `TEST_DATABASE_URL`; when a real database was configured it excluded default-schema tables and compared float precision metadata incorrectly. The legacy scan also matched `SupabaseJWTVerifier` as if it were the Supabase SDK.
- Debugging dead-ends and what actually worked: A full-suite attempt from `apps/api` inherited ambient configuration and failed two environment-sensitive tests; running from `%TEMP%` with settings cleared and only the local test DB URL set passed all 113 tests.
- Techniques/patterns worth reusing for future tasks: Run migrations against a fresh uniquely named Compose project; inspect tables/RLS, execute the PostgreSQL integration checks, start Uvicorn against that DB, and probe both health/readiness endpoints. Remove temporary Mongo aliases and make SDK-import scans distinguish modules from identifiers while checking dependency names separately in requirements.
- Learnings consumed: [backend/detection-run-status-boundary, backend/openapi-contract-drift, backend/proxy-ingest-key-verification, backend/sqlmodel-api-persistence-boundary, backend/supabase-jwks-jwt-authentication]

## [t6] Verified pricing and historical pricing evidence
- Codebase/domain discoveries: Provider price snapshots record both `version`/`effective_from` and `retrieved_at`; `PricingBook.for_time` is the event-time selector, and request-log rows persist cost, basis, and pricing version. The current repository contains one actual price snapshot per provider.
- Wrong assumptions and corrections: Re-selecting a version alone was insufficient historical evidence because the old test cloned identical prices. Distinct test rates now prove both historical cost and version selection. Stripe's configured per-call amount is modeled overhead, not a Stripe API fee.
- Debugging dead-ends and what actually worked: Official current pages verified today's listed rates but do not prove an archived historical price series; the controlled two-version test verifies code behavior without implying production history.
- Techniques/patterns worth reusing for future tasks: Keep provider source-review date separate from pricing effective date/version. Exercise historical prices with deliberately different temporary snapshots; use the provider endpoint and proxy/synthetic tests to verify version exposure and propagation.
- Learnings consumed: [backend/proxy-ingest-key-verification, backend/sqlmodel-api-persistence-boundary, architect/disconnected-api-runtime-boundary]

## [t8] Verified synthetic generator and fixtures
- Codebase/domain discoveries: `apps/api/tests/test_synthetic.py` tests deterministic generation, rule-label coverage including hard negatives, metadata-only records, schema validity, baseline cleanliness, and generation bounds. The CLI with the fixture's seed and seven-day window reproduces both committed fixture files byte-for-byte.
- Wrong assumptions and corrections: The `b3-frozen` tag name alone does not establish that it predates rule code; t7 verified that rule implementations were already in its tagged tree.
- Debugging dead-ends and what actually worked: No generator changes were needed; run the focused suite with the project virtualenv from a temporary directory to keep ambient local configuration out of the test process.
- Techniques/patterns worth reusing for future tasks: Check fixture tracking, contract validation, and byte-for-byte regeneration independently; keep historical chronology claims separate from current functionality checks.
- Learnings consumed: [teamlead/synthetic-baseline-tag-validity]

## [t11] Completed ingest-key lifecycle and tenant isolation
- Codebase/domain discoveries: `/v1/ingest-keys` was absent from the mounted versioned API despite the documented contract. The existing `IngestKey` table supports create/list/revoke without a migration; proxy-key auth remains separate from JWT auth.
- Wrong assumptions and corrections: A successful proxy response did not prove `last_used_at` was durable. The auth dependency flushed the field, but the background persistence transaction did not retain it; the writer now performs a tenant-scoped update and also persists previous-pepper rehashes.
- Debugging dead-ends and what actually worked: Docker daemon availability was rechecked after an initial transient negative probe. A uniquely named Compose Postgres project allowed real lifecycle, cross-tenant ID-route, concurrency-limit, pepper-rotation, and startup HTTP verification; the temporary API process, users, container, and volume were removed afterward.
- Techniques/patterns worth reusing for future tasks: Use a user-scoped SQL update for idempotent revocation, per-user transaction advisory locking around active-key counting, and a response schema that never includes plaintext in list results. Probe protected routes over local HTTP with a locally minted test JWT, not external provider credentials.
- Learnings consumed: [backend/proxy-ingest-key-verification, backend/sqlmodel-api-persistence-boundary, backend/supabase-jwks-jwt-authentication]

## [t12] Verified B6 versioned API isolation and response shapes
- Codebase/domain discoveries: B6 has 16 JSON-producing operations with response models; ingest-key JSON routes are separately owned by B10 and 204 operations have no response body.
- Wrong assumptions and corrections: A response shape fixture should not duplicate volatile sample values; stable object/array property paths make shape parity deterministic while contract drift and existing exact examples cover types and values.
- Debugging dead-ends and what actually worked: The first fixture draft omitted `cost_usd` and `endpoint` from the log-list shape and had settings threshold paths at the wrong level. The new response-to-fixture test exposed both before the final suite passed.
- Techniques/patterns worth reusing for future tasks: Compare nested property paths for every JSON response, assert top-level fields against the hand-authored OpenAPI contract, and run cross-tenant route tests against a fresh uniquely named Compose Postgres project.
- Learnings consumed: [backend/openapi-contract-drift, backend/sqlmodel-api-persistence-boundary, backend/supabase-jwks-jwt-authentication]

## [t9] Verified atomic detection and Tier 1 rules
- Codebase/domain discoveries: The mounted detection path is `v1_api._perform_detection` with SQLModel repositories; `overcall/engine.py` is the stale collection-backed path. Tier 1 rules previously grouped all provider/origin rows without filtering unsupported AWS and Overcall-origin traffic.
- Wrong assumptions and corrections: A fake session or static inspection alone would not demonstrate rollback behavior. A PostgreSQL test that fails the flush after the issue delete confirms prior issue/run state survives the actual transaction rollback.
- Debugging dead-ends and what actually worked: No `TEST_DATABASE_URL` was present initially. A uniquely named, disposable local PostgreSQL container on a temporary port, initialized from migrations, enabled the full API suite and the injected failure test; the container was removed after verification.
- Techniques/patterns worth reusing for future tasks: Centralize Tier 1 input eligibility in `rules/base.py` and apply it before grouping. Test both deterministic threshold boundaries and labeled positive/hard-negative fixture behavior. Inject failure after the destructive SQL operation when testing rollback boundaries.
- Learnings consumed: [backend/detection-run-status-boundary, backend/sqlmodel-api-persistence-boundary, backend/pricing-source-revalidation]

## [t14] Verified proxy metadata persistence and redaction
- Codebase/domain discoveries: The proxy schedules `persist_proxy_log` through FastAPI `BackgroundTasks`; the committed RequestLog stores metadata, not request/response bodies or plaintext ingest keys.
- Wrong assumptions and corrections: TestClient waits for background work, so response latency alone cannot prove off-request-path ordering. An ASGI send wrapper confirmed the final response body was sent before the commit; isolated PostgreSQL read-back independently confirmed durable metadata.
- Debugging dead-ends and what actually worked: The request-log lifecycle already existed in the key integration test; extending that flow with a body sentinel and row read-back provided real database evidence without modifying production code.
- Techniques/patterns worth reusing for future tasks: Pair real DB read-back with response-event ordering for background persistence; keep upstream response bytes unchanged while verifying sensitive body values never enter metadata or logs.
- Learnings consumed: [backend/proxy-ingest-key-verification, backend/mock-upstream-location, backend/sqlmodel-api-persistence-boundary, architect/disconnected-api-runtime-boundary]

## [t28.1] Added protected internal database-size endpoint
- Codebase/domain discoveries: Production Settings already require `INTERNAL_TOKEN`; the mounted app uses a FastAPI factory and PostgreSQL AsyncSession dependency, while JWT and ingest-key auth remain distinct.
- Wrong assumptions and corrections: The production checklist could not be marked complete from a successful local endpoint probe; the scheduled workflow, GitHub secrets, hosted alert delivery, and production access remain absent.
- Debugging dead-ends and what actually worked: An initial PowerShell assertion mishandled curl's multi-line output; parsing the JSON response separately produced reliable live HTTP checks against isolated PostgreSQL.
- Techniques/patterns worth reusing for future tasks: Authenticate an internal route before opening its database session, compare the bearer token in constant time, conceal access failures with 404, and keep the route out of generated OpenAPI. Verify the SQL function with real local PostgreSQL and separately probe missing, wrong, and valid credentials over HTTP.
- Learnings consumed: [backend/supabase-jwks-jwt-authentication, backend/sqlmodel-api-persistence-boundary, devops/db-size-alert-prerequisites]

## [t30] Added retention and request-body bounds
- Codebase/domain discoveries: `max_request_body_bytes`, `log_retention_default_days`, and `max_logs_per_user` were configured but not enforced. The existing Compose Postgres image does not guarantee `pg_cron`; scheduling must be conditional and independently verified.
- Wrong assumptions and corrections: Buffering the full request in middleware would add a second body-sized copy and can disturb SSE disconnect behavior. Counting streamed receive chunks preserves the request path and rejects the first over-limit chunk.
- Debugging dead-ends and what actually worked: Docker and `TEST_DATABASE_URL` were unavailable, so the SQL integration test skipped; unit/ASGI tests and the final full API suite passed. A first full-suite run overlapped a concurrent SSE test edit; the final full run passed.
- Techniques/patterns worth reusing for future tasks: Keep SQL purges batched with a fixed search path; authorize internal operations before database acquisition; do not mark retention complete until PostgreSQL, cron, and soak evidence exists.
- Learnings consumed: [backend/sqlmodel-api-persistence-boundary, backend/protected-internal-operations-endpoint, backend/proxy-log-background-evidence]

## [t15] Added SSE pass-through and disconnect finalization
- Codebase/domain discoveries: The mounted proxy previously buffered all upstream responses; FastAPI 0.115.12 also closes yielded dependencies before sending `StreamingResponse` bodies, so stream-finalization logging must use a fresh session from the app engine.
- Wrong assumptions and corrections: TestClient does not expose chunk timing in the final response object. An ASGI send-boundary observer confirmed each chunk reached the send layer before the next upstream chunk was read.
- Debugging dead-ends and what actually worked: The disconnect simulation must race the ASGI receive with a test event so an already-pending receive can be interrupted. A project-root test run reads `.env` and caused unrelated configuration/CORS failures; the isolated `%TEMP%` full-suite run passed.
- Techniques/patterns worth reusing for future tasks: Detect SSE from upstream response `content-type`, forward `aiter_raw()` without buffering, count bytes after the send resumes, and shield close/log finalization through client cancellation or upstream read failure. B9 final-usage parsing and tiktoken estimation remain open.
- Learnings consumed: [backend/mock-upstream-location, backend/proxy-ingest-key-verification, backend/proxy-log-background-evidence]

## [t10] Verified shared rules and Tier 3 gates
- Codebase/domain discoveries: The SQLModel-backed `/v1` detection path runs the same seven rule classes; shared eligibility must filter `origin="overcall"` and AWS before grouping, then sort by `(timestamp, id)`. Tier 3 additionally requires configured context-token semantics, tool exclusion, and the settings-driven minimum call count.
- Wrong assumptions and corrections: Tier 3's visible issue-list gate alone does not prove detection is disabled; the detection loop needs a separately tested rule-enabled predicate. Prompt token totals are not the context-token measure used for token-bloat savings.
- Debugging dead-ends and what actually worked: The first full-suite run from the project directory picked up `.env` and exposed unrelated config/CORS test failures. Running from `%TEMP%` with the API package on `PYTHONPATH` gave a clean full-suite result. PostgreSQL integration tests skip without `TEST_DATABASE_URL`.
- Techniques/patterns worth reusing for future tasks: Keep shared eligibility in `rules/base.py`, declare each rule's threshold keys alongside the class, and validate both Tier 3 detection gating and issue list/detail visibility. The mounted `/v1/accuracy` path can be checked against generated positives and hard negatives without the stale collection-backed engine.
- Learnings consumed: [backend/tier1-rule-input-eligibility, backend/pricing-source-revalidation]
