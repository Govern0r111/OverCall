# t15 — Verify SSE pass-through and disconnect handling

## Result

Implemented response-content-type detection for SSE, raw-byte streaming through `StreamingResponse`, no-buffering response headers, and final log/connection cleanup for normal completion, client disconnect, and upstream stream failure. Existing non-SSE responses remain fully read and returned as before. The endpoint tests confirm chunks are sent before the upstream yields the next chunk and that disconnects close the upstream and persist an error-coded metadata row.

The B9 usage criterion remains open: streamed final-chunk usage parsing and tiktoken estimation are not implemented. Docker was unavailable, so disconnect log persistence was verified with deterministic session doubles rather than PostgreSQL; no Render/proxy buffering or production-provider result is claimed.

## Changes

- `apps/api/overcall/proxy.py`
  - Uses HTTPX's stream context to inspect upstream response headers before deciding whether to stream.
  - Detects `text/event-stream` from the response, forwards `aiter_raw()` chunks unchanged, adds `Cache-Control: no-cache` and `X-Accel-Buffering: no`, and records TTFB, byte count, status, and disconnect/upstream-drop errors.
  - Closes the upstream stream and writes the final metadata log from the generator's `finally` path, including cancellation.
  - Opens a fresh `AsyncSession` for stream-finalization logging when an app engine is present. The project pins FastAPI 0.115.12; FastAPI documents the dependency-cleanup-before-send behavior before 0.118.0 ([release notes](https://github.com/fastapi/fastapi/releases/tag/0.118.0)).
- `apps/api/tests/integration/test_proxy_persistence.py`
  - Added ASGI-boundary tests for incremental delivery, response-header-driven detection, client disconnect, upstream drop, cleanup, and final log fields.
- `docs/PLAN.md`
  - Checked only B9 pass-through and disconnect criteria; usage parsing/estimation remains unchecked with its limitation recorded.

## Upstream Artifacts Consumed

- `.github/modernize/rearchitecture/artifacts/t13-backend.md` — current in-process mock-upstream path and transport context.
- `.github/modernize/rearchitecture/artifacts/t14-backend.md` — metadata persistence, response-boundary verification, and logging-failure behavior.
- `.github/modernize/rearchitecture/artifacts/t2-architect.md#B8/B9 — proxy and SSE` — confirmed that the mounted proxy buffered responses and lacked SSE handling.
- `.github/modernize/rearchitecture/artifacts/t2.5-architect.md#Reconciled claims` — confirmed the current mounted proxy route/auth boundary.
- `.github/modernize/rearchitecture/learnings/backend/proxy-log-background-evidence.md` — used the ASGI send boundary for stream-order evidence.
- `.github/modernize/rearchitecture/learnings/backend/mock-upstream-location.md` and `proxy-ingest-key-verification.md` — retained the in-process upstream and ingest-key auth seams in tests.

## Evidence Mapping

- `docs/PLAN.md#5.2 SSE streaming pass-through` — response `content-type` selects streaming; raw upstream bytes are yielded directly; no-buffering headers are set; finalization closes and logs.
- `docs/PLAN.md#B9 Done when` — `test_proxy_streams_sse_chunks_as_received_and_closes_upstream` observes each body send before the next upstream chunk; `test_proxy_detects_sse_from_response_content_type` checks response-driven selection; disconnect and upstream-drop tests assert stream closure, actual status, partial byte count, error code, and log commit.
- `t14-backend.md#Verification` — the existing metadata-only writer is retained; the streaming path uses a fresh session so it does not depend on a request-scoped session during response transmission.
- FastAPI 0.118.0 official release notes — version-specific basis for not reusing the request-scoped `yield` dependency during streaming: <https://github.com/fastapi/fastapi/releases/tag/0.118.0>.

## Runtime Endpoint Verification

- `POST /proxy/openai/v1/chat/completions` returned `206` in FastAPI `TestClient` with a synthetic upstream byte stream and overridden test session.
- The test observed exact event bytes and per-chunk send order, and exercised response-content-type detection without an SSE `Accept` header.
- This is local ASGI endpoint evidence, not a live-provider or deployment test. No endpoint-contract shell script was present. Docker was unavailable, so no database-backed stream-disconnect write was run.

## Test Results

- Command: `.\.venv\Scripts\python.exe -m pytest -q tests/integration/test_proxy_persistence.py` (from `apps/api`)
- Passed: 15
- Failed: 0
- Skipped: 0
- Failure details: none
- Command: `.venv\Scripts\python.exe -m pytest -q -c <repo>\apps\api\pyproject.toml <repo>\apps\api\tests` (from `%TEMP%`, `PYTHONPATH=<repo>\apps\api`, ambient database/provider/auth variables cleared)
- Passed: 165
- Failed: 0
- Skipped: 8
- Failure details: none
- Environment note: an initial run from `apps/api` loaded the project `.env` and failed two environment-sensitive config/CORS checks; the isolated `%TEMP%` run above cleared ambient service variables and passed. No config/CORS source was changed for this task.
- Ruff check and format check for the two changed Python files: passed.
- `git diff --check`: passed.
- Warnings: existing Starlette `BlockingPortal` and pytest-asyncio fixture-scope deprecation warnings.

## Remaining Boundaries

- B9 final-chunk usage parsing, `response.usage` support, token estimation/labeling, and the tiktoken warm-up workflow remain open; the matching B9 checklist criterion is unchecked.
- Docker daemon unavailable (`docker info` failed); no PostgreSQL-backed disconnect write was run.
- Render/proxy buffering and external provider behavior require deployment/provider access and are not verified here.

## Findings

- HIGH: 0
- CRITICAL: 0
- No new API contract change.
