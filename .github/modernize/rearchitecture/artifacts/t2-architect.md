# t2 — Implementation boundaries and current behavior

## Post-remediation re-review (2026-11-06)

**Verdict: PASS for the repaired backend route-to-persistence boundary; no app-wide clean PASS.**

The prior critical finding that the FastAPI factory exposed only health routes is closed for the backend API scope: `main.py` now includes the `/v1` and `/proxy` routers, the versioned API uses SQLModel repositories, and a fresh full API test run passes. The previous database-free runtime probes and generated-contract check are also recorded in `t2.1-backend.md`.

The broader browser-to-backend boundary still has a high-severity mismatch and must not be represented as integrated:

- The real web client still uses `/api` as its base path and builds proxy URLs under `/api/proxy` (`apps/web/src/lib/api.ts:7-9,26-28`); its demo MSW handlers also implement `/api/*` (`apps/web/src/mocks/handlers.ts:17-51`).
- The FastAPI app registers `/v1` and `/proxy` routers (`apps/api/overcall/main.py:63-64`); the resource API has `/v1` prefix (`apps/api/overcall/v1_api.py:75`) and the proxy is mounted at `/proxy/{provider}/{path}` (`apps/api/overcall/proxy.py:23,106`). No `/api` router is mounted by this app.
- The production `get_current_user` dependency remains a deliberate 401 placeholder (`apps/api/overcall/deps.py:45-47`). Until B10 implements JWT verification and the browser paths/contracts are aligned, a real signed-in browser request cannot use these endpoints.

Accordingly, this is a backend-boundary PASS only, not a clean end-to-end/API-client PASS. Keep I1 and B10 integration/auth claims unchecked; a follow-on integration task must align the web URL/contract and implement the planned authentication before claiming the real-user path works. This review changed no application source and did not alter existing worktree changes.

## Scope (original pre-remediation map)

This checklist-to-code map was assembled before the t2.1 API remediation. API-specific entries below are retained as historical context and are superseded by the post-remediation review at the top. No topology path or `*-fanout.md` was available; `project-profile.yaml` records `grouping_needed: false`, so the plan's F/B/I labels are used as module boundaries.

## System boundary

```text
Vite/React SPA
  router -> page components -> hooks/React Query -> Axios `/api/*`
  demo session -> MSW service worker -> in-memory fixture state
  Supabase Auth SDK is a separate browser-side auth path

FastAPI `overcall.main:app`
  request-id/error/CORS middleware -> `/healthz`, `/readyz`, `/v1/*`, `/proxy/*`
  mounted versioned API + ingest-key proxy -> tenant-scoped SQLModel repositories
  PostgreSQL engine + SQLModel schema/migrations

Legacy API/proxy modules
  `api.py` still declares an unmounted `/api/*` router -> legacy collection-oriented persistence

Integration boundary
  the browser still requests `/api/*` and `/api/proxy/*`; this does not match the mounted
  backend `/v1/*` and `/proxy/*` routes. Demo `/api/*` is handled by MSW only.
```

Evidence: `apps/web/src/router.tsx:53-64`, `apps/web/src/main.tsx:28-42`, `apps/web/src/lib/api.ts:7-10`; `apps/api/overcall/main.py:40-105`; `apps/api/overcall/api.py:6,14-23`; `apps/api/overcall/proxy.py:9,17,69`.

## Checklist-to-code map (plan order)

### Frontend

| Plan module / unchecked criteria | Current boundary and behavior | Relevant source |
|---|---|---|
| F2 — Supabase email/Google manual verification | Auth routes and a shared auth client exist. `VITE_AUTH_MODE` defaults to mock; Supabase login/signup/OAuth/reset call the JS SDK when selected. The Google button is conditional on Supabase being configured. The real-project/provider-account check is external and remains a manual gate. | `apps/web/src/router.tsx:53-59`; `apps/web/src/auth/authClient.ts:5-10,121-147,189-199`; `.env.example` in `apps/web` |
| F3 — generated API types | Browser API is still a hand-maintained Axios client and interfaces; MSW implements the `/api/*` demo contract. `gen:api` is not present in `apps/web/package.json`. The backend now mounts a versioned API and its generated OpenAPI matches 17 `/v1` paths, but browser paths remain `/api`; frontend code generation/parity is still outstanding. | `apps/web/src/lib/api.ts:7-10,51-158`; `apps/web/src/mocks/handlers.ts:17-52`; `apps/web/package.json`; `apps/api/overcall/main.py:63-64`; `t2.1-backend.md#Runtime and Route Evidence` |
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
| B6 — REST/API contract | The new `/v1` router is mounted and implemented against tenant-scoped SQLModel repositories; generated OpenAPI matches 17 versioned paths and the contract check passes. The legacy `/api` module remains unmounted and still has collection-style imports. The browser continues to call `/api`, so this backend contract pass does not establish browser parity. | `apps/api/overcall/main.py:63-64`; `apps/api/overcall/v1_api.py:75`; `apps/api/overcall/db/repos/`; `apps/api/overcall/api.py`; `apps/web/src/lib/api.ts:7-9`; `t2.1-backend.md#Test Results` |
| B7 — mock upstream | `proxy.py` creates an `httpx.AsyncClient` using `ASGITransport(app=mock_app)`, which is the in-process seam to `mock_llm.py`. Its functional verification must include the enclosing proxy; the proxy currently consumes the response as buffered content rather than forwarding a stream. | `apps/api/overcall/proxy.py:18-19,91-108`; `apps/api/overcall/mock_llm.py` |
| B8/B9 — proxy and SSE | The mounted `/proxy/{provider}/{path}` route authenticates an ingest key, buffers the upstream `resp.content`, and schedules best-effort metadata persistence via a FastAPI background task. The planned streaming pass-through, final-chunk usage, disconnect lifecycle, and remaining caps/queue/soak criteria are not established by this route or its current persistence tests. | `apps/api/overcall/proxy.py:23,106-109,150-220`; `apps/api/overcall/deps.py:59-102`; `apps/api/tests/integration/test_proxy_persistence.py` |
| B10 — JWT and ingest keys | The mounted `/v1` API has a global `get_current_user` dependency but it is currently a fail-closed 401 placeholder. Proxy calls independently validate stored ingest-key digests. The model exists, but create/list/revoke API lifecycle and production JWT verification remain outstanding. | `apps/api/overcall/v1_api.py:75`; `apps/api/overcall/deps.py:45-47,59-102`; `apps/api/overcall/db/models.py:32-106`; `apps/api/overcall/proxy.py:106` |
| B11 — hardening | JSON redaction/request-id logging and validated config settings for sizes, rates, retention, and queue limits exist. The currently inspected proxy does not consume most of those caps/queue settings. CI runs Ruff, legacy-reference and pricing-age checks, then pytest; repository configuration alone cannot prove fuzz-redaction, overhead measurement, a seven-day soak, production alerts, or secret scans across external logs. | `apps/api/overcall/logging.py`; `apps/api/overcall/config.py:38-50,87-90`; `apps/api/overcall/proxy.py`; `.github/workflows/ci.yml`; `apps/api/scripts/check_legacy_dependencies.py` |

### Integration

| Plan module / unchecked criteria | Current boundary and behavior | Relevant source |
|---|---|---|
| I1 — browser/backend integration | Demo mode starts MSW before rendering; its `/api/*` handlers do not establish backend connectivity. Non-demo browser requests still target `/api`, while the backend mounts `/v1` and `/proxy`; additionally, `get_current_user` rejects requests until B10 authentication is implemented. The real-account path is therefore not verified or currently compatible. | `apps/web/src/main.tsx:28-42`; `apps/web/src/mocks/startDemoApi.ts`; `apps/web/e2e/app.spec.ts`; `apps/web/src/lib/api.ts:7-10,26-28`; `apps/api/overcall/main.py:63-64`; `apps/api/overcall/deps.py:45-47` |
| I2 — real-traffic accuracy | Current Settings explicitly reports real traffic as “Not measured yet”; the evaluator consumes generated synthetic logs and in-memory ground truth. Synthetic and real datasets are not currently represented as two measured reports by the backend. Keep the real-user/label/analysis criteria unchecked until the authorized dataset and its provenance exist. | `apps/web/src/components/settings/AccuracySection.tsx:24-31`; `apps/api/overcall/api.py:113-132`; `apps/api/overcall/engine.py:112-133` |
| I3 — deployment | Current deployment manifests still refer to the former `backend/` tree, `server:app`, `/api/health`, and CRA `build` output; the current app is under `apps/api`, FastAPI entrypoint `overcall.main:app`, and Vite frontend build. These manifests need reconciliation before deployment validation. Production smoke/alerts/provider env require credentials and production access unavailable in t1. | `render.yaml:1-9`; `vercel.json:1-5`; `apps/api/pyproject.toml`; `apps/web/package.json` |
| Appendix A — module handoff | These are cross-cutting handoff checks, not a separate runtime unit. Apply each module's test/lint/type/contract/security/accessibility/doc/build evidence at that module's handoff; the PR-description row cannot be verified without a PR. | `docs/PLAN.md:1780-1789`; `.github/workflows/ci.yml`; `apps/web/package.json` |

## Material architecture findings for planning (updated after remediation)

1. **RESOLVED for the backend route/persistence boundary (originally CRITICAL).** `create_app` mounts the `/v1` and `/proxy` routers, the versioned API uses tenant-scoped SQLModel repositories, and fresh API tests plus the OpenAPI drift check pass. The old collection-backed `/api` module remains unmounted; do not treat that as a browser integration path.
2. **HIGH — browser/backend contract mismatch remains.** The browser and its demo handlers use `/api/*` and `/api/proxy/*`; the backend exposes `/v1/*` and `/proxy/*`. Additionally, the API's current user dependency always returns 401 until B10 is implemented. **Mitigation:** align frontend paths/contracts and implement real JWT verification before claiming I1 or the real-user path complete.
3. **HIGH — proxy transport criteria remain incomplete.** The mounted proxy now persists metadata through the SQLModel repository in a background task, but it still buffers upstream `resp.content`; the plan's SSE pass-through, disconnect lifecycle, usage extraction from final chunks, caps/queue and soak criteria remain unproven. Detection replacement transaction proof also remains separate. **Mitigation:** verify each B4/B8/B9 criterion against the current persisted-log contract before completion.
4. **HIGH — deployment entrypoints are stale.** Render and Vercel config do not point at the current app layout/build output. **Mitigation:** reconcile paths and health target before treating local builds as deployment evidence; production-only checks remain external.

## Non-goals / verification boundary

- This artifact does not decide the remaining implementation order; t3 owns the dependency-ordered plan.
- It does not mark checklist items complete or repeat F1 work.
- No build, endpoint probe, migration, production check, OAuth/provider test, 5,000-row timed search, or seven-day soak was run for this architecture analysis.
- External/manual blockers and the exact t1 inventory are recorded in `t1-pm.md`; this artifact only maps them to the code boundaries above.

## Upstream Artifacts Consumed

- `.github/modernize/rearchitecture/artifacts/t1-pm.md` — unchecked checklist rows, manual/external blockers, and the warning to preserve the dirty worktree/baseline.
- `.github/modernize/rearchitecture/artifacts/t2.1-backend.md` — post-remediation route, runtime, OpenAPI, and full API test evidence.
- `.github/modernize/rearchitecture/artifacts/project-profile.yaml` — repository structure and `grouping_needed: false`.

## Post-remediation Evidence Mapping

- `t2-architect.md#Material architecture findings 1` → `apps/api/overcall/main.py:63-64`, `v1_api.py:75`, the fresh full API suite, and `t2.1-backend.md#Runtime and Route Evidence` show that the backend router/persistence boundary has been repaired.
- `t2-architect.md#Material architecture findings 2` and `t1-pm.md#Unchecked items, in plan order` (I1/B6) → the web `/api` client and MSW paths versus mounted `/v1` and `/proxy` backend paths above show that browser/backend parity is still unresolved.
- `t2.1-backend.md#Remaining Verification Boundaries` → the local auth dependency still rejects requests until B10; PostgreSQL-only checks and real provider/production behavior are not inferred from this review.

## Evidence Mapping

- `t1-pm.md#Unchecked items, in plan order` → Frontend, Backend, Integration, and Appendix A tables above map each acceptance group to implementation paths and current runtime boundaries.
- `t1-pm.md#Manual and external preconditions` → F2, B1, F6, B3, B11, I2, I3, and Appendix A notes preserve the external/manual verification limits; no item is represented as completed.
- `project-profile.yaml#project.structure` / `#progress_sync.grouping_needed` → Scope uses existing `apps`, `contract`, `supabase`, `docs` modules and the plan's F/B/I labels rather than invented topology groups.

## Post-remediation Validation

- Full API suite: `apps/api/.venv/Scripts/python.exe -m pytest -q -c apps/api/pyproject.toml apps/api/tests` — **77 passed, 0 failed, 2 skipped**. Run with the repository API directory on `PYTHONPATH` from the system temp directory. The PostgreSQL schema-parity/RLS checks are skipped because `TEST_DATABASE_URL` is unavailable; pytest also reports the existing fixture-loop-scope and Starlette deprecation warnings.
- Contract drift: `apps/api/.venv/Scripts/python.exe apps/api/scripts/check_contract.py` — **passed**, generated OpenAPI matches all 17 versioned paths.
- Runtime probes: `t2.1-backend.md#Runtime and Route Evidence` reports `/healthz` 200, `/readyz` 503 as expected without a DB, and protected `/v1`/proxy paths returning 401 rather than 404. These probes are cited from the dependency artifact, not claimed as rerun in this review.
- Architectural boundary check: source inspection confirms the frontend `/api` paths do not match the mounted backend `/v1` and `/proxy` routes; this remains an integration blocker despite the backend tests passing.

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
