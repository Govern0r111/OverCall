# t1 — Remaining `docs/PLAN.md` checklist inventory

## Summary

At 2026-11-06 12:43 UTC, `docs/PLAN.md` contained **65 unchecked checklist rows** after F1. F1 was excluded per the assignment. Counts: frontend 8 (F2–F7), backend 38 (B1–B11), integration 11 (I1–I3), and Appendix A 8.

An unchecked row is not evidence that the implementation is absent; the implementation and proof for each row must be inspected during execution. This inventory does not change `docs/PLAN.md`, mark work complete, or prescribe implementation details.

## Unchecked items, in plan order

### Frontend

| Plan line | Module | Unchecked acceptance item |
|---:|---|---|
| 752 | F2 | Verify email and Google auth with `VITE_AUTH_MODE=supabase` against the user's Supabase project (manual). |
| 788 | F3 | Confirm `npm run gen:api` produces no diff on a clean checkout. |
| 818 | F4 | Confirm the page matches `overview.demo.json` in both themes. |
| 820 | F4 | Confirm the two figures remain separate and are never added together. |
| 851 | F5 | Confirm Tier 3 is hidden unless enabled and is badged whenever shown. |
| 877 | F6 | Manually time finding a specific request with search/filters on the 5,000-row demo set. |
| 904 | F7 | Confirm each setup snippet matches the shared fixture of actual proxy routes. |
| 905 | F7 | Confirm the key is displayed only once. |

### Backend

| Plan line | Module | Unchecked acceptance item |
|---:|---|---|
| 984 | B1 | Start `uvicorn overcall.main:app`; verify `/healthz` and `/readyz`. |
| 985 | B1 | Apply migrations to Docker Postgres and the dev Supabase project. |
| 986 | B1 | Pass schema-parity and no-body-column tests. |
| 987 | B1 | Verify the CI grep finds no Mongo, Motor, supabase-py, or Emergent references. |
| 1027 | B2 | Confirm deterministic cost and that every result includes a basis and pricing version. |
| 1028 | B2 | Confirm old logs retain their historical pricing versions. |
| 1029 | B2 | Confirm pricing files include `retrieved_at` and validate against the schema. |
| 1062 | B3 | Confirm deterministic generation and a separate ground-truth file. |
| 1063 | B3 | Confirm hard negatives exist for all seven rules. |
| 1064 | B3 | Commit the `small` fixture and validate it against the contract schema. |
| 1065 | B3 | Establish the `b3-frozen` tag before any rule code is written. |
| 1104 | B4 | Confirm reruns replace issues atomically and never leave partial state. |
| 1105 | B4 | Pass Tier 1 rule unit and hard-negative tests. |
| 1106 | B4 | Evaluate and report synthetic precision/recall per rule. |
| 1107 | B4 | Keep spend and reliability totals separate in storage. |
| 1130 | B5 | Confirm all seven rules share one interface and honor settings thresholds. |
| 1131 | B5 | Confirm Tier 3 is gated and always includes confidence. |
| 1132 | B5 | Evaluate and report synthetic precision/recall per rule. |
| 1156 | B6 | Pass backend drift check against `contract/openapi.yaml`. |
| 1157 | B6 | Pass isolation and gating tests. |
| 1158 | B6 | Confirm each response shape equals its corresponding fixture shape. |
| 1181 | B7 | Confirm the proxy can talk to the mock upstream in-process, without a network. |
| 1182 | B7 | Verify streaming, errors, and latency injection. |
| 1183 | B7 | Verify the mock upstream is unreachable from outside the process. |
| 1215 | B8 | Confirm a proxy request returns exactly what the upstream returned. |
| 1216 | B8 | Confirm a metadata-only row appears in about two seconds, off the request path. |
| 1217 | B8 | Pass redaction and no-body-sentinel tests. |
| 1218 | B8 | Confirm auth fails closed and logging fails open. |
| 1242 | B9 | Confirm clients receive chunks as they arrive, without buffering. |
| 1243 | B9 | Use final-chunk usage when available; otherwise estimate and label it. |
| 1244 | B9 | Confirm disconnects do not leak a connection and are still logged. |
| 1267 | B10 | Confirm no `/v1` route works without a valid token. |
| 1268 | B10 | Verify ingest-key create/list/use/revoke lifecycle and that plaintext cannot be retrieved again. |
| 1269 | B10 | Pass isolation tests for every endpoint. |
| 1296 | B11 | Confirm fuzz redaction finds no secret leak on any code path. |
| 1297 | B11 | Measure proxy overhead and update the F1 FAQ figure from that measurement. |
| 1298 | B11 | Verify retention/cap and DB-size budget over a seven-day synthetic-traffic soak. |
| 1299 | B11 | Confirm CI blocks secrets, vulnerable dependencies, and contract drift. |

### Integration

| Plan line | Module | Unchecked acceptance item |
|---:|---|---|
| 1327 | I1 | Pass the e2e happy path locally and in CI. |
| 1328 | I1 | Confirm a real signed-in account never sees mock data. |
| 1329 | I1 | Confirm the demo session works with the backend stopped. |
| 1354 | I2 | Keep real and synthetic datasets and reports separate. |
| 1355 | I2 | Have labels committed before the first real evaluation (verified by git history). |
| 1356 | I2 | Show separate synthetic and real accuracy rows with sample sizes in Settings. |
| 1357 | I2 | Add a short analysis of misses and false alarms to `validation/README.md`. |
| 1383 | I3 | Pass a production smoke test. |
| 1384 | I3 | Verify keep-alive and the DB-size alert in operation. |
| 1385 | I3 | Verify no secret is in the repo, Vercel public variables, or logs. |
| 1386 | I3 | Confirm the always-on API upgrade path is a one-line `render.yaml` change. |

### Appendix A — Definition of done

| Plan line | Unchecked module-wide gate |
|---:|---|
| 1782 | The module's done-when list is fully checked in its PR description. |
| 1783 | Module tests are written and green; lint, types, and formatting are clean. |
| 1784 | `check-contract` is green (fixtures valid, no drift, generated types fresh). |
| 1785 | Gitleaks is green for code, fixtures, logs, and screenshots. |
| 1786 | §4B security rules hold; redaction and no-body tests pass. |
| 1787 | New pages are axe-clean, visibly focused, and keyboard operable. |
| 1788 | Touched README, `docs/DEPLOY.md`, and contract README documentation is updated. |
| 1789 | A module builds and tests without importing the other side's code. |

## Manual and external preconditions

These are not marked complete. The current process had no exported values for `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `DATABASE_URL`, `OPENAI_API_KEY`, `STRIPE_SECRET_KEY`, `VERCEL_TOKEN`, or `RENDER_API_KEY`. Only variable presence was checked; secret values and `.env` files were not read, and external dashboards were not accessed.

| Checklist item(s) | Blocker / boundary | Local work that remains possible |
|---|---|---|
| F2 line 752; B1 line 985 (dev Supabase portion); I1 line 1328 | Requires access to the user's Supabase project, configured email/Google OAuth providers, and a real account/session. Those credentials and provider setup are not available in the current process. The Docker half of B1 line 985 is separate and can be verified locally if Docker is available. | Continue mock-auth, local migration, UI, and other non-provider checks; leave only the external proof unchecked. |
| F6 line 877 | Explicit human-timed check on the specific 5,000-row demo dataset; no timer/data proof was produced in this inventory. This is a local manual check, not an external-credential blocker. | Confirm dataset availability and perform the timed check when F6 is exercised; record the measured result. |
| B3 line 1065 | `git tag --list b3-frozen` returned no tag. This is a sequencing/baseline decision, not an external access issue. The worktree was already dirty, so coordinate the intended baseline before creating the tag; do not capture or discard the existing edits accidentally. | Choose and document the frozen baseline before rule implementation. |
| B11 line 1298 | The acceptance condition requires an actual seven-day soak. It cannot be honestly verified in a shorter run; no soak evidence exists in this inventory. | Run synthetic load and shorter diagnostics as interim evidence, but retain the checkbox until the seven-day window and DB-size budget are verified. |
| I2 lines 1354–1357 | Real-traffic evaluation requires an authorized real-user/production dataset, labels, and an evaluation run; none is provided here. Real-data rows and miss/false-alarm analysis cannot be fabricated from synthetic data. | Complete synthetic evaluation and ensure dataset/report separation; leave real-data claims unchecked until data and labels are authorized and available. |
| I3 lines 1383–1385 | Production smoke, operating keep-alive/DB alert, and Vercel-variable/log checks require production/service access. No Vercel or Render access token was exported to this process. Line 1385's repository scan can be performed locally, but its Vercel/log portions remain unverified. | Inspect repo configuration and run local safety checks; do not claim production status from local checks. |
| Appendix A line 1782 | Requires a module PR description and a completed module checklist; no PR was created or examined for this inventory. | Revisit at module handoff/PR time. |

No evidence was gathered here to determine whether the remaining local implementation/test criteria already pass. In particular, CI, application endpoints, production services, live provider accounts, the 5,000-row timed search, or the seven-day soak were not run as part of this inventory.

## Worktree and plan handling

`git status --short` showed pre-existing edits in the web app and `docs/PLAN.md`, plus other untracked paths. None were modified by this task. The frozen tag query was empty; current `HEAD` was `025721f`. The plan was read only.

## Upstream Artifacts Consumed

- None — no dependency artifacts provided.

## Evidence Mapping

- None — no dependency artifacts provided.

## Validation

- Method: scanned unchecked markdown checkbox rows in `docs/PLAN.md`, retaining section headings and line numbers.
- Result: 65 unchecked rows; grouped counts are 8 frontend, 38 backend, 11 integration, and 8 Appendix A.
- Environment check: checked only whether the listed variables were present in the process environment; no credential values were read.
- Tests: not run; this is a documentation-only inventory, not an implementation task.
