# t27 — Reconcile deployment configuration locally

## Summary

Updated the Render and Vercel manifests to match the current `apps/api` FastAPI and `apps/web`
Vite layout. Added deployment documentation and recorded the locally verified free-to-always-on
plan change. Only I3-04 was checked in `docs/PLAN.md`; production-only I3-01..03 remain open.

## Upstream Artifacts Consumed

- `.github/modernize/rearchitecture/artifacts/t4-backend.md` — current API entrypoint, health
  routes, local PostgreSQL verification, and the boundary between local and hosted evidence.
- `.github/modernize/rearchitecture/artifacts/t3-teamlead-plan.md` — Step 10 and T023 acceptance
  criteria, expected deployment paths, and production-access restrictions.

## Evidence Mapping

- `t4-backend.md#Verification Evidence` → `render.yaml` now targets `overcall.main:app` and
  `/healthz`; a direct local `/healthz` probe returned 200. The upstream isolated-Postgres
  evidence also reports `/readyz` returning 200.
- `t4-backend.md#Remaining Blocker` → no Supabase or production service was accessed; hosted
  configuration and production acceptance were not inferred from local results.
- `t3-teamlead-plan.md#Step 10` and `#T023` → aligned Render/Vercel paths, added
  `docs/DEPLOY.md`, and ran local configuration/package/build checks.
- `docs/PLAN.md#I3 Done when` → checked only the one-line `plan: free` → `plan: starter`
  transition after verifying its diff; production smoke, active alert, and hosted secret checks
  remain unchecked.

## Changes

- `render.yaml`: set `rootDir: apps/api`, install from the pinned `pyproject.toml` package,
  launch `overcall.main:app`, use `/healthz`, and pin `PYTHON_VERSION=3.11.15` to the local
  Python 3.11.15 runtime. Added required production settings as dashboard-managed values and
  removed the obsolete service-role-key entry. Kept `plan: free`; only this field changes to
  `starter` for an authorized always-on upgrade.
- `vercel.json` → `apps/web/vercel.json`: place project config under the Vercel Root Directory;
  use the lockfile install, Vite build, `dist`, SPA fallback, and baseline security headers.
- `apps/web/.npmrc`: persist the existing legacy peer-resolution convention so clean `npm ci`
  works with the locked React Day Picker 8 / date-fns 4 versions. No package versions changed.
- `docs/DEPLOY.md` and `README.md`: replace old `backend/` and `frontend/` instructions with the
  current local and deployment paths, environment-variable names, health/readiness behavior,
  and explicit external-access/CSP limitations.
- `docs/PLAN.md`: checked only the locally verified one-line always-on plan transition.

## Test Results

- `npm ci` (clean temporary copy of `apps/web`, using the project `.npmrc`) — exit 0; 944
  packages installed.
- `npm run build` (same clean copy) — exit 0; Vite produced `dist/index.html`.
- `npm test` (same clean copy) — **6 test files; 23 passed, 0 failed, 0 skipped; exit 0**.
- API package build: `python -m pip wheel --no-deps --no-build-isolation --wheel-dir <temp> .`
  from `apps/api` — exit 0.
- API runtime: `python -m uvicorn overcall.main:app --host 127.0.0.1 --port 18127` from a
  temporary working directory; `GET /healthz` returned **200**.
- Render YAML parse/path assertions, Vercel JSON/build/output/rewrite assertions, and simulated
  Render plan diff — pass; the only diff was `plan: free` → `plan: starter`.
- `docker compose -f docker-compose.dev.yml config -q` — exit 0.
- `git diff --check` — exit 0.

### Validation Notes

- An initial workspace `npm ci` failed peer resolution on the existing date-fns/React Day Picker
  mismatch; the documented legacy-peer setting was added. A subsequent in-place install hit
  Windows `EPERM` unlinking the existing esbuild executable, so I did not retry against the
  shared `node_modules`. The exact frozen install, build, and suite all passed in an isolated
  clean copy.
- That clean install reported 34 npm advisories (5 low, 9 moderate, 18 high, 2 critical). No
  audit fix or package changes were made; the dependency scan is reserved for t33.
- Render and Vercel CLIs/hosted credentials were unavailable. Manifests were locally parsed and
  checked, not deployed or validated against a live account.

## Open Gates and Risks

- I3-01..03 remain unchecked: production smoke, keep-alive/DB-size alert operation, and hosted
  environment/log secret review require authorized production access. The repository currently
  has no keep-alive workflow.
- A restrictive Vercel CSP `connect-src` requires the actual API and Supabase origins. The
  config does not invent these values or replace them with a broad `https:` policy.
- The prior plan references `apps/api/scripts/warm_tiktoken.py`, but that script and a declared
  `tiktoken` dependency are absent; no unsupported build step was added.
- No confirmed vulnerability findings were established by this task; the npm advisory counts
  above require the planned dependency scan.

## Documentation References

- Render Blueprint and Python version: https://render.com/docs/blueprint-spec and
  https://render.com/docs/python-version
- Vercel monorepo and project configuration: https://vercel.com/docs/monorepos and
  https://vercel.com/docs/project-configuration/vercel-json
