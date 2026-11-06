## [t2.2] Aligned browser API and proxy route URLs
- Codebase/domain discoveries: FastAPI serves the browser API at `/v1` and proxy traffic at `/proxy`; the frontend had `/api` prefixes and several legacy endpoint suffixes. Vite development proxying and demo MSW paths both need to preserve the same route contract.
- Wrong assumptions and corrections: correct URLs alone do not establish end-to-end integration. Backend response schemas remain incompatible with frontend DTOs for overview, issues, logs, settings, providers, and accuracy; keep signed-in integration claims open until a dedicated mapping/contract task.
- Debugging dead-ends and what actually worked: a focused browser run with API port 8000 stopped verified demo requests are intercepted locally; starting FastAPI and Vite together then probing through port 4173 verified real forwarding while protected endpoints failed closed with the expected 401.
- Techniques/patterns worth reusing: share one `/v1` client base across real and demo modes, use exact `/proxy/...` provider roots, and make the development proxy forward both prefixes without rewriting them. Test the proxy through Vite, not only against the backend directly.
- Learnings consumed: [architect/disconnected-api-runtime-boundary]

## [t2.2.1] Aligned frontend wire DTOs and signed-in demo flow
- Codebase/domain discoveries: API Decimal fields are serialized as strings; provider traffic/pricing is nested, issues/logs are enveloped, and accuracy has separate dataset records. Frontend view fields such as source counts and provider issue counts are not all present in the API response.
- Wrong assumptions and corrections: demo-mode mock responses must follow the versioned wire schemas too; retaining legacy UI-shaped payloads would not exercise the same adapters as the real client. A local demo-auth browser pass is not proof of a real Supabase session.
- Debugging dead-ends and what actually worked: Playwright cleanup removed two unchanged tracked screenshots during an initial run; restored them from their unchanged initial state. The final focused and full app E2E suites passed after assertions used contract UUIDs and the keyboard-supported issue expansion path.
- Techniques/patterns worth reusing: keep wire DTOs separate from view models, normalize decimals and renamed/nested fields in `fromApi*` functions at the query boundary, and assert MSW responses use the wire contract.
- Learnings consumed: [frontend/versioned-api-proxy-paths, architect/disconnected-api-runtime-boundary]

## [t2.2] Re-verified browser API/proxy flow after DTO remediation
- Codebase/domain discoveries: with no detection run, `Overview` and `Issues` render the shared `EmptyState` rather than their page headings; the local browser can still exercise the actual `/v1` and `/proxy` Vite forwarding paths against PostgreSQL and the FastAPI app.
- Wrong assumptions and corrections: a local signed JWT plus a stubbed Supabase `/auth/v1/user` endpoint verifies only the browser/API integration seam, not a real Supabase project, account, or OAuth setup. The exercised frontend API and proxy flow passed, but the broader happy path is blocked because `/v1/detection/run` attempts status `completed` while the database constraint only accepts `running|succeeded|failed`.
- Debugging dead-ends and what actually worked: wait for the empty-state test id when the API has no completed detection run; seed an isolated local auth user and ingest key, then drive `/proxy/openai/v1/chat/completions` in Chromium and verify its persisted non-demo log in the actual Logs screen.
- Techniques/patterns worth reusing: for local browser/API checks, use an isolated PostgreSQL Compose project, an ephemeral test-only JWT, and same-origin Vite requests; report auth stubs as local-only and never use this as external-account evidence.
- Learnings consumed: [frontend/versioned-api-proxy-paths, frontend/versioned-api-response-mapping, architect/disconnected-api-runtime-boundary]

## [t2.2] Final browser API/proxy and detection re-verification
- Codebase/domain discoveries: after t2.2.1 DTO adapters and t2.4's persisted `succeeded` transition, actual signed-in Overview, Issues, Providers, Settings, and Logs screens all rendered from the live local API; detection returned public `completed` while PostgreSQL stored `succeeded`.
- Wrong assumptions and corrections: local Supabase-compatible auth is not evidence of real Supabase account/OAuth behavior. The local browser login initially failed because the auth stub omitted a Supabase SDK preflight header; echoing requested CORS headers fixed the test harness without changing app code.
- Debugging dead-ends and what actually worked: use `#auth-password` to avoid a `getByLabel("Password")` ambiguity with the Show password button; validate unauthenticated 401, then sign in through the local stub, exercise same-origin Vite `/v1` and `/proxy`, and inspect persisted DB status/log rows.
- Techniques/patterns worth reusing: assert both public API status and persisted enum separately; load actual screens after browser-backed requests to cover DTO rendering, and keep local auth fixtures/keys isolated and explicitly test-only.
- Learnings consumed: [frontend/live-api-browser-verification, frontend/versioned-api-proxy-paths, frontend/versioned-api-response-mapping]
