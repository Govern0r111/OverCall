# Deployment

The repository is a monorepo: the FastAPI service is in `apps/api`, the Vite SPA is in
`apps/web`, and the database migrations are in `supabase/migrations`. Do not use the former
`backend/` or `frontend/` paths.

## Local verification

Start the development PostgreSQL service from the repository root:

```sh
docker compose -f docker-compose.dev.yml up -d --wait postgres
```

In a terminal for the API, create/activate its virtual environment, install the package, and
start the service from `apps/api`:

```sh
python -m venv .venv
# POSIX: . .venv/bin/activate
# PowerShell: .\.venv\Scripts\Activate.ps1
python -m pip install .
python -m uvicorn overcall.main:app --host 127.0.0.1 --port 8000
```

In a separate terminal, install and start the web app from `apps/web`:

```sh
npm ci
npm run dev
```

The API liveness route is `GET /healthz`; readiness at `GET /readyz` also checks the configured
database connection. The Vite build writes static assets to `apps/web/dist`:

```sh
# from apps/web
npm run build
```

## Render API

Create or update the Render service from the repository-root `render.yaml` Blueprint. The
manifest sets `rootDir: apps/api`, installs the package and its pinned dependencies from
`pyproject.toml`, warms both tiktoken encodings during the build, starts `overcall.main:app`, and
uses `/healthz` for the platform health check. It pins the service runtime to Python `3.11.15`,
matching the local API virtual environment.

Set these values in Render's environment settings; do not commit their values:

| Variable | Required configuration |
|---|---|
| `DATABASE_URL` | Supabase transaction-pooler URL |
| `SUPABASE_URL` | The selected Supabase project URL |
| `INGEST_KEY_PEPPER` | Random secret of at least 32 characters |
| `INTERNAL_TOKEN` | Random secret of at least 32 characters |
| `CORS_ORIGINS` | Exact deployed frontend origin(s), comma-separated; never `*` |
| `PUBLIC_PROXY_BASE_URL` | Public API origin |
| `ALLOW_REAL_UPSTREAM` | Set only after the production provider/traffic decision is authorized |
| `TIKTOKEN_CACHE_DIR` | Leave as `.tiktoken` so build-warmed encodings are reused at runtime |

`APP_ENV=production` and `PYTHON_VERSION=3.11.15` are non-secret Blueprint values. The current
API verifies Supabase signing keys using the configured project issuer; do not add the legacy
service-role key merely because it appeared in an older deployment manifest.

The API remains on Render's free plan by default. When an authorized operator approves the
always-on upgrade, change only `plan: free` to `plan: starter` in `render.yaml`; no application
code or other manifest setting needs to change.

## Vercel web app

Import `Govern0r111/OverCall` into Vercel and configure the project as follows:

- Set **Root Directory** to `apps/web`.
- Keep the checked-in [`vercel.json`](../apps/web/vercel.json) build and output configuration:
  it runs `npm ci` and `npm run build`, serves `dist`, rewrites SPA routes to `index.html`, and
  adds baseline browser security headers. Use the Vite preset and do not override these settings.
- Set **Production Branch** to `main`.
- Enable Preview deployments for pull requests.

`apps/web/.npmrc` enables the existing lockfile's legacy peer resolution (React Day Picker 8
declares a date-fns peer range that excludes the locked v4 version).

### Preview environment

Set `VITE_AUTH_MODE=mock` for the Vercel Preview environment. Do not configure production
`VITE_BACKEND_URL`, `VITE_SUPABASE_URL`, or `VITE_SUPABASE_ANON_KEY` values for Preview; these
deployments are for UI/demo verification and must not connect to production services.

### Production environment

Set these Vercel project environment variables for the Production environment:

| Variable | Purpose |
|---|---|
| `VITE_SITE_URL` | Exact Vercel Production origin, such as `https://<project>.vercel.app` |
| `VITE_BACKEND_URL` | Public Render API origin |
| `VITE_AUTH_MODE` | `supabase` for a configured real-auth deployment |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase public/anonymous key only |

All `VITE_*` values are exposed in the browser bundle. The Supabase anon key is intended to be
public; never put a service-role key, Vercel token, or any other server-only credential in a
`VITE_*` variable.

To enable Google sign-in, set `VITE_AUTH_MODE=supabase` and configure the Supabase URL and
anonymous key above. Create a Google OAuth client in Google Cloud, then enable Google under
Supabase **Authentication → Providers** and enter that client's ID and secret. Add the Supabase
OAuth callback URL shown in the provider setup to the Google OAuth client's authorized redirect
URIs. In Supabase **Authentication → URL Configuration**, allow the app callback URL
`https://<your-app-domain>/auth/callback` and, for local development, the exact origin in use:
`http://localhost:5173/auth/callback` or `http://127.0.0.1:5173/auth/callback`. Google
sign-in uses the Supabase OAuth flow and returns to `/auth/callback`; it is unavailable in
demo auth mode.

The Content Security Policy is intentionally not hardcoded here: its `connect-src` allowlist
must match the actual API and Supabase origins selected for the deployment. Set and verify that
policy once those origins are known; do not use a broad `https:` allowlist as a substitute.

### Production gates and origin wiring

Protect `main` with a GitHub branch ruleset that requires pull requests, restricts
direct updates, and requires all of these status checks:

- `API CI / api`
- `API CI / web`
- `API CI / secrets`
- `Real-stack E2E / real-stack`

Leave the ruleset bypass list empty so no actor can bypass the required checks. Both workflows
run for every push and pull request targeting this branch, including documentation-only changes.

After Vercel assigns the Production hostname, use that exact origin in `VITE_SITE_URL` and add it
to Render's `CORS_ORIGINS`. In Supabase **Authentication → URL Configuration**, set the Site URL
to the Production origin and allow the Production callback URL
`https://<project>.vercel.app/auth/callback` under Redirect URLs. Keep only the intended local
development and deployed origins in those allowlists.

### Deployment verification

Before treating the frontend deployment as verified:

1. Open a pull request and confirm its Vercel Preview build succeeds and uses mock/demo behavior
   without production API or Supabase access.
2. Confirm the Production deployment comes from the protected `main` branch.
3. Open a nested application route directly and refresh it to verify SPA deep-link routing.
4. Sign in through Supabase and confirm the signed-in Production dashboard has no demo labels.
5. Confirm live API-backed dashboard requests succeed from the Production origin.

## Operational gates

Repository configuration is not evidence that a hosted service is deployed or correctly
configured. Production smoke tests, keep-alive and database-size alert behavior, production
environment values, live logs, OAuth/provider setup, and secret exposure in hosted systems
require authorized Render/Vercel/Supabase access. The current repository does not include a
keep-alive workflow; these operational checks remain open until the workflow is configured and
verified.
