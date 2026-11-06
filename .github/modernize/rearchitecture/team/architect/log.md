## [t2] Mapped checklist implementation boundaries (pre-remediation)
- The live FastAPI app is a separate SQLModel/PostgreSQL foundation; the pre-existing `/api` analytics and proxy modules are not mounted and still import legacy collection names.
- Browser demo behavior is served by MSW before render, while non-demo requests go to `/api`; this does not prove the planned `/v1` contract or real backend integration.
- Deployment manifests still target the former backend/CRA layout; preserve the dirty worktree and do not infer production readiness from local state.
- No source files or checklist boxes were changed. No runtime tests/build were run for this read-only architecture map.
- Learnings consumed: [(none)]

## [t2] Re-reviewed API implementation boundaries after remediation
- `create_app` now mounts the `/v1` SQLModel-backed API and ingest-key proxy routers; fresh API tests and OpenAPI drift validation pass.
- The browser still calls `/api/*` and `/api/proxy/*`, while the backend exposes `/v1/*` and `/proxy/*`; the JWT dependency is still a fail-closed 401 placeholder pending B10. Keep the end-to-end integration claim open.
- Existing project-level worktree changes were limited to `board.md` and `project-profile.yaml`; they were preserved. No application source or plan checkbox was changed.
- Learnings consumed: [architect/disconnected-api-runtime-boundary]

## [t2] Final re-review after integration remediation
- The router-level `/v1` JWT dependency, separate proxy ingest-key boundary, browser DTO adapters, and database/public detection status mapping are consistent with their current route/schema/contract evidence.
- Fresh verification passed: web unit tests (23), web production build, API suite (96 passed/2 PostgreSQL checks skipped), OpenAPI drift check (17 versioned paths), and `git diff --check`.
- Prior t2.2 browser integration evidence covers the local signed-in `/v1`+proxy flow and persisted `succeeded` status; real Supabase/OAuth and CI acceptance remain open. No source or plan checkbox was changed; the existing dirty board/profile edits were preserved.
- Learnings consumed: [architect/disconnected-api-runtime-boundary]

## [t2.5] Reconciled stale route/auth claims in architecture artifact
- The older route/auth analysis in `artifacts/t2-architect.md` predated t2.2–t2.4: browser `/api` mismatch, JWT placeholder, and DTO mismatch statements were no longer current. Updated the relevant summary, boundary map, B6/B10/I1 rows, findings, and evidence mapping against supplied dependency artifacts and current source.
- Kept local test evidence distinct from external acceptance: local RS256 verifier test, browser test using local HS256 auth stub, mock JWKS, CI, real Supabase/OAuth, PostgreSQL-only API checks, ingest-key lifecycle, and broad isolation are not interchangeable.
- `git diff --check` passed; no source files or `docs/PLAN.md` boxes were changed. Preserved all unrelated worktree changes.
- Learnings consumed: [architect/disconnected-api-runtime-boundary]

## [t2.5 retry] Recorded route/auth reconciliation evidence
- Board marked the expected task artifact missing, so added `artifacts/t2.5-architect.md` after confirming the t2 summary and current source already reflected the verified `/v1`, `/proxy`, DTO, JWT, and detection-status behavior.
- Historical or superseded mismatch/placeholder statements remain clearly bounded; local test auth is not presented as real Supabase/OAuth verification.
- No source files, checklist boxes, or other pre-existing worktree changes were modified.
- Learnings consumed: [architect/disconnected-api-runtime-boundary]
