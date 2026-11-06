# SQLModel API Persistence Boundary

Do not bridge legacy Mongo-style collection APIs to the SQLModel database by exporting placeholder global collections.

## What Happened

During OverCall task t2.1, the legacy `/api` module and proxy/engine imports expected `issues_col`, `logs_col`, and `runs_col`, but `overcall.db` now contains SQLModel entities and a base repository rather than Mongo-style collection objects. The app factory only registers health/readiness routes. A functional API reconnection therefore needs repository-backed route work and contract alignment, not aliases that merely hide the import error.

## Takeaway

Before mounting a route module, verify its storage operations are implemented by the current persistence layer. Prefer implementing the documented SQLModel repositories and `/v1` contract over reviving legacy global collection semantics.

Keep repository queries tenant-scoped by construction, assign the authenticated user ID on inserts, and flush without committing so route/service transactions control atomicity. Use source-aware repository operations for demo/proxy data and default-off experimental issue reads.

For proxy logging, map metadata into the SQLModel `RequestLog` columns (`occurred_at`, `source`, `origin`, and versioned cost fields), then write through `RequestLogRepository`. Keep the commit in the proxy service/background task, and catch persistence failures so logging remains fail-open without storing request/response bodies or credentials. `CostResult.basis` is already a literal string.

## History

- 2026-11-06 (OverCall/t2.1): initial
- 2026-11-06 (OverCall/t2.1.1): added tenant-scoped repository and transaction-boundary guidance
- 2026-11-06 (OverCall/t2.1.3): added proxy metadata-only, fail-open repository write guidance
