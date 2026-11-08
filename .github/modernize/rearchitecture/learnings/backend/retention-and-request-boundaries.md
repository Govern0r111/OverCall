# Retention and Request Boundaries

Keep incoming body limits pass-through and bounded, and keep retention cleanup database-owned and batched.

## What Happened

During OverCall task t30, global request-body buffering was avoided because it would duplicate up to the configured body limit and could interfere with streaming disconnect handling. A receive-wrapper counts bytes as handlers consume them and rejects oversized declared or streamed bodies. Retention uses one protected SQL function for age purge and per-user/demo row caps; PostgreSQL execution still needs verification in a database-enabled environment.

## Takeaway

Do not pre-buffer request bodies in generic middleware. Count bytes on the receive path, reject beyond the configured cap, and preserve accepted chunks unchanged. Keep cleanup in a `SECURITY DEFINER` function with a fixed search path, bounded deletion batches, and an operator endpoint that authenticates before acquiring a database session. Treat migrations, cron scheduling, and soak/size evidence as separate validation gates.

## History

- 2026-11-06 (OverCall/t30): initial
