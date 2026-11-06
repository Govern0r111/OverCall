# Monorepo Deployment Config Roots

Keep the Render Blueprint at repository root with a service `rootDir`, and put Vercel's config in the configured app root.

## What Happened
In OverCall task t27, Render's repository-root `render.yaml` correctly targeted `apps/api` with `rootDir: apps/api`. Vercel's project Root Directory was `apps/web`, so its `vercel.json` was moved into that directory. Official Vercel monorepo guidance configures a project per app directory; static config applies from the app's project root.

## Takeaway
For each deployment platform, distinguish the repository-level infrastructure manifest from the platform project's application root. Keep application-local build output paths relative to that root, and verify rewrites/build output in the root directory the platform will actually deploy.

## History
- 2026-11-06 (OverCall/t27): initial
