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

Configure the Vercel project's **Root Directory** as `apps/web` and use the Vite preset. The
project-local `apps/web/vercel.json` runs `npm ci`, `npm run build`, serves `dist`, and rewrites
SPA routes to `index.html`. `apps/web/.npmrc` enables the existing lockfile's legacy peer
resolution (React Day Picker 8 declares a date-fns peer range that excludes the locked v4
version). The same `vercel.json` adds baseline browser security headers.

Set these Vercel project environment variables for each applicable environment:

| Variable | Purpose |
|---|---|
| `VITE_SITE_URL` | Canonical site origin |
| `VITE_BACKEND_URL` | Public Render API origin |
| `VITE_AUTH_MODE` | `supabase` for a configured real-auth deployment |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase public/anonymous key only |

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

## Operational gates

Repository configuration is not evidence that a hosted service is deployed or correctly
configured. Production smoke tests, keep-alive and database-size alert behavior, production
environment values, live logs, OAuth/provider setup, and secret exposure in hosted systems
require authorized Render/Vercel/Supabase access. The current repository does not include a
keep-alive workflow; these operational checks remain open until the workflow is configured and
verified.
