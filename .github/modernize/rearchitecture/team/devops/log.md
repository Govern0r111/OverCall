## [t27] Reconciled deployment configuration locally
- Codebase/domain discoveries: the API package is built from `apps/api/pyproject.toml`; its local interpreter is Python 3.11.15 and its health route is `/healthz`. The Vite app and its lockfile are under `apps/web`; Vercel config belongs under the configured project root.
- Wrong assumptions and corrections: the old manifests referenced `backend/`, `frontend/`, `server:app`, CRA output, and a service-role key. The current backend uses the SQLModel/Postgres API and no frontend-visible service-role credential. A clean `npm ci` also needs the existing legacy-peer-resolution convention for the locked date-fns / React Day Picker pair.
- Debugging dead-ends and what actually worked: workspace `npm ci` first exposed a peer-range conflict, then an in-place retry hit Windows `EPERM` on esbuild; using the same manifest, lock, and `.npmrc` in a clean temp copy passed install, build, and tests. Do not retry destructive installs against another worker's shared `node_modules`.
- Techniques/patterns worth reusing: keep Render Blueprint at repository root with `rootDir` set to the API; keep Vercel config inside its configured monorepo app root; pin Render's Python via a fully qualified `PYTHON_VERSION`; prove an upgrade switch with a one-field diff.
- Learnings consumed: [none]

## [t28] Checked production deployment verification gate
- Codebase/domain discoveries: no `.github/workflows/keepalive.yml` or API `/internal/db-size` endpoint is present; only `ci.yml` exists under `.github/workflows`.
- Wrong assumptions and corrections: local manifest validation cannot establish production smoke behavior, hosted environment values, hosted logs, or scheduled alert delivery.
- Debugging dead-ends and what actually worked: Render, Vercel, and Supabase CLIs and matching deployment environment-variable names were unavailable. Limited tracked-file pattern scanning was explicitly treated as non-comprehensive.
- Techniques/patterns worth reusing: leave manual production checklist items open until authorized hosted access is available; verify alert endpoint and auth contract before adding a workflow.
- Learnings consumed: [devops/monorepo-deployment-config-roots]

## [t28.2] Added a safe keep-alive and DB-size workflow
- Codebase/domain discoveries: `/internal/db-size` requires an `Authorization: Bearer` token and returns `bytes`, `limit_bytes`, and `percent`; `INTERNAL_TOKEN` is a server-side setting. The existing health route is `/readyz`.
- Wrong assumptions and corrections: defining a workflow does not verify its GitHub schedule, repository secrets, deployed endpoint behavior, or notification delivery; production checklist items must stay open until run with authorized hosted configuration.
- Debugging dead-ends and what actually worked: the default Python lacked API test dependencies; the existing `apps/api/.venv` provided the needed environment and the five focused endpoint tests passed. Windows `bash.exe` resolves to an unavailable WSL shell, so use `C:\Program Files\Git\bin\bash.exe` for local `bash -n`.
- Techniques/patterns worth reusing: keep the internal token in Actions secret-backed job environment, grant no workflow token permissions, run readiness checks frequently and protected DB-size checks daily, and validate the response schema before alerting.
- Learnings consumed: [devops/db-size-alert-prerequisites]

## [t28] Rechecked production verification after local HIGH remediation
- Codebase/domain discoveries: protected DB-size endpoint and keep-alive workflow now exist locally; GitHub repository access alone does not establish the workflow or secrets are configured remotely.
- Wrong assumptions and corrections: the workflow file is untracked/local and absent from the default branch (`gh workflow list` lists only API CI; keepalive run query returns 404); repository secret listing is empty.
- Debugging dead-ends and what actually worked: focused endpoint pytest and local YAML/shell syntax checks verify local readiness, not deployed behavior; no production URL/credentials were available.
- Techniques/patterns worth reusing: distinguish local remediation status from operational gate status; verify Actions registration and secret names separately, and keep production smoke/alert/log checklist items open until real hosted evidence exists.
- Learnings consumed: [devops/db-size-alert-prerequisites]
