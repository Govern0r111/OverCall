# Protected Internal Operations Endpoint

Operational endpoints should use the dedicated configured internal token, be concealed from unauthenticated callers, and authenticate before opening a database session.

## What Happened

During OverCall task t28.1, the production checklist required a database-size endpoint. The app already required `INTERNAL_TOKEN` in production, but its API used JWT authentication for user routes and ingest-key authentication for proxy traffic. A dedicated internal router now checks a bearer token in constant time, returns 404 for missing/invalid/unconfigured credentials, and excludes the route from OpenAPI. Local PostgreSQL and HTTP probes verified the endpoint without claiming hosted operation.

## Takeaway

Keep operator-only routes separate from user JWT and proxy-key dependencies. Evaluate the internal authorization dependency before the session dependency; expose only sanitized operational results and fail closed when database access is unavailable.

## History

- 2026-11-06 (OverCall/t28.1): initial
