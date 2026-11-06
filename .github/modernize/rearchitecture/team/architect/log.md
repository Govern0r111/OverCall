## [t2] Mapped checklist implementation boundaries
- The live FastAPI app is a separate SQLModel/PostgreSQL foundation; the pre-existing `/api` analytics and proxy modules are not mounted and still import legacy collection names.
- Browser demo behavior is served by MSW before render, while non-demo requests go to `/api`; this does not prove the planned `/v1` contract or real backend integration.
- Deployment manifests still target the former backend/CRA layout; preserve the dirty worktree and do not infer production readiness from local state.
- No source files or checklist boxes were changed. No runtime tests/build were run for this read-only architecture map.
- Learnings consumed: [(none)]
