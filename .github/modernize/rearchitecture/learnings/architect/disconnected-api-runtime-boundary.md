# Disconnected API Runtime Boundary

The current FastAPI health host, legacy collection-backed API modules, and demo-only MSW path are separate runtime boundaries that must be reconciled before API integration claims.

## What Happened

During OverCall task t2, `create_app` exposed health/readiness routes without mounting the API/proxy routers. The legacy routers import collection names that the present SQLModel `overcall.db` package does not export. The browser uses MSW for demo sessions and `/api` for normal requests, while the implementation plan expects `/v1`.

## Takeaway

When checking API integration, trace the actual app factory → router registration → persistence adapter → client URL. A running health endpoint or passing MSW demo flow is not evidence that business endpoints are mounted or that the real browser path works.

## History

- 2026-11-06 (`OverCall/t2`): initial
