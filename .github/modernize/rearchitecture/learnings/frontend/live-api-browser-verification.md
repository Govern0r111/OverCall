# Live API Browser Verification

Use an isolated local runtime and explicit test-only identity to verify browser API/proxy forwarding without claiming external Supabase authentication.

## What Happened

In OverCall task t2.2, Chromium exercised the real Vite `/v1` and `/proxy` forwarding paths against local FastAPI and PostgreSQL. A local HS256 JWT and stubbed local Supabase `/auth/v1/user` were sufficient to validate protected API and proxy persistence, but did not prove real account or OAuth behavior. A subsequent detection call exposed a backend status/constraint mismatch (`completed` versus `running|succeeded|failed`); after t2.4 changed persistence to `succeeded`, a final browser run verified successful detection and rendering across the signed-in screens.

## Takeaway

Keep local auth fixtures isolated, record them as test-only, and inspect persisted proxy logs in the browser. Do not claim real Supabase integration from this setup. When no detection result exists, wait for the shared `empty-state` rather than a page title. Exercise `/v1/detection/run` separately and assert both the public status and the persisted database enum. When implementing the local Supabase stub, reflect `Access-Control-Request-Headers` in preflight responses; the SDK may request `x-supabase-api-version`.

## History

- 2026-11-06 (`OverCall/t2.2`): initial
- 2026-11-06 (`OverCall/t2.2`): verified successful detection and screen rendering after t2.4; recorded the Supabase CORS preflight-header requirement
- 2026-11-06 (`OverCall/t21`): confirmed mock auth tests and a build do not satisfy the manual real-Supabase email/Google check; require project configuration and provider access before checking it off
