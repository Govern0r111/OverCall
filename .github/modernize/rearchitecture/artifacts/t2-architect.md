# t2 — Implementation boundaries and current behavior

## Scope

Source-anchored map for the still-unchecked `docs/PLAN.md` criteria listed by t1. This is a read-only analysis: no application source, deployment config, checklist checkbox, or pre-existing worktree change was modified. No topology path or `*-fanout.md` was available; `project-profile.yaml` records `grouping_needed: false`, so the plan's F/B/I labels are used as the module boundaries.

## System boundary

```text
Vite/React SPA
  router -> page components -> hooks/React Query -> Axios `/api/*`
  demo session -> MSW service worker -> in-memory fixture state
  Supabase Auth SDK is a separate browser-side auth path

FastAPI `overcall.main:app`
  request-id/error/CORS middleware -> `/healthz`, `/readyz`
  PostgreSQL engine + SQLModel schema/migrations exist separately

Legacy API/proxy modules
  `/api/*` and `/api/proxy/*` routers -> old collection-oriented persistence
  These routers are not attached to the FastAPI app.
```

Evidence: `apps/web/src/router.tsx:53-64`, `apps/web/src/main.tsx:28-42`, `apps/web/src/lib/api.ts:7-10`; `apps/api/overcall/main.py:40-105`; `apps/api/overcall/api.py:6,14-23`; `apps/api/overcall/proxy.py:9,17,69`.

## Checklist-to-code map (plan order)

### Frontend

| Plan module / unchecked criteria | Current boundary and behavior | Relevant source |
|---|---|---|
| F2 — Supabase email/Google manual verification | Auth routes and a shared auth client exist. `VITE_AUTH_MODE` defaults to mock; Supabase login/signup/OAuth/reset call the JS SDK when selected. The Google button is conditional on Supabase being configured. The real-project/provider-account check is external and remains a manual gate. | `apps/web/src/router.tsx:53-59`; `apps/web/src/auth/authClient.ts:5-10,121-147,189-199`; `.env.example` in `apps/web` |
| F3 — generated API types | Browser API is a hand-maintained Axios client and interfaces; MSW implements the current `/api/*` demo contract. `gen:api` is not present in `apps/web/package.json`; `contract/openapi.yaml` and `openapi-typescript` are absent from the current contract/package inventory. API host currently exposes health routes only, so generated types cannot yet be compared to a live, mounted backend contract. | `apps/web/src/lib/api.ts:7-10,51-158`; `apps/web/src/mocks/handlers.ts:17-52`; `apps/web/package.json`; `apps/api/overcall/main.py:87-105` |
| F4 — overview fixture/theme/figures | Overview is a routed page driven by `useOverview`; data is held in mock state or requested from the current API path. Shared theme and money formatting are provided by `AppContext`. The expected `overview.demo.json` fixture is not present in the inspected contract fixture tree; visual parity and non-addition need direct page/test evidence. | `apps/web/src/router.tsx:30-39`; `apps/web/src/pages/Overview.tsx`; `apps/web/src/context/AppContext.tsx`; `apps/web/src/mocks/state.ts` |
| F5 — Tier 3 visibility and badge | Issues page filters returned rows by `settings.experimental_enabled`; the engine also excludes Tier 3 rule execution unless that setting is enabled. `IssueRow` delegates tier display to `TierBadge`. The existing app E2E assertion exercises Tier 1, not the disabled/enabled Tier 3 boundary. | `apps/web/src/pages/Issues.tsx:43-44,85-95`; `apps/web/src/components/IssueRow.tsx`; `apps/web/src/components/Badges.tsx`; `apps/api/overcall/engine.py:27-28,89-90`; `apps/web/e2e/app.spec.ts` |
| F6 — timed search on 5,000 logs | The page performs search, status, range, and issue filtering in the browser. The query hook requests at most 200 recent rows and only sends provider; there is no cursor/search request path in the current API. The explicit 5,000-row timed acceptance cannot be inferred from the current implementation or from a passing UI test. | `apps/web/src/pages/Logs.tsx:30,81-99`; `apps/web/src/hooks/queries.ts:34-44`; `apps/api/overcall/api.py:106-110` |
| F7 — shared route fixture and one-time key display | Provider snippets are constructed in `Providers.tsx`, not sourced from a shared route fixture. The same page explicitly says this API does not provide ingest-key create/list/revoke endpoints; current snippets use provider credentials and do not implement Overcall ingest-key issuance. | `apps/web/src/pages/Providers.tsx:39-46,110-115`; `apps/api/overcall/api.py:90-104`; `contract/fixtures/` |

### Backend

| Plan module / unchecked criteria | Current boundary and behavior | Relevant source |
|---|---|---|
| B1 — app, DB and schema gates | A FastAPI app factory, request IDs, error handlers, health/readiness endpoints, async PostgreSQL engine, SQLModel entities, migrations, Docker Postgres setup, schema-parity/no-body tests, and CI legacy-reference script are present. `main.py` only registers `/healthz` and `/readyz`; the DB-dependent readiness route is testable only when a configured DB is available. The Supabase migration half remains separate from the local Docker check. | `apps/api/overcall/main.py:40-105`; `apps/api/overcall/db/engine.py`; `apps/api/overcall/db/models.py:25-33,76-180`; `supabase/migrations/`; `docker-compose.dev.yml`; `apps/api/tests/integration/test_schema_parity.py`; `apps/api/tests/security/test_no_body_columns.py`; `.github/workflows/ci.yml` |
| B2 — versioned deterministic pricing | A versioned pricing loader validates JSON against `contract/pricing.schema.json`; the calculator uses `Decimal` and returns basis/version. Tests cover historical selection and calculation. The legacy adapter converts cost to `float`, while the legacy proxy constructs the old `RequestLog` shape; verify end-to-end persistence of `cost_basis` and `pricing_version` before treating the calculation unit's contract as integrated. | `apps/api/overcall/pricing/{loader.py,cost.py,models.py}`; `apps/api/overcall/pricing_config.py:1,71-88`; `apps/api/overcall/proxy.py:99-108`; `apps/api/tests/unit/pricing/test_pricing.py` |
| B3 — synthetic data and freeze point | Generator and explicit positive/hard-negative labels exist; a fixture pair is present under `contract/fixtures/synthetic/small/`. The seven-rule truth/fixture path is independent of the web's runtime mock state. t1 found no `b3-frozen` tag; because the worktree is dirty, baseline/tag creation is a separate coordinator decision and must not capture unreviewed changes. | `apps/api/overcall/synthetic/generator.py:85-93,294-309`; `apps/api/overcall/synthetic/truth.py`; `apps/api/overcall/synthetic/scenarios.py`; `contract/fixtures/synthetic/small/{logs.json,ground_truth.json}` |
| B4/B5 — detection rules and storage | Seven rules share `rules/base.py`; `engine.rule_active` gates Tier 3 on `experimental_enabled`. The current detection persistence replaces issues with separate delete/insert calls, not one visible transaction. The old engine uses collection-based storage and legacy models, not the new SQLModel repository layer. | `apps/api/overcall/rules/{base.py,__init__.py}`; `apps/api/overcall/engine.py:27-28,89-101`; `apps/api/overcall/models.py`; `apps/api/overcall/db/models.py` |
| B6 — REST/API contract | The API module declares `/api` endpoints for overview, issues, rules, settings, providers, recent logs, synthetic operations, and data deletion. It imports `issues_col`, `logs_col`, and `runs_col` from `overcall.db`, but `overcall/db/__init__.py` contains only a docstring and the directory contains SQLAlchemy engine/models/repos rather than those collection exports. The router is also not included by `create_app`. The planned `/v1` contract and `contract/openapi.yaml` are absent. | `apps/api/overcall/api.py:6,14,23-138`; `apps/api/overcall/db/__init__.py:1`; `apps/api/overcall/main.py:40-105`; `contract/` |
| B7 — mock upstream | `proxy.py` creates an `httpx.AsyncClient` using `ASGITransport(app=mock_app)`, which is the in-process seam to `mock_llm.py`. Its functional verification must include the enclosing proxy; the proxy currently consumes the response as buffered content rather than forwarding a stream. | `apps/api/overcall/proxy.py:18-19,91-108`; `apps/api/overcall/mock_llm.py` |
| B8/B9 — proxy and SSE | Current proxy is under `/api/proxy`, reads the request body, calls `client.request`, accesses `resp.content`, then writes the log synchronously before returning a buffered `Response`. This is a single responsibility boundary for forwarding/metadata, but the queue/background flush, configured caps, streaming pass-through, final-chunk usage, and disconnect lifecycle in the plan are not represented in this path. | `apps/api/overcall/proxy.py:17-19,69-109`; `apps/api/overcall/config.py:38-50` |
| B10 — JWT and ingest keys | SQLModel has `UserSettings`, `IngestKey`, and user ownership fields, but the current API/proxy route modules have no `Depends(...)` auth wiring or `/v1/ingest-keys` endpoints. The browser Supabase SDK does not implement API-side tenant isolation by itself. | `apps/api/overcall/db/models.py:32-106`; `apps/api/overcall/api.py`; `apps/api/overcall/proxy.py`; `apps/api/overcall/deps.py` |
| B11 — hardening | JSON redaction/request-id logging and validated config settings for sizes, rates, retention, and queue limits exist. The currently inspected proxy does not consume most of those caps/queue settings. CI runs Ruff, legacy-reference and pricing-age checks, then pytest; repository configuration alone cannot prove fuzz-redaction, overhead measurement, a seven-day soak, production alerts, or secret scans across external logs. | `apps/api/overcall/logging.py`; `apps/api/overcall/config.py:38-50,87-90`; `apps/api/overcall/proxy.py`; `.github/workflows/ci.yml`; `apps/api/scripts/check_legacy_dependencies.py` |

### Integration

| Plan module / unchecked criteria | Current boundary and behavior | Relevant source |
|---|---|---|
| I1 — browser/backend integration | Demo mode starts MSW before rendering and an existing Playwright test asserts that demo does not contact the backend. In non-demo mode MSW is not started. The real-account path currently reaches a backend with an unmounted API router and a `/api` vs planned `/v1` contract mismatch, so the demo E2E does not establish real-account/API behavior. | `apps/web/src/main.tsx:28-42`; `apps/web/src/mocks/startDemoApi.ts`; `apps/web/e2e/app.spec.ts`; `apps/web/src/lib/api.ts:7-10`; `apps/api/overcall/main.py:40-105` |
| I2 — real-traffic accuracy | Current Settings explicitly reports real traffic as “Not measured yet”; the evaluator consumes generated synthetic logs and in-memory ground truth. Synthetic and real datasets are not currently represented as two measured reports by the backend. Keep the real-user/label/analysis criteria unchecked until the authorized dataset and its provenance exist. | `apps/web/src/components/settings/AccuracySection.tsx:24-31`; `apps/api/overcall/api.py:113-132`; `apps/api/overcall/engine.py:112-133` |
| I3 — deployment | Current deployment manifests still refer to the former `backend/` tree, `server:app`, `/api/health`, and CRA `build` output; the current app is under `apps/api`, FastAPI entrypoint `overcall.main:app`, and Vite frontend build. These manifests need reconciliation before deployment validation. Production smoke/alerts/provider env require credentials and production access unavailable in t1. | `render.yaml:1-9`; `vercel.json:1-5`; `apps/api/pyproject.toml`; `apps/web/package.json` |
| Appendix A — module handoff | These are cross-cutting handoff checks, not a separate runtime unit. Apply each module's test/lint/type/contract/security/accessibility/doc/build evidence at that module's handoff; the PR-description row cannot be verified without a PR. | `docs/PLAN.md:1780-1789`; `.github/workflows/ci.yml`; `apps/web/package.json` |

## Material architecture findings for planning

1. **CRITICAL — API runtime is disconnected from the business routes.** `create_app` does not mount either router. The legacy API router's collection imports are not exported by the present `overcall.db` package, while the current DB foundation is SQLAlchemy/SQLModel. A passing `/healthz` check is not evidence that `/api` or `/v1` endpoints work. **Mitigation:** treat routing, persistence ownership, and endpoint runtime probes as one explicit integration boundary before claiming B6/B8/I1 complete.
2. **HIGH — two HTTP contract generations coexist.** Browser code and mock handlers use `/api`; the plan requires `/v1`; the FastAPI host currently has no matching resource endpoints and no OpenAPI source. **Mitigation:** make the intended contract the prerequisite for generated types, route fixtures, and backend/frontend parity checks; avoid implementing against the mock shape alone.
3. **HIGH — proxy and analytics still follow the collection model.** The current forwarding path buffers responses and synchronously persists a legacy log, whereas the new schema includes metadata-only fields such as `cost_basis`/`pricing_version` and the plan requires queued logging/SSE. **Mitigation:** keep proxy forwarding, stream lifecycle, log persistence, and detection transaction proof as separately verifiable responsibilities sharing an explicit persisted-log contract.
4. **HIGH — deployment entrypoints are stale.** Render and Vercel config do not point at the current app layout/build output. **Mitigation:** reconcile paths and health target before treating local builds as deployment evidence; production-only checks remain external.

## Non-goals / verification boundary

- This artifact does not decide the remaining implementation order; t3 owns the dependency-ordered plan.
- It does not mark checklist items complete or repeat F1 work.
- No build, endpoint probe, migration, production check, OAuth/provider test, 5,000-row timed search, or seven-day soak was run for this architecture analysis.
- External/manual blockers and the exact t1 inventory are recorded in `t1-pm.md`; this artifact only maps them to the code boundaries above.

## Upstream Artifacts Consumed

- `.github/modernize/rearchitecture/artifacts/t1-pm.md` — unchecked checklist rows, manual/external blockers, and the warning to preserve the dirty worktree/baseline.
- `.github/modernize/rearchitecture/artifacts/project-profile.yaml` — repository structure and `grouping_needed: false`.

## Evidence Mapping

- `t1-pm.md#Unchecked items, in plan order` → Frontend, Backend, Integration, and Appendix A tables above map each acceptance group to implementation paths and current runtime boundaries.
- `t1-pm.md#Manual and external preconditions` → F2, B1, F6, B3, B11, I2, I3, and Appendix A notes preserve the external/manual verification limits; no item is represented as completed.
- `project-profile.yaml#project.structure` / `#progress_sync.grouping_needed` → Scope uses existing `apps`, `contract`, `supabase`, `docs` modules and the plan's F/B/I labels rather than invented topology groups.

## Validation

- Read-only evidence review: inspected router/API host, frontend query and mock paths, DB model/migration/test files, pricing/detection/proxy modules, and deployment manifests.
- Checklist verification: compared module coverage against the t1 inventory of 65 unchecked rows (F2–F7, B1–B11, I1–I3, Appendix A).
- Tests/build: not run; this deliverable is an architecture map and makes no application-code changes.
