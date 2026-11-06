# Proxy Log Background Evidence

Verify proxy metadata with a real database read-back and an instrumented ASGI response boundary, not TestClient timing alone.

## What Happened

During OverCall task t14, FastAPI `BackgroundTasks` made a post-request database commit, but a normal TestClient only returns after background work completes. The verification therefore used two complementary checks: a disposable PostgreSQL integration test read the committed metadata row and enforced the two-second bound, while a test ASGI wrapper recorded the final response-body send and proved the fake-session commit happened afterward. Request/response sentinels and synthetic credentials were checked against persisted rows and captured logs.

## Takeaway

When verifying a background proxy writer, pair a real persistence/read-back check with event ordering at the ASGI send boundary. Preserve the upstream response exactly; assert that bodies and credentials do not enter logs or metadata rows, rather than expecting the proxy to rewrite upstream content.

## History
- 2026-11-06 (OverCall/t14): initial
