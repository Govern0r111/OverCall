# t2 — Implementation boundaries and current behavior

## Current route/auth reconciliation (2026-11-06; supersedes earlier route/auth statements)

**Verdict: PASS for the locally verified route, auth, DTO, and browser/API integration seams. This is not a full I1/B6/B10 acceptance or production-auth PASS.**

- `main.py` mounts the `/v1` router and `/proxy` router. The `/v1` router applies `get_current_user`; proxy requests use the separate ingest-key verifier. The old collection-backed `/api` module remains unmounted.
- The browser API client and demo handlers now use `/v1`; provider proxy URLs use `/proxy`. `t2.2.1` aligned browser wire DTOs and adapters with the versioned API response shapes. The API contract check matches all 17 versioned OpenAPI paths.
- Local backend auth verification covers missing-token rejection and a locally signed RS256 token. Separately, the signed-in Chromium flow used a test-only Supabase-compatible stub/local HS256 JWT while exercising Vite, FastAPI, mock upstream, and isolated PostgreSQL; it verified `/v1` pages, proxy logging, detection-run responses, and persisted `succeeded` status. These checks do not use live Supabase credentials or provider signing keys. See `t2.1-backend.md#Runtime and Route Evidence`, `t2.2-frontend.md#Final Re-verification After t2.4`, `t2.3-backend.md#Test Results`, and `t2.4-backend.md#Evidence Mapping`.
- The prior `/api` versus `/v1` mismatch, JWT-placeholder statement, and browser DTO mismatch are resolved for the exercised local flow. Do not retain them as current blockers.
- Remaining boundaries: CI has not been run; no real Supabase project/signing keys, real user, Google OAuth setup, or production service was available. PostgreSQL-only API checks were skipped in the independent API suite without `TEST_DATABASE_URL`; ingest-key create/list/revoke and comprehensive cross-tenant isolation remain separate unchecked criteria. No full B6/B10/I1 checklist completion is claimed.

This is a local verification result, not a claim about external provider configuration, production readiness, or all checklist acceptance criteria. No source or `docs/PLAN.md` checklist item was changed by this architecture reconciliation.

## Scope (original pre-remediation map)

This checklist-to-code map was assembled before the t2.1 API remediation. API-specific entries below are retained as historical context and are superseded by the current route/auth reconciliation at the top. No topology path or `*-fanout.md` was available; `project-profile.yaml` records `grouping_needed: false`, so the plan's F/B/I labels are used as module boundaries.

## System boundary

```text
Vite/React SPA
  router -> page components -> hooks/React Query -> Axios `/v1/*`
  demo session -> MSW service worker -> in-memory fixture state
  Supabase Auth SDK is a separate browser-side auth path

FastAPI `overcall.main:app`
  request-id/error/CORS middleware -> `/healthz`, `/readyz`, `/v1/*`, `/proxy/*`
  mounted versioned API + ingest-key proxy -> tenant-scoped SQLModel repositories
  PostgreSQL engine + SQLModel schema/migrations

Legacy API/proxy modules
  `api.py` still declares an unmounted `/api/*` router -> legacy collection-oriented persistence

Integration boundary
  browser `/v1/*` and `/proxy/*` requests match the mounted backend prefixes; local
  signed-in browser/API/proxy/detection flows passed with test auth and mock upstream.
  Demo `/v1/*` requests are handled by MSW; this alone is not backend connectivity proof.
```

Evidence: `apps/web/src/router.tsx:53-64`, `apps/web/src/main.tsx:28-42`, `apps/web/src/lib/api.ts:7-10`; `apps/api/overcall/main.py:40-105`; `apps/api/overcall/api.py:6,14-23`; `apps/api/overcall/proxy.py:9,17,69`.

## Checklist-to-code map (plan order)

### Frontend

| Plan module / unchecked criteria | Current boundary and behavior | Relevant source |
|---|---|---|
| F2 — Supabase email/Google manual verification | Auth routes and a shared auth client exist. `VITE_AUTH_MODE` defaults to mock; Supabase login/signup/OAuth/reset call the JS SDK when selected. The Google button is conditional on Supabase being configured. The real-project/provider-account check is external and remains a manual gate. | `apps/web/src/router.tsx:53-59`; `apps/web/src/auth/authClient.ts:5-10,121-147,189-199`; `.env.example` in `apps/web` |
| F3 — generated API types | The browser still uses hand-maintained Axios DTOs and explicit API-to-view adapters; `gen:api` is not present in `apps/web/package.json`. The `/v1` URLs and exercised wire DTOs now align with the backend schemas, but the generated frontend-type workflow remains outstanding. | `apps/web/src/lib/api.ts`; `apps/web/src/hooks/queries.ts`; `apps/web/package.json`; `t2.2.1-frontend.md#Implementation` and `#Remaining Boundaries`; `t2.1-backend.md#Runtime and Route Evidence` |
| F4 — overview fixture/theme/figures | Overview is a routed page driven by `useOverview`; data is held in mock state or requested from the current API path. Shared theme and money formatting are provided by `AppContext`. The expected `overview.demo.json` fixture is not present in the inspected contract fixture tree; visual parity and non-addition need direct page/test evidence. | `apps/web/src/router.tsx:30-39`; `apps/web/src/pages/Overview.tsx`; `apps/web/src/context/AppContext.tsx`; `apps/web/src/mocks/state.ts` |
| F5 — Tier 3 visibility and badge | Issues page filters returned rows by `settings.experimental_enabled`; the engine also excludes Tier 3 rule execution unless that setting is enabled. `IssueRow` delegates tier display to `TierBadge`. The existing app E2E assertion exercises Tier 1, not the disabled/enabled Tier 3 boundary. | `apps/web/src/pages/Issues.tsx:43-44,85-95`; `apps/web/src/components/IssueRow.tsx`; `apps/web/src/components/Badges.tsx`; `apps/api/overcall/engine.py:27-28,89-90`; `apps/web/e2e/app.spec.ts` |
| F6 — timed search on 5,000 logs | The page performs search, status, range, and issue filtering in the browser. The query hook requests at most 200 recent rows and only sends provider; there is no cursor/search request path in the current API. The explicit 5,000-row timed acceptance cannot be inferred from the current implementation or from a passing UI test. | `apps/web/src/pages/Logs.tsx:30,81-99`; `apps/web/src/hooks/queries.ts:34-44`; `apps/api/overcall/api.py:106-110` |
| F7 — shared route fixture and one-time key display | Provider snippets are constructed in `Providers.tsx`, not sourced from a shared route fixture. The same page explicitly says this API does not provide ingest-key create/list/revoke endpoints; current snippets use provider credentials and do not implement Overcall ingest-key issuance. | `apps/web/src/pages/Providers.tsx:39-46,110-115`; `apps/api/overcall/api.py:90-104`; `contract/fixtures/` |

### Backend

| Plan module / unchecked criteria | Current boundary and behavior | Relevant source |
|---|---|---|
| B1 — app, DB and schema gates | A FastAPI app factory, request IDs, error handlers, health/readiness endpoints, async PostgreSQL engine, SQLModel entities, migrations, Docker Postgres setup, schema-parity/no-body tests, and CI legacy-reference script are present. The factory mounts the versioned API and proxy; the DB-dependent readiness route returns unavailable when no DB is configured. The Supabase migration half remains separate from the local Docker check. | `apps/api/overcall/main.py:40-105`; `apps/api/overcall/db/engine.py`; `apps/api/overcall/db/models.py:25-33,76-180`; `supabase/migrations/`; `docker-compose.dev.yml`; `apps/api/tests/integration/test_schema_parity.py`; `apps/api/tests/security/test_no_body_columns.py`; `.github/workflows/ci.yml` |
| B2 — versioned deterministic pricing | A versioned pricing loader validates JSON against `contract/pricing.schema.json`; the calculator uses `Decimal` and returns basis/version. The mounted proxy constructs a metadata-only SQLModel `RequestLog` with `cost_basis` and `pricing_version`, then schedules best-effort persistence; the full B2 history/persistence acceptance still needs its own focused verification. | `apps/api/overcall/pricing/{loader.py,cost.py,models.py}`; `apps/api/overcall/proxy.py:150-220`; `apps/api/tests/unit/pricing/test_pricing.py`; `apps/api/tests/integration/test_proxy_persistence.py` |
| B3 — synthetic data and freeze point | Generator and explicit positive/hard-negative labels exist; a fixture pair is present under `contract/fixtures/synthetic/small/`. The seven-rule truth/fixture path is independent of the web's runtime mock state. t1 found no `b3-frozen` tag; because the worktree is dirty, baseline/tag creation is a separate coordinator decision and must not capture unreviewed changes. | `apps/api/overcall/synthetic/generator.py:85-93,294-309`; `apps/api/overcall/synthetic/truth.py`; `apps/api/overcall/synthetic/scenarios.py`; `contract/fixtures/synthetic/small/{logs.json,ground_truth.json}` |
| B4/B5 — detection rules and storage | Seven rules share `rules/base.py`; `engine.rule_active` gates Tier 3 on `experimental_enabled`. The current detection persistence replaces issues with separate delete/insert calls, not one visible transaction. The old engine uses collection-based storage and legacy models, not the new SQLModel repository layer. | `apps/api/overcall/rules/{base.py,__init__.py}`; `apps/api/overcall/engine.py:27-28,89-101`; `apps/api/overcall/models.py`; `apps/api/overcall/db/models.py` |
| B6 — REST/API contract | The mounted `/v1` router uses tenant-scoped SQLModel repositories; generated OpenAPI matches all 17 versioned paths. The browser now calls `/v1`, and DTO adapters match the exercised versioned response shapes. Local route and browser/API workflows passed. Full B6 acceptance remains open: broad two-user isolation and response-fixture equality are not established, and the independent API suite skipped PostgreSQL-only checks without `TEST_DATABASE_URL`. The legacy collection-backed `/api` module remains unmounted and is not the active browser contract. | `apps/api/overcall/main.py:63-64`; `apps/api/overcall/v1_api.py:75`; `apps/api/overcall/db/repos/`; `apps/api/overcall/api.py`; `apps/web/src/lib/api.ts`; `apps/web/src/hooks/queries.ts`; `t2.1-backend.md#Remaining Verification Boundaries`; `t2.2.1-frontend.md#Implementation` |
| B7 — mock upstream | `proxy.py` creates an `httpx.AsyncClient` using `ASGITransport(app=mock_app)`, which is the in-process seam to `mock_llm.py`. Its functional verification must include the enclosing proxy; the proxy currently consumes the response as buffered content rather than forwarding a stream. | `apps/api/overcall/proxy.py:18-19,91-108`; `apps/api/overcall/mock_llm.py` |
| B8/B9 — proxy and SSE | The mounted `/proxy/{provider}/{path}` route authenticates an ingest key, buffers the upstream `resp.content`, and schedules best-effort metadata persistence via a FastAPI background task. The planned streaming pass-through, final-chunk usage, disconnect lifecycle, and remaining caps/queue/soak criteria are not established by this route or its current persistence tests. | `apps/api/overcall/proxy.py:23,106-109,150-220`; `apps/api/overcall/deps.py:59-102`; `apps/api/tests/integration/test_proxy_persistence.py` |
| B10 — JWT and ingest keys | `/v1` uses the implemented Supabase JWT verifier. Locally generated RS256 verification and missing-token rejection were exercised; allowed algorithms, issuer, audience, expiry, subject, and JWKS behavior are covered by implementation/tests using local keys and a mocked JWKS source. HS256 is allowed only with an explicitly configured legacy secret. Proxy calls independently validate stored ingest-key digests. External Supabase/JWKS behavior was not tested; ingest-key create/list/revoke lifecycle and comprehensive cross-tenant isolation remain outstanding. | `apps/api/overcall/v1_api.py:75`; `apps/api/overcall/auth/jwt.py`; `apps/api/overcall/deps.py:46-57,59-102`; `apps/api/overcall/config.py:26-27,164-168`; `apps/api/overcall/db/models.py:32-106`; `apps/api/overcall/proxy.py:106`; `t2.3-backend.md#Test Results` and `#Remaining Boundaries` |
| B11 — hardening | JSON redaction/request-id logging and validated config settings for sizes, rates, retention, and queue limits exist. The currently inspected proxy does not consume most of those caps/queue settings. CI runs Ruff, legacy-reference and pricing-age checks, then pytest; repository configuration alone cannot prove fuzz-redaction, overhead measurement, a seven-day soak, production alerts, or secret scans across external logs. | `apps/api/overcall/logging.py`; `apps/api/overcall/config.py:38-50,87-90`; `apps/api/overcall/proxy.py`; `.github/workflows/ci.yml`; `apps/api/scripts/check_legacy_dependencies.py` |

### Integration

| Plan module / unchecked criteria | Current boundary and behavior | Relevant source |
|---|---|---|
| I1 — browser/backend integration | The local signed-in Chromium flow passed through the Vite proxy to FastAPI using the aligned `/v1` client/DTOs and `/proxy` route, with isolated PostgreSQL and a test-only Supabase-compatible auth stub. This verifies the local integration seam only. CI, a real Supabase account/JWKS, Google OAuth, and production auth remain unverified; leave those acceptance criteria open. Demo MSW behavior alone is not evidence of real backend connectivity. | `apps/web/src/lib/api.ts`; `apps/web/src/hooks/queries.ts`; `apps/web/src/mocks/startDemoApi.ts`; `apps/api/overcall/main.py:63-64`; `apps/api/overcall/v1_api.py:75`; `apps/api/overcall/auth/jwt.py`; `t2.2-frontend.md#Final Re-verification After t2.4`; `t2.3-backend.md#Remaining Boundaries` |
| I2 — real-traffic accuracy | Current Settings explicitly reports real traffic as “Not measured yet”; the evaluator consumes generated synthetic logs and in-memory ground truth. Synthetic and real datasets are not currently represented as two measured reports by the backend. Keep the real-user/label/analysis criteria unchecked until the authorized dataset and its provenance exist. | `apps/web/src/components/settings/AccuracySection.tsx:24-31`; `apps/api/overcall/api.py:113-132`; `apps/api/overcall/engine.py:112-133` |
| I3 — deployment | Current deployment manifests still refer to the former `backend/` tree, `server:app`, `/api/health`, and CRA `build` output; the current app is under `apps/api`, FastAPI entrypoint `overcall.main:app`, and Vite frontend build. These manifests need reconciliation before deployment validation. Production smoke/alerts/provider env require credentials and production access unavailable in t1. | `render.yaml:1-9`; `vercel.json:1-5`; `apps/api/pyproject.toml`; `apps/web/package.json` |
| Appendix A — module handoff | These are cross-cutting handoff checks, not a separate runtime unit. Apply each module's test/lint/type/contract/security/accessibility/doc/build evidence at that module's handoff; the PR-description row cannot be verified without a PR. | `docs/PLAN.md:1780-1789`; `.github/workflows/ci.yml`; `apps/web/package.json` |

## Material architecture findings for planning (updated after remediation)

1. **RESOLVED for the backend route/persistence boundary (originally CRITICAL).** `create_app` mounts the `/v1` and `/proxy` routers, the versioned API uses tenant-scoped SQLModel repositories, and fresh API tests plus the OpenAPI drift check pass. The old collection-backed `/api` module remains unmounted; do not treat that as a browser integration path.
2. **RESOLVED for local integration — browser/backend route, DTO, and auth seam.** The browser uses `/v1` and `/proxy`, response adapters align with the API schemas, and the local signed-in browser flow passed with a test auth stub. Do not reuse the former `/api` mismatch, DTO mismatch, or JWT-placeholder finding. **Remaining limitation:** CI and real Supabase/JWKS/OAuth/production verification have not been performed, so full I1 and real-account acceptance remain open.
3. **HIGH — proxy transport criteria remain incomplete.** The mounted proxy now persists metadata through the SQLModel repository in a background task, but it still buffers upstream `resp.content`; the plan's SSE pass-through, disconnect lifecycle, usage extraction from final chunks, caps/queue and soak criteria remain unproven. Detection replacement transaction proof also remains separate. **Mitigation:** verify each B4/B8/B9 criterion against the current persisted-log contract before completion.
4. **HIGH — deployment entrypoints are stale.** Render and Vercel config do not point at the current app layout/build output. **Mitigation:** reconcile paths and health target before treating local builds as deployment evidence; production-only checks remain external.

## Non-goals / verification boundary

- This artifact does not decide the remaining implementation order; t3 owns the dependency-ordered plan.
- It does not mark checklist items complete or repeat F1 work.
- The final local re-review ran frontend unit tests/build, the API suite, OpenAPI drift check, and diff validation; `t2.2-frontend.md#Final Re-verification After t2.4` reports the local Chromium integration run. None establishes CI, real OAuth/provider setup, production behavior, the 5,000-row timed search, or a seven-day soak.
- External/manual blockers and the exact t1 inventory are recorded in `t1-pm.md`; this artifact only maps them to the code boundaries above.

## Upstream Artifacts Consumed

- `.github/modernize/rearchitecture/artifacts/t1-pm.md` — unchecked checklist rows, manual/external blockers, and the warning to preserve the dirty worktree/baseline.
- `.github/modernize/rearchitecture/artifacts/t2.1-backend.md` — post-remediation route, runtime, OpenAPI, and full API test evidence.
- `.github/modernize/rearchitecture/artifacts/project-profile.yaml` — repository structure and `grouping_needed: false`.

## Post-remediation Evidence Mapping

- `t2-architect.md#Material architecture findings 1` → `apps/api/overcall/main.py:63-64`, `v1_api.py:75`, the fresh full API suite, and `t2.1-backend.md#Runtime and Route Evidence` show that the backend router/persistence boundary has been repaired.
- `t2-architect.md#Current route/auth reconciliation`, `t2.1-backend.md#Runtime and Route Evidence`, and `t2.2-frontend.md#Final Re-verification After t2.4` → backend routes are mounted, browser paths and exercised DTOs align, and the local signed-in browser/API/proxy/detection flow passed.
- `t2.3-backend.md#Test Results` / `#Remaining Boundaries` → local JWT verification is implemented and tested; external Supabase/JWKS behavior, ingest-key lifecycle, and broad isolation remain unverified.

## Evidence Mapping

- `t1-pm.md#Unchecked items, in plan order` → Frontend, Backend, Integration, and Appendix A tables above map each acceptance group to implementation paths and current runtime boundaries.
- `t1-pm.md#Manual and external preconditions` → F2, B1, F6, B3, B11, I2, I3, and Appendix A notes preserve the external/manual verification limits; no item is represented as completed.
- `project-profile.yaml#project.structure` / `#progress_sync.grouping_needed` → Scope uses existing `apps`, `contract`, `supabase`, `docs` modules and the plan's F/B/I labels rather than invented topology groups.

## Post-remediation Validation

- Earlier API suite count from the t2.1 re-verification: `apps/api/.venv/Scripts/python.exe -m pytest -q -c apps/api/pyproject.toml apps/api/tests` — **77 passed, 0 failed, 2 skipped**. This count is historical and superseded by the final re-review below (**96 passed, 0 failed, 2 skipped**); PostgreSQL checks were unavailable without `TEST_DATABASE_URL`.
- Contract drift: `apps/api/.venv/Scripts/python.exe apps/api/scripts/check_contract.py` — **passed**, generated OpenAPI matches all 17 versioned paths.
- Runtime probes in final evidence: `t2.1-backend.md#Runtime and Route Evidence` reports protected `/v1` and `/proxy` routes mounted and rejecting unauthenticated requests; `t2.2-frontend.md#Final Re-verification After t2.4` reports successful signed-in local browser requests through Vite, including `/v1` and `/proxy`.
- Architectural boundary check: the earlier `/api` versus `/v1` mismatch finding is superseded by the t2.2 route alignment and t2.2.1 DTO work; the current local integration result is recorded above. CI and real-account checks remain open.

## Validation

- Read-only evidence review: inspected router/API host, frontend query and mock paths, DB model/migration/test files, pricing/detection/proxy modules, and deployment manifests.
- Checklist verification: compared module coverage against the t1 inventory of 65 unchecked rows (F2–F7, B1–B11, I1–I3, Appendix A).
- Tests/build: not run; this deliverable is an architecture map and makes no application-code changes.

## Final re-review after route, DTO, auth, and detection-status remediation — 2026-11-06

**Verdict: PASS for the reviewed route/DTO/auth/status integration boundary. No HIGH or CRITICAL implementation findings remain in this scope.** This does not claim production readiness, full checklist completion, or external-account verification.

### Review evidence

- `apps/api/overcall/main.py` registers both the `/v1` API router and `/proxy` router. `apps/api/overcall/v1_api.py` applies `get_current_user` at the `/v1` router boundary; the proxy uses its separate ingest-key dependency.
- `apps/api/overcall/auth/jwt.py`, `overcall/deps.py`, and `config.py` restrict JWT algorithms to configured RS256/ES256 keys, with HS256 available only when an explicit legacy secret is configured; verification checks signature, issuer, exact audience, expiration, and subject. Route-auth and JWT tests cover missing credentials, a valid local RS256 token, key rotation, claim failures, and fail-closed behavior.
- `apps/web/src/lib/api.ts` and `hooks/queries.ts` use the mounted `/v1` endpoints and versioned response envelopes. The frontend DTO interfaces match the corresponding Pydantic response fields; explicit API-to-view adapters handle decimal/string and naming differences. `api.test.ts` exercises these adapters and URL contracts.
- `apps/api/overcall/v1_api.py` persists successful detection runs as `succeeded` (per `supabase/migrations/20261022140000_init.sql`) and maps that value to the public `completed` response for both run and latest-run routes. The contract test asserts both public responses and the stored ORM value.
- The prior local browser integration evidence in `t2.2-frontend.md#Final Re-verification After t2.4` reports successful signed-in local `/v1` and `/proxy` flows and a persisted `succeeded` status. This review did not restart that multi-service browser harness; it independently reran the unit suites, frontend build, API suite, and OpenAPI drift check below.

### Verification results

- `Set-Location apps/web; npm test` — **23 passed, 0 failed, 0 skipped**.
- `Set-Location apps/web; npm run build` — **passed** (`tsc -b && vite build`).
- Isolated API suite: `apps/api/.venv/Scripts/python.exe -m pytest -q -c <repo>/apps/api/pyproject.toml <repo>/apps/api/tests` (run from the system temp directory with `PYTHONPATH=<repo>/apps/api` and ambient DB/provider settings removed) — **96 passed, 0 failed, 2 skipped**. The two PostgreSQL-specific tests were skipped because `TEST_DATABASE_URL` was removed/unavailable in the isolated run. Existing pytest-asyncio and Starlette deprecation warnings are non-failing.
- `apps/api/.venv/Scripts/python.exe apps/api/scripts/check_contract.py` — **passed**, generated OpenAPI matches all 17 versioned paths.
- `git diff --check` — **passed**.

### Remaining boundaries

- No real Supabase project, live signing keys, real user, Google OAuth setup, or production service was available. Real-account/OAuth acceptance remains unchecked; the auth evidence uses local keys/JWKS.
- CI was not run, so the I1 CI criterion remains open. PostgreSQL-only API tests were skipped in this independent review; the earlier t2.2 browser evidence used an isolated Docker PostgreSQL instance.
- Ingest-key create/list/revoke lifecycle and cross-tenant isolation remain separate unchecked B10 acceptance criteria (per `t2.3-backend.md#Remaining Boundaries`); this review does not certify them.
- No application source or `docs/PLAN.md` checklist item was changed. F1 was not revisited.

## Upstream Artifacts Consumed

- `.github/modernize/rearchitecture/artifacts/t1-pm.md` — remaining checklist criteria and manual/external verification boundaries.
- `.github/modernize/rearchitecture/artifacts/t2.1-backend.md` — mounted API/proxy route and runtime/test scope.
- `.github/modernize/rearchitecture/artifacts/t2.2-frontend.md` — route alignment and final local browser/API integration evidence.
- `.github/modernize/rearchitecture/artifacts/t2.2.1-frontend.md` — frontend wire DTOs and API-to-view adapters.
- `.github/modernize/rearchitecture/artifacts/t2.3-backend.md` — JWT verification implementation and local-versus-external auth limits.
- `.github/modernize/rearchitecture/artifacts/t2.4-backend.md` — persisted detection status and public status mapping.

## Evidence Mapping

- `t1-pm.md#I1` / `#Manual and external preconditions` → local integration is distinct from CI and real-account/OAuth completion; those conditions remain explicitly open above.
- `t2.1-backend.md#Runtime and Route Evidence` → current router registration plus route-auth and full API test coverage confirms mounted `/v1`/proxy boundaries.
- `t2.2-frontend.md#Final Re-verification After t2.4` and `t2.2.1-frontend.md#Implementation` → local browser flow and typed DTO/adapters support the frontend/backend path and response compatibility findings.
- `t2.3-backend.md#Test Results` / `#Remaining Boundaries` → JWT claims and local-key test coverage are reviewed; external JWKS and ingest-key/isolation scope remain qualified.
- `t2.4-backend.md#Evidence Mapping` → migration status constraint, persisted `succeeded` value, and public `completed` response are corroborated by current code/tests and the contract check.
