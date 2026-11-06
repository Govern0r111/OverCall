# Detection Run Status Boundary

Persist detection completion as `succeeded` to satisfy the database constraint while keeping the public API's established `completed` response.

## What Happened

In OverCall task t2.4, `/v1/detection/run` stored `completed`, but the checked-in `detection_runs` constraint allows only `running`, `succeeded`, and `failed`. The API contract and existing client vocabulary use `completed`, so the backend now translates database statuses at both the run and latest-summary response boundaries. PostgreSQL integration could not run because no `TEST_DATABASE_URL` was configured; TestClient verified the stored ORM value and API mapping.

## Takeaway

Keep persistence lifecycle values aligned with SQL constraints and translate them explicitly at the API boundary when public vocabulary differs. Test the stored value and each externally visible status; report real-database verification separately when the test database is unavailable.

## History

- 2026-11-06 (OverCall/t2.4): initial
