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
