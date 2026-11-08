# Proxy SSE Stream Lifecycle

Stream proxy responses from the upstream byte iterator and finalize transport cleanup and metadata logging on every exit path.

## What Happened

In OverCall task t15, the mounted proxy used `client.request()` and buffered `resp.content`, so it could not pass SSE chunks through incrementally or react to client cancellation. The response is now detected by `text/event-stream`, forwarded with `aiter_raw()`, and finalized with upstream close plus a metadata-only log on completion, disconnect, or upstream read error. The pinned FastAPI 0.115.12 cleans up `yield` dependencies before sending a streaming response, so the finalizer opens a fresh session from the app engine instead of depending on the request session.

## Takeaway

Keep the non-SSE buffered path unchanged, but use HTTPX's stream context whenever response headers determine whether to stream. Do not accumulate the SSE body. Count a chunk after its ASGI send resumes so failed sends are not included in the forwarded-byte count. Shield stream finalization from cancellation. Test incremental delivery at the ASGI send boundary, plus client disconnect and upstream drop with response-close and log assertions. For this FastAPI version, use a separate database session in the streaming finalizer.

## History

- 2026-11-06 (OverCall/t15): initial
