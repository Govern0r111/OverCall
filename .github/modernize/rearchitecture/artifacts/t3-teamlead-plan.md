# t3 — Dependency-Ordered Checklist Execution Plan

**Date:** 2026-11-06
**Source checklist:** `docs/PLAN.md`
**Scope:** 60 unchecked rows currently in F2–F7, B1–B11, I1–I3, and Appendix A. F1 is checked in the source and is not repeated.

## Re-run after architecture evidence correction

The prior planning attempt recorded one HIGH because `t2-architect.md` contained superseded route/auth observations. That evidence issue is resolved by `.github/modernize/rearchitecture/artifacts/t2.5-architect.md`, which reconciles the current `/v1` and `/proxy` routing, JWT authentication, frontend DTOs, and detection status against later implementation evidence and reports PASS with 0 HIGH and 0 CRITICAL findings. This plan therefore uses the corrected local integration boundary and does not carry the old route/auth mismatch as an open issue. Real Supabase/OAuth, hosted CI, PostgreSQL-only checks, ingest-key lifecycle, broad tenant isolation, and production verification remain separate open acceptance gates.

## Summary

Execute the remaining checklist in dependency order, preserving the plan’s F/B/I module boundaries. First establish local DB/API and synthetic-data evidence; then complete detection, auth, API-contract, mock/proxy, and streaming work; then finish dependent frontend and integration checks; finally perform deployment, hardening, and handoff gates. Tasks may inspect existing implementation and close a row without code changes only when the exact criterion is directly verified with reproducible evidence.

Do not treat the later local signed-in demo run as real Supabase/OAuth evidence. Do not repair B3’s absent pre-rule tag by creating a tag on the current dirty tree. Do not invent real accuracy numbers, production evidence, a human timing result, or a seven-day soak. Keep each such gate open until its stated evidence exists.

## Current-State Notes

- Current checklist scan found 60 unchecked rows: F2–F7: 8; B1–B11: 34; I1–I3: 10; Appendix A: 8.
- F1 rows are checked; the user’s visual review at 320/768/1280px in both themes and the navigation-wrap fix are not repeated. B11’s separate overhead/FAQ criterion may require updating an F1 FAQ number after measurement, but does not reopen F1’s visual checklist.
- `project-profile.yaml` says `grouping_needed: false`; no topology or fanout artifact was found. Existing F/B/I module names are the task boundaries.
- `t2-architect.md`'s earlier route/auth observations are historical and superseded by its final re-review and `t2.5-architect.md`. The corrected evidence confirms `/v1` and `/proxy` route wiring, JWT verification, frontend DTO alignment, and persisted `succeeded`/public `completed` detection status. Do not retain the old route/auth mismatch as a current blocker; keep real-account, hosted CI, PostgreSQL-only, ingest-key lifecycle, and isolation gates open where they remain unverified.
- `.github/modernize/rearchitecture/context.md`, `decisions.md`, and `constitution.md` were absent. This plan does not invent project principles; it follows the user’s explicit constraints and the supplied PM/architecture evidence.
- Pre-existing modifications to `.github/modernize/rearchitecture/artifacts/project-profile.yaml` and `board.md` were observed and left untouched.

## Technical Context

**Application:** mixed React/Vite/TypeScript SPA and FastAPI/Python API/proxy.
**Persistence:** PostgreSQL via SQLModel/async SQLAlchemy; Supabase migrations/project are a separately controlled environment.
**Contract:** `contract/openapi.yaml`, backend-generated OpenAPI and fixtures; current web client uses versioned `/v1` endpoints.
**Frontend validation:** `npm test` (Vitest), `npm run test:e2e` (Playwright), `npm run build`, `npm run lint`, and relevant design/accessibility checks from `apps/web/package.json`.
**Backend validation:** pytest from `apps/api/pyproject.toml`, `apps/api/scripts/check_contract.py`, Ruff, startup probes at `/healthz` and `/readyz`.
**Environment observed during planning:** Docker daemon available, Node.js `v22.22.0`, Python `3.13.3`; Playwright browser installation was not attempted. The API declares Python `>=3.11`.
**Known constraints:** do not inspect or expose secret values; no user-controlled Supabase/OAuth, production/Vercel/Render, or authorized real-traffic evidence was available in t1.

## Constitution Check

No project constitution was found, so no constitution-specific PASS is claimed. The plan follows the explicit constraints supplied for this run: preserve existing worktree changes; inspect before modifying; use only repo-supported behavior; keep manual/provider/production/soak/real-data claims unchecked unless directly verified; and record the precise blocker.

## Applied Guidelines

This is in-place brownfield checklist completion, not a framework/source-to-target migration. No source transformation guideline applies. Use the repository’s existing React/Vitest/Playwright and FastAPI/pytest/SQLModel boundaries; do not introduce a parallel test stack.

## Dependency-Ordered Implementation Steps

### Step 1: Local application and database foundation
- **Checklist criteria:** B1-01..04 (B1-02 local Docker portion).
- **Design inputs:** current FastAPI app factory, SQLModel/migrations, Docker Compose, existing schema-parity/no-body tests, CI legacy-reference check.
- **Description:** verify app startup/health, apply migrations to Docker Postgres, run schema-parity/no-body checks, and run the legacy-reference grep. Keep the Supabase migration separate from local evidence.
- **Tasks:** T001, T002.

### Step 2: Pricing and historical pricing evidence
- **Checklist criteria:** B2-01..03.
- **Design inputs:** `apps/api/overcall/pricing/`, pricing schema and proxy persistence.
- **Description:** verify deterministic Decimal pricing, basis/version propagation, historical-version behavior, and pricing-file metadata/schema validation.
- **Tasks:** T003.

### Step 3: Synthetic data and freeze-point disposition
- **Checklist criteria:** B3-01..04.
- **Design inputs:** generator/truth/scenario code and `contract/fixtures/synthetic/small/`.
- **Description:** verify deterministic output, independent ground truth, seven-rule hard negatives, and fixture-schema validity. First resolve whether a historical `b3-frozen` baseline can be established. Because rule code already exists and the worktree is dirty, do not create a new tag or claim it was “before any rule code” without an explicit coordinator decision and history evidence.
- **Tasks:** T004, T005.

### Step 4: Detection and rule gates
- **Checklist criteria:** B4-01..04, B5-01..03.
- **Design inputs:** `apps/api/overcall/engine.py`, `apps/api/overcall/rules/`, SQLModel detection/request-log models, synthetic truth.
- **Description:** verify or implement atomic detection-run replacement, Tier 1 unit/hard-negative behavior, distinct spend/reliability storage, shared rule/settings thresholds, Tier 3 gate/confidence, and per-rule synthetic precision/recall. No real-data accuracy claims.
- **Tasks:** T006, T007.

### Step 5: Protected API and ingest-key contract
- **Checklist criteria:** B10-01..02, B6-01..02.
- **Design inputs:** current `deps.py`, versioned API router, repositories, OpenAPI and fixture tests.
- **Description:** complete ingest-key create/list/use/revoke lifecycle and prove one-time plaintext visibility; exercise user/tenant isolation and settings/gating for every relevant endpoint; compare response shapes against contract fixtures.
- **Tasks:** T008, T009.

### Step 6: Mock upstream, proxy persistence, and SSE
- **Checklist criteria:** B7-01..03, B8-01..02, B9-01..03.
- **Design inputs:** `apps/api/overcall/proxy.py`, `mock_llm.py`, metadata-only `RequestLog`, current in-process `ASGITransport` seam and proxy integration tests.
- **Description:** verify the mock is in-process and externally unreachable; test error/latency/stream behavior; ensure metadata writes are off the request path and within the stated time; exercise redaction/no-body rules; pass stream chunks, account usage from the final chunk or explicitly label estimates, and clean up/log on disconnect. The already-checked exact upstream response and fail-closed/fail-open criteria are not repeated.
- **Tasks:** T010, T011, T012.

### Step 7: Frontend contract and page acceptance
- **Checklist criteria:** F2-01, F3-01, F4-01..02, F5-01, F6-01, F7-01..02.
- **Design inputs:** current `/v1` client/DTO adapters, MSW handlers, pages and E2E suite; actual backend proxy route and ingest-key contract.
- **Description:** generate API types from the authoritative contract; verify overview parity against a canonical fixture (none named `overview.demo.json` was found, so derive only from an approved existing source); verify figure separation; exercise Tier 3 display and badge boundary; profile the 5,000-row search with the prescribed data; derive provider snippets from a shared fixture of actual routes and test one-time key display.
- **Tasks:** T013–T017.

### Step 8: Real-backend integration
- **Checklist criteria:** I1-01..02.
- **Design inputs:** current `/v1` routing, DTO adapters, local JWT verification, Docker Postgres, Playwright and CI workflow.
- **Description:** run a browser happy path against the real local API with isolated DB and test JWT, then obtain CI evidence. The checked demo-with-backend-stopped behavior is not repeated. Real Supabase account/provider “no mock data” proof is a separate manual gate.
- **Tasks:** T019, T020.

### Step 9: Separate synthetic and real accuracy evidence
- **Checklist criteria:** I2-01..04.
- **Design inputs:** current accuracy API/Settings UI, synthetic fixture/labels, authorized evaluation data.
- **Description:** maintain separate dataset/report provenance and display separate rows/sample sizes without fabricating real results. Before any real evaluation, verify label history predates the run; write the misses/false-alarms analysis only from an authorized real evaluation.
- **Tasks:** T021, T022.

### Step 10: Deployment configuration and production gates
- **Checklist criteria:** I3-01..04.
- **Design inputs:** root `render.yaml`, `vercel.json`, `apps/api/pyproject.toml`, web build output, `docs/DEPLOY.md`.
- **Description:** reconcile manifests and health/entrypoint/build paths locally; verify the documented always-on API transition is a one-line Render change. Keep production smoke, active keep-alive/DB alert, and production variable/log review gated on authorized access. Repo-only secret scanning is local evidence, not proof about dashboard values or logs.
- **Tasks:** T023, T024.

### Step 11: Hardening and CI
- **Checklist criteria:** B11-01..04.
- **Design inputs:** redaction/logging, proxy caps/retention, workflow checks, and measured proxy behavior.
- **Description:** run fuzz redaction across relevant paths, measure overhead and update the FAQ from the measured value, verify retention/caps, perform a full seven-day synthetic soak before asserting the budget, and confirm CI gates secrets, vulnerable dependencies, and contract drift.
- **Tasks:** T025, T026, T027.

### Step 12: Module handoff and completion gate
- **Checklist criteria:** Appendix A-01..08.
- **Description:** apply evidence gates per touched module: tests, lint/types/format, contract, secret/security checks, accessibility, docs, and isolated build/test. The PR-description checkbox requires an actual PR; do not tick it based only on local artifacts.
- **Tasks:** T028, T029.

## Task Breakdown

All tasks begin unchecked. Every task must inspect current code first; a verification-only task may close criteria only with direct evidence. Run module tests for each implementation task and record pass/fail/skip counts. Exact blocked/manual tasks must remain open until their prerequisites are available.

### Phase 1 — Foundation

- [ ] T001 [Plan:1.1] Start `apps/api/overcall/main.py` as `uvicorn overcall.main:app`, probe `/healthz` and `/readyz`, apply migrations to Docker Postgres, run `apps/api/tests/integration/test_schema_parity.py`, `apps/api/tests/security/test_no_body_columns.py`, and `apps/api/scripts/check_legacy_dependencies.py`; record exact commands/results.
- [ ] T002 [Plan:1.1] Apply the current migrations to the authorized development Supabase project and record success/failure without exposing credentials. **Gate:** user-controlled Supabase project access required; do not substitute local Docker evidence.

### Phase 2 — Pricing and synthetic baseline

- [ ] T003 [P] [Plan:2.1] Verify deterministic pricing, basis/version persistence, historical pricing, `retrieved_at`, and `contract/pricing.schema.json` using `apps/api/overcall/pricing/` and its existing unit/integration tests; fix only repo-supported gaps.
- [ ] T004 [Plan:3.1] Inspect `git tag`, relevant history, and current worktree for `b3-frozen`; document whether the required pre-rule baseline is historically provable and request coordinator disposition before any tag creation or rule edits. Do not alter existing worktree changes.
- [ ] T005 [Plan:3.2] Verify deterministic generator output, separate ground truth, seven hard-negative rule cases, and `contract/fixtures/synthetic/small/{logs.json,ground_truth.json}` schema validity; commit changes only after the B3 baseline decision and review.

### Phase 3 — Detection and API foundation

- [ ] T006 [Plan:4.1] Verify/implement atomic rerun replacement, Tier 1 unit/hard-negative tests, per-rule synthetic precision/recall, and separate spend/reliability storage in `apps/api/overcall/engine.py`, `apps/api/overcall/rules/`, and detection repositories.
- [ ] T007 [Plan:4.2] Verify all seven rules share `apps/api/overcall/rules/base.py`, use settings thresholds, gate Tier 3, carry confidence, and report per-rule synthetic precision/recall; add focused tests.
- [ ] T008 [Plan:5.1] Complete ingest-key create/list/use/revoke behavior, one-time plaintext handling, and per-endpoint isolation tests in `apps/api/overcall/v1_api.py`, `apps/api/overcall/deps.py`, `apps/api/overcall/db/repos/`, and `apps/api/tests/`.
- [ ] T009 [Plan:5.2] Complete versioned API isolation/gating and fixture response-shape tests for `apps/api/overcall/v1_api.py`, `apps/api/overcall/api_schemas.py`, `contract/openapi.yaml`, and `contract/fixtures/`; preserve the already-checked drift result.

### Phase 4 — Mock/proxy transport

- [ ] T010 [Plan:6.1] Verify `apps/api/overcall/proxy.py` talks to `apps/api/overcall/mock_llm.py` in-process without network access; cover streaming/errors/latency injection and prove the mock is not externally mounted.
- [ ] T011 [Plan:6.2] Verify metadata-only persistence is off the request path and meets the approximately two-second criterion; run redaction and no-body-sentinel tests across proxy failure/success paths in `apps/api/tests/`.
- [ ] T012 [Plan:6.3] Implement/verify streaming pass-through, final-chunk usage or labeled estimate, and disconnect cleanup/logging in `apps/api/overcall/proxy.py`; cover each behavior with in-process integration tests.

### Phase 5 — Frontend

- [ ] T013 [Plan:7.1] Add/verify the frontend `gen:api` workflow under `apps/web/package.json` and generated types under `apps/web/src/`; regenerate twice and prove the second `npm run gen:api` produces no diff against `contract/openapi.yaml`.
- [ ] T014 [Plan:7.2] Verify `apps/web/src/pages/Overview.tsx` and `apps/web/src/mocks/state.ts` against an approved `overview.demo.json` fixture in both themes; keep spend and reliability figures distinct. No fixture with that name currently exists, so establish its canonical source before adding one.
- [ ] T015 [Plan:7.3] Verify `apps/web/src/pages/Issues.tsx`, `apps/web/src/components/IssueRow.tsx`, and `apps/web/src/components/Badges.tsx` hide Tier 3 while disabled and always badge it when enabled; cover both settings states.
- [ ] T016 [Plan:7.4] Profile search/filters in `apps/web/src/pages/Logs.tsx` and `apps/web/e2e/` with the actual 5,000-row demo set; record timing and test coverage. **Gate:** do not claim the manual “few seconds” criterion without a human timing result on that dataset.
- [ ] T017 [Plan:7.5] Create/verify a shared proxy-route fixture from actual backend routes in `apps/api/overcall/proxy.py`; make `apps/web/src/pages/Providers.tsx` snippets consume it and test one-time key display against the key lifecycle.
- [ ] T018 [Plan:7.6] Perform email and Google auth against the user’s Supabase project using `VITE_AUTH_MODE=supabase`, configured providers, and a real account. **Gate:** credentials/provider/project access unavailable in current evidence; mock auth is not a substitute.

### Phase 6 — Integration and validation datasets

- [ ] T019 [Plan:8.1] Add/run a real local browser-to-FastAPI happy path using Docker Postgres and an isolated test JWT; run the applicable CI workflow and record both local and CI results. Reuse existing Playwright flows minimally; do not count MSW-only demo verification as real API integration.
- [ ] T020 [Plan:8.1] Verify a real signed-in Supabase account never sees mock data. **Gate:** requires user-controlled Supabase/OAuth setup and a real account; leave unchecked until performed.
- [ ] T021 [Plan:9.1] Verify/implement isolated synthetic and real dataset/report provenance plus separate Settings accuracy rows/sample sizes in `apps/api/overcall/api_schemas.py`, the accuracy API, and `apps/web/src/components/settings/AccuracySection.tsx`; display no invented real metrics.
- [ ] T022 [Plan:9.2] With an authorized real-traffic dataset, verify labels were committed before the first evaluation, run the real evaluation, and write the misses/false-alarms analysis in `validation/README.md`. **Gate:** no authorized real-user/production dataset is available; synthetic results cannot satisfy this criterion.
- [ ] T023 [Plan:10.1] Reconcile `render.yaml`, `vercel.json`, `apps/api/pyproject.toml`, web build paths, health routes, and `docs/DEPLOY.md`; prove the always-on API transition is a one-line `render.yaml` change and run local config/build checks.
- [ ] T024 [Plan:10.2] Perform production smoke, verify active keep-alive/DB-size alert, and inspect production variables/logs for secrets. **Gate:** requires authorized production/Vercel/Render access; a repository scan alone is not sufficient.

### Phase 7 — Hardening and closeout

- [ ] T025 [Plan:11.1] Fuzz redaction across proxy/logging code paths, measure proxy overhead with reproducible commands, and update the F1 FAQ figure in `docs/PLAN.md` only from that measurement; do not redo F1 visual verification.
- [ ] T026 [Plan:11.2] Verify retention/cap implementation, run synthetic traffic with DB-size measurement, and keep the criterion open until a continuous seven-day soak completes.
- [ ] T027 [Plan:11.3] Run/verify CI gates for secrets, dependency vulnerabilities, and contract drift in `.github/workflows/ci.yml`; record local and hosted CI evidence separately.
- [ ] T028 [Plan:12.1] For each touched module, run module tests, lint, type checks, formatting, `check-contract`, gitleaks, relevant security/no-body tests, axe/focus/keyboard checks, doc review, and isolated build/test; attach results to the module handoff.
- [ ] T029 [Plan:12.1] At PR time, verify the module’s own done-when list is fully checked in its PR description. **Gate:** no PR description is available in this planning task.

## Dependency Table

| Task | Depends on | Constraint |
|---|---|---|
| T001 | — | Docker is currently available; Postgres-backed evidence is mandatory for schema/migration claims. |
| T002 | T001 | Supabase project credentials/access must be user-controlled and available. |
| T003 | — | Independent pricing verification; do not infer historical-version behavior from current pricing only. |
| T004 | — | Coordinator must decide the historical B3 baseline; do not tag the current dirty tree speculatively. |
| T005 | T004 for any mutation | Read-only generator/fixture verification may proceed; edits/commits wait for B3 disposition. |
| T006 | T005 | Use deterministic synthetic ground truth; atomicity needs failure-injection tests. |
| T007 | T005, T006 | Tier 3 checks must cover disabled and enabled settings. |
| T008 | T001 | JWT implementation exists; this row concerns key lifecycle and isolation, not the already-checked unauthenticated-route gate. |
| T009 | T001, T008 | Use authenticated tenant fixtures and contract response fixtures. |
| T010 | — | In-process mock is test-only; no external network dependency. |
| T011 | T001, T008, T010 | Verify persistence failure behavior without exposing request bodies/secrets. |
| T012 | T010, T011 | Streaming must be exercised end-to-end through the proxy, not only against the mock directly. |
| T013 | T009 | Contract generation must use the authoritative current OpenAPI artifact. |
| T014 | T013 | Fixture source must be explicit; preserve distinct spend/reliability semantics. |
| T015 | T007 | Use API/settings semantics and test both experimental states. |
| T016 | T009, T013 | 5,000-row dataset and human-timed acceptance are separate evidence. |
| T017 | T008, T010, T012 | Snippets must match actual proxy routes and real key lifecycle. |
| T018 | — | External provider configuration and real account are prerequisites. |
| T019 | T008, T009, T011, T012, T013 | Local signed-in flow is not the real-account criterion. |
| T020 | T019 | Requires real Supabase session/provider configuration; no mock data permitted. |
| T021 | T005, T007, T013 | Keep synthetic and real data/report records separate by provenance. |
| T022 | T021 | Authorized real dataset and labels with pre-evaluation history required. |
| T023 | T001 | Align deployment configuration to the current app paths and health behavior. |
| T024 | T023 | Production service credentials/access required. |
| T025 | T011, T012 | Update FAQ only after reproducible overhead measurement. |
| T026 | T001, T011 | Seven-day duration is mandatory; short runs are interim evidence only. |
| T027 | T009, T013, T025 | CI must run relevant security/dependency/contract checks. |
| T028 | T001–T027 as applicable | Per-module evidence is required; external blockers stay open and visible. |
| T029 | T028 | Requires actual PR description. |

## Testing Strategy

### Application Type and Critical Journeys

**appType:** mixed SPA + API/proxy.

1. Mock/demo auth → overview → issue detail → filtered logs, including offline-backend demo behavior.
2. Local signed-in user → authenticated `/v1` reads/writes → tenant isolation and response-shape verification.
3. Ingest-key lifecycle → proxy to in-process mock → metadata-only persistence → redaction/no-body verification.
4. Detection run over deterministic synthetic fixtures → issue persistence/re-run replacement → per-rule precision/recall.
5. Settings change → Tier 3 enable/disable → UI visibility/badging and matching backend rule gate.

### Primary Validation Stack

- Frontend unit/component: `npm test` from `apps/web`.
- Frontend browser: `npm run test:e2e` with Playwright against the running Vite app; run with backend/DB for integration journeys and separately with backend stopped for the already-checked demo-only journey.
- Frontend static/build: `npm run build`, `npm run lint`, and the repository’s design/accessibility checks as applicable.
- Backend: pytest via `apps/api/pyproject.toml`, Ruff, `apps/api/scripts/check_contract.py`, and Uvicorn startup probes.
- Database/integration: Docker Postgres via repository setup; apply migrations and run schema parity/RLS tests rather than treating SQLite/unit tests as equivalent.
- CI: run the relevant workflow and report hosted CI separately from local command results.

### Fallback Matrix

| Axis | Primary | Fallback if that axis itself is unavailable | Known gap |
|---|---|---|---|
| Infrastructure | Docker Postgres, migrations, API integration tests | Unit/TestClient tests may continue for isolated code only; if repo-compatible in-memory DB is used, record exact choice/error and do not close Postgres migration/schema/RLS criteria. | PostgreSQL-specific migrations, constraints, RLS, and schema parity remain unverified. |
| Browser | Playwright (Node is available; package declares Playwright) | Attempt browser installation; only fall back to API/framework tests after a reproducible Playwright prerequisite failure. | No browser rendering, keyboard/focus, or real browser/network behavior proof. |
| External services | In-process ASGI mock upstream; MSW for demo-only frontend tests; local test JWT | Keep provider credentials/services mocked for local tests; separate manual real-provider verification. | No claim about Supabase OAuth, provider production behavior, or live accounts. |

Docker and browser are independent axes: a Docker failure does not justify skipping Playwright; a browser failure does not justify skipping Docker/Postgres tests.

### External Dependency and Test Data Strategy

- PostgreSQL: real Docker-managed DB for migrations, schema parity, tenant isolation, and persistence integration; unique tenant/user IDs per test; rollback or explicit cleanup.
- Mock upstream: in-process ASGI transport for deterministic status/body/headers/stream/errors/latency; no network call needed.
- Auth: controlled local JWT signing keys for integration tests; Supabase provider/OAuth is a separate user-controlled manual gate.
- Frontend API contract: generated types/contract fixtures; MSW is permitted only for demo/unit flows, not as evidence of real browser-to-API integration.
- Synthetic data: deterministic `small` fixture plus separate ground-truth file and per-rule hard negatives. Preserve dataset/version provenance.
- Real traffic: never blend with synthetic reports; require authorized data and committed labels before first real evaluation; do not fabricate accuracy rows.

### Acceptance and Evidence Rules

- Every implementation task runs its module tests and records exact commands, exit codes, pass/fail/skip counts, and failure details.
- Startup PASS requires Uvicorn to start and `/healthz` to respond 2xx; `/readyz` must reflect the configured database. An expected 503 without DB is not a DB readiness PASS.
- Contract PASS requires backend OpenAPI drift check and fixture response shape equality; frontend generation must be repeatable with no diff.
- API integration PASS requires actual local app/API/DB interaction and authenticated user isolation; test overrides alone do not prove browser integration.
- Browser PASS requires the relevant Playwright journey and accessibility evidence; MSW-only demo coverage is labeled as demo-only.
- External provider, production, real-data, human-timed, seven-day soak, and PR criteria remain unchecked until performed with their actual prerequisite and evidence.

### Existing Test Assets

- Discovered/referenced: Vitest tests under `apps/web/src/`, Playwright E2E under `apps/web/e2e/`, FastAPI pytest under `apps/api/tests/`, contract checker under `apps/api/scripts/`.
- Decision: reuse with minimal edits; preserve passing journeys and extend for newly verified behaviors.
- The available evidence includes backend `77 passed, 0 failed, 2 skipped` (PostgreSQL-only checks skipped) and frontend `23 passed` / E2E `12 passed` from prior task artifacts. These are historical baselines, not completion evidence for the remaining checklist.

## Requirement Mapping

Checklist criterion IDs below are the canonical mapping for every currently unchecked row. Full source text and evidence expectation are in `checkpoints/t3-checklist-to-plan.yaml`.

| Criterion IDs | Plan items | Tasks | Implementation / verification evidence |
|---|---|---|---|
| F2-01 | P7.6 | T018 | Real Supabase email/Google auth result from user-controlled project/account. |
| F3-01 | P7.1 | T013 | Repeatable generated types and clean no-diff result. |
| F4-01, F4-02 | P7.2 | T014 | Approved overview fixture, both-theme visual comparison, separate figures test. |
| F5-01 | P7.3 | T015 | Tier-3 disabled/enabled UI and API setting tests. |
| F6-01 | P7.4 | T016 | 5,000-row dataset, timing record, browser test evidence. |
| F7-01, F7-02 | P7.5 | T017 | Shared route fixture, snippet parity, one-time key test. |
| B1-01..04 | P1.1 | T001, T002 | Uvicorn probes, Docker and development Supabase migrations, schema/no-body tests, legacy-reference result. |
| B2-01..03 | P2.1 | T003 | Pricing unit/integration tests, historical version, schema validation. |
| B3-01..03 | P3.2 | T005 | Determinism, ground truth, seven hard-negative cases, fixture validation/commit. |
| B3-04 | P3.1 | T004 | History-supported baseline decision; no speculative tag. |
| B4-01..04 | P4.1 | T006 | Transaction/failure-injection tests, Tier 1 suite, per-rule metrics, storage separation. |
| B5-01..03 | P4.2 | T007 | Shared interface/settings thresholds, Tier 3 gate/confidence, per-rule metrics. |
| B6-01..02 | P5.2 | T009 | Per-endpoint tenant isolation/gating and response fixture equality. |
| B7-01..03 | P6.1 | T010 | In-process transport, error/latency/stream tests, external reachability test. |
| B8-01..02 | P6.2 | T011 | Async metadata persistence timing, redaction and no-body tests. |
| B9-01..03 | P6.3 | T012 | Chunk arrival, usage labeling, disconnect cleanup/logging tests. |
| B10-01..02 | P5.1 | T008 | Key lifecycle/one-time plaintext and endpoint isolation suite. |
| B11-01..02 | P11.1 | T025 | Fuzz-redaction results, measured overhead, FAQ update. |
| B11-03 | P11.2 | T026 | Retention/cap tests and complete seven-day soak record. |
| B11-04 | P11.3 | T027 | CI results for secret, dependency, and contract checks. |
| I1-01 | P8.1 | T019 | Local real API browser happy path and CI result. |
| I1-02 | P8.1 | T020 | Real Supabase account session with proof mock data is not shown. |
| I2-01, I2-03 | P9.1 | T021 | Separate dataset/report provenance and separate Settings rows/sample sizes. |
| I2-02, I2-04 | P9.2 | T022 | Label commit history, authorized evaluation, written misses/false-alarms analysis. |
| I3-01..03 | P10.2 | T024 | Production smoke, active keep-alive/DB alert, deployment variables/log review. |
| I3-04 | P10.1 | T023 | Config/build evidence showing one-line always-on Render change. |
| Appendix A-01 | P12.1 | T029 | Actual PR description with module done-when checklist. |
| Appendix A-02..08 | P12.1 | T028 | Per-module test/lint/types/format, contract, gitleaks/security, accessibility, docs, isolated build evidence. |

## Project Structure

```text
apps/
  web/                 React/Vite app, Vitest and Playwright
  api/                 FastAPI app, pytest, SQLModel and migrations
contract/              OpenAPI, schemas, fixtures, pricing
supabase/migrations/   Supabase-side migration source
docs/PLAN.md           Source checklist and acceptance criteria
render.yaml            API deployment configuration
vercel.json            Frontend deployment configuration
```

## Open Gates

1. **B3 baseline:** coordinator decision required before creating a tag; existing rule code and dirty worktree make the original “before any rule code” wording non-retroactive.
2. **F2, B1 Supabase, I1 real-account:** user-controlled Supabase project, email/Google providers, credentials, and real account required.
3. **F6:** human-timed test on the actual 5,000-row demo dataset required.
4. **B11 soak:** actual seven-day synthetic traffic window required.
5. **I2:** authorized real dataset and label history required; no real metrics/analysis may be synthesized.
6. **I3:** production/Vercel/Render access required for production smoke, active alert, variables, and logs.
7. **Appendix A-01:** actual module PR description required.

## Upstream Artifacts Consumed

- `.github/modernize/rearchitecture/artifacts/t1-pm.md` — unchecked inventory and manual/external blockers.
- `.github/modernize/rearchitecture/artifacts/t2-architect.md` — architecture map, final route/auth re-review, and remaining validation boundaries.
- `.github/modernize/rearchitecture/artifacts/t2.1-backend.md` — API runtime and test evidence, including PostgreSQL skips.
- `.github/modernize/rearchitecture/artifacts/t2.2-frontend.md` — final local browser/API integration evidence and its test-auth boundary.
- `.github/modernize/rearchitecture/artifacts/t2.2.1-frontend.md` — DTO alignment, adapters, and signed-in demo evidence.
- `.github/modernize/rearchitecture/artifacts/t2.3-backend.md` — JWT verification evidence and external-provider limits.
- `.github/modernize/rearchitecture/artifacts/t2.4-backend.md` — persisted detection status and public response mapping.
- `.github/modernize/rearchitecture/artifacts/t2.5-architect.md` — authoritative reconciliation of the previously stale route/auth/status claims.
- `docs/PLAN.md`, `apps/web/src/lib/api.ts`, `apps/api/overcall/deps.py`, `apps/web/package.json`, `apps/api/pyproject.toml`, `project-profile.yaml` — current acceptance state, routes, auth, commands, and module grouping.

## Evidence Mapping

- `t1-pm.md#Unchecked items, in plan order` → checklist criteria in `checkpoints/t3-checklist-to-plan.yaml`.
- `t1-pm.md#Manual and external preconditions` → Open Gates and T002/T018/T020/T022/T024/T026/T029.
- `t2-architect.md#Final re-review after route, DTO, auth, and detection-status remediation` plus `t2.5-architect.md#Reconciled claims` → current `/v1` and `/proxy` route/auth/DTO/status facts used by T008, T009, T019, and the integration dependencies; the superseded mismatch is not carried as a blocker.
- `t2.1-backend.md#Test Results` → API test strategy and PostgreSQL-specific limitations.
- `t2.2-frontend.md#Final Re-verification After t2.4` and `t2.2.1-frontend.md#Remaining Boundaries` → local signed-in demo/API evidence, frontend test commands, and the explicit real-account boundary.
- `t2.3-backend.md#Test Results` / `#Remaining Boundaries` → local JWT verification is implemented; external provider/JWKS and key-lifecycle/isolation gates remain distinct.
- `t2.4-backend.md#Evidence Mapping` → detection DB status `succeeded` versus public `completed` semantics.
- `project-profile.yaml#assessment` → existing F/B/I group labels; no G-group topology.

## Validation Results

- Current unchecked rows were scanned directly in `docs/PLAN.md`: 60.
- Group counts: F2–F7 = 8; B1–B11 = 34; I1–I3 = 10; Appendix A = 8. F1 is excluded and not repeated.
- Architecture correction: `t2.5-architect.md` reports PASS, 0 HIGH, 0 CRITICAL; the old route/auth mismatch is resolved. No open architecture finding blocks this plan.
- Environment probes: Docker daemon available; Node `v22.22.0`; Python `3.13.3`.
- No application tests were run because this task produced a plan only.
- Pre-existing modifications in `project-profile.yaml` and `board.md` were preserved.
