# Frozen Web Install Peer Resolution

Persist npm's required peer-resolution mode in the web app root so clean lockfile installs are reproducible.

## What Happened
In OverCall task t27, a clean `npm ci` initially rejected the existing `date-fns@4` and `react-day-picker@8.10.1` peer combination. The project plan already used `--legacy-peer-deps`; adding `apps/web/.npmrc` with `legacy-peer-deps=true` let `npm ci` complete in an isolated clean copy without changing package versions.

## Takeaway
When a lockfile was produced using legacy peer resolution, make that choice explicit in the app-local `.npmrc` so local, CI, and deployment installs agree. Revisit and remove the setting only when the dependency peer ranges are reconciled.

## History
- 2026-11-06 (OverCall/t27): initial
