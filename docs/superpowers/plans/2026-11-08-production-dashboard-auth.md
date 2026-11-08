# Production dashboard and authentication implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give real Supabase users a stable, honest, production-ready dashboard and account flow while keeping synthetic data isolated to explicit local/mock demo sessions.

**Architecture:** Reuse the current React/Vite/Tailwind/shadcn frontend and FastAPI API. Filter real API reads to proxy data, disable synthetic writes for authenticated production users, share authenticated session/demo state across the app, and build visible empty/error/loading states on top of existing API response contracts. Unify the existing CSS tokens rather than introducing a new theme library.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind CSS, shadcn/ui/Radix, TanStack Query, Supabase Auth, FastAPI, SQLModel/SQLAlchemy, pytest, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-08-production-dashboard-auth-design.md`

## Global Constraints

- Use the existing React/TypeScript, Vite, Tailwind, shadcn/ui components, Radix primitives, CSS variables, and existing fonts.
- In Supabase mode, real-user views include only rows explicitly marked as proxy/live; exclude synthetic rows and do not delete historical synthetic records.
- Synthetic data controls, demo session behavior, and generated benchmark data are available only in the local/mock demo flow.
- Do not show invented zero-valued business metrics when no live traffic exists; use an honest placeholder and explain the next step.
- Keep loading, empty, and error states distinct; a failed request must not leave a permanent skeleton.
- Preserve Google/email authentication, safe redirects, account isolation, and the existing API contract except for explicit rejection of real-user demo writes and generated benchmark reads.
- Keep keyboard, screen-reader, reduced-motion, narrow-screen, and light/dark theme behavior usable.

## Review Focus

- A real account has both proxy and historical demo rows; only proxy rows may appear in live endpoints. Test: `test_live_endpoints_exclude_synthetic_rows`.
- A stale demo session exists when Supabase auth is selected; it must not authenticate the user or start MSW. Test: `test_supabase_mode_ignores_stale_demo_session`.
- The app switches from a demo identity to a real identity without a full reload; cached demo query data must not flash for the real user. Test: `test_auth_identity_change_clears_tenant_query_cache`.
- The API returns `has_data=false`; the dashboard must render its complete frame with unknown metrics and a provider setup action. Test: `renders_dashboard_frame_without_live_traffic`.
- An initial or background API request fails; show recovery without hiding cached content or leaving a page skeleton. Test: `shows_retry_state_for_overview_error`.

---

### Task 1: Enforce live-only API reads for real accounts

**Files:**
- Modify: `apps/api/overcall/v1_api.py`
- Modify: `apps/api/overcall/api_schemas.py`
- Modify: `apps/api/scripts/export_openapi.py`
- Reuse filters in: `apps/api/overcall/db/repos/request_logs.py`
- Reuse filters in: `apps/api/overcall/db/repos/issues.py`
- Reuse filters in: `apps/api/overcall/db/repos/detection_runs.py`
- Test: `apps/api/tests/contract/test_v1_contract.py`
- Test: `apps/api/tests/unit/test_repositories.py`
- Update generated contract: `contract/openapi.yaml`
- Update response shapes: `contract/fixtures/api/response-shapes.json`

**Interfaces:**
- Consumes: Existing repository filters `RequestLogRepository.list_logs(source=...)`, `IssueRepository.list_issues(is_demo_data=...)`, and `DetectionRunRepository.latest(is_demo_data=...)`.
- Produces: Real `/v1` customer reads and detection runs use only `source="proxy"` logs and `is_demo_data=false` runs/issues; detection preserves historical demo records; `/v1/demo/load` and `/v1/accuracy` return documented 403 error envelopes for authenticated API users. The local MSW demo flow remains unchanged.

- [x] **Step 1: Write a failing contract test for mixed demo/live rows**

Add `test_live_endpoints_exclude_synthetic_rows` and `test_detection_uses_live_rows_and_preserves_demo_history` to `apps/api/tests/contract/test_v1_contract.py`. Seed the same user with a demo run/log/issue and a proxy run/log/issue, then assert `/me`, `/overview`, issue list/detail, logs/list/detail/facets, providers, and latest-run responses contain only live data. Assert a new detection run uses only proxy rows and leaves the historical demo issue/run intact.

- [x] **Step 2: Run the focused contract test and verify it fails**

Run: `python -m pytest apps/api/tests/contract/test_v1_contract.py -k "live_endpoints_exclude_synthetic_rows or detection_uses_live_rows_and_preserves_demo_history" -q`
Expected: FAIL because customer reads include demo-derived values, select a demo run, or detection includes/deletes historical demo data.

- [x] **Step 3: Write failing contract tests for demo-only routes**

Add `test_demo_and_accuracy_routes_are_rejected_for_authenticated_api_users` and `test_demo_only_routes_are_documented_with_forbidden_error_envelopes`. Assert both endpoints return the standard 403 error envelope, the OpenAPI contract advertises the same response, and the runtime route-status expectations are updated.

- [x] **Step 4: Run the focused demo-write test and verify it fails**

Run: `python -m pytest apps/api/tests/contract/test_v1_contract.py -k "demo_and_accuracy_routes_are_rejected" -q`
Expected: FAIL because both endpoints currently serve synthetic content to authenticated API users.

- [x] **Step 5: Apply existing repository source filters at every customer-facing read**

In `v1_api.py`, select `latest(is_demo_data=False)`, request only proxy-source logs, request only non-demo issues, and derive `/me`, provider status/counts, detail lookups, facets, and latest-run responses from live rows. Run detection over proxy-source logs only and delete/rebuild only proxy-derived issues. Exclude unknown source values by selecting only the explicit proxy/live marker.

- [x] **Step 6: Reject synthetic writes through the real API**

Return the standard 403 error envelope from `/v1/demo/load` and `/v1/accuracy` for authenticated API calls. Keep the local mock-service-worker handlers available to the explicit local/mock demo session.

- [x] **Step 7: Regenerate the OpenAPI contract and remove blocked routes from response-shape fixtures**

Run: `python apps/api/scripts/export_openapi.py --format json --output contract/openapi.yaml`
Expected: `contract/openapi.yaml` documents the forbidden error envelopes without stale success-response metadata; `contract/fixtures/api/response-shapes.json` and its shape test no longer expect successful JSON from `/v1/demo/load` or `/v1/accuracy`.

- [x] **Step 8: Run focused repository and contract tests**

Run: `python -m pytest apps/api/tests/contract/test_v1_contract.py apps/api/tests/unit/test_repositories.py -q`
Expected: PASS, including mixed-source isolation, detection preservation, existing tenant isolation, forbidden demo/accuracy routes, and response-shape checks.

### Task 2: Share auth state and isolate demo sessions and cached data

**Files:**
- Modify: `apps/web/src/auth/authClient.ts`
- Modify: `apps/web/src/auth/ProtectedRoute.tsx`
- Create: `apps/web/src/auth/AuthContext.tsx`
- Create: `apps/web/src/auth/ProtectedRoute.test.tsx`
- Modify: `apps/web/src/main.tsx`
- Modify: `apps/web/src/components/Topbar.tsx`
- Modify: `apps/web/src/components/EmptyState.tsx`
- Modify: `apps/web/src/components/settings/DataSection.tsx`
- Modify: `apps/web/src/pages/Settings.tsx`
- Modify: `apps/web/src/pages/AuthPage.tsx`
- Create: `apps/web/src/components/Topbar.test.tsx`
- Create: `apps/web/src/components/EmptyState.test.tsx`
- Create: `apps/web/src/components/settings/DataSection.test.tsx`
- Test: `apps/web/src/auth/authClient.test.ts`
- Test: `apps/web/src/components/Sidebar.test.tsx`
- Test: `apps/web/src/pages/AuthPage.test.tsx`

**Interfaces:**
- Consumes: `AuthUser` from `authClient.ts` and the existing `QueryClient`.
- Produces: `useAppAuth(): { user: AuthUser; isDemo: boolean }` for protected app routes; demo-mode availability and a demo-session predicate that are false in Supabase mode; cache invalidation when user ID or demo/live mode changes.

- [x] **Step 1: Add failing auth tests for stale demo sessions in Supabase mode**

Add `test_supabase_mode_ignores_stale_demo_session` to `authClient.test.ts`, asserting a saved mock session does not satisfy `me()` or `hasDemoSession()` when `VITE_AUTH_MODE=supabase`.

- [x] **Step 2: Run the focused auth tests and verify they fail**

Run: `yarn --cwd apps/web test src/auth/authClient.test.ts`
Expected: FAIL because demo-session lookup currently takes precedence over Supabase mode.

- [x] **Step 3: Make demo session recognition depend on mock auth mode**

Update `authClient.ts` so mock session state cannot authenticate a Supabase-mode user. Start the MSW demo API only for a valid explicit mock/demo session in `main.tsx`.

- [x] **Step 4: Add a failing test for auth identity cache isolation**

In `ProtectedRoute.test.tsx`, add `test_auth_identity_change_clears_tenant_query_cache`, using the actual QueryClient and a protected child. Seed demo query data, switch to a real identity without reloading, and assert the old cached data is removed. Auth-context consumption is exercised through the gated app components.

- [x] **Step 5: Run the cache-isolation test and verify it fails**

Run: `yarn --cwd apps/web test src/auth/ProtectedRoute.test.tsx`
Expected: FAIL because protected app routes do not provide shared auth state or clear QueryClient data when identity changes.

- [x] **Step 6: Add the protected-app auth context and cache isolation**

Create `AuthContext.tsx` with `useAppAuth()`. Provide the authenticated user from `ProtectedRoute`; clear tenant-sensitive TanStack Query data when the user ID or demo/live mode changes, without clearing it for routine token refreshes.

- [x] **Step 7: Add failing tests for demo controls in real mode**

In `Topbar.test.tsx`, `EmptyState.test.tsx`, and `DataSection.test.tsx`, test that the load button/action and synthetic-data controls are absent for a real Supabase user and remain available for an explicit demo user. In `AuthPage.test.tsx`, test that the "Continue as demo" entry point and supporting copy are absent when Supabase auth is configured.

- [x] **Step 8: Gate demo-only controls by the authenticated demo state**

Use `useAppAuth()` in the signed-in shell and affected components. Expose "Continue as demo" only in mock auth mode. Do not expose demo seeding or synthetic benchmark content to a real account.

- [x] **Step 9: Run focused frontend tests**

Run: `yarn --cwd apps/web test src/auth/authClient.test.ts src/auth/ProtectedRoute.test.tsx src/components/Topbar.test.tsx src/components/EmptyState.test.tsx src/components/settings/DataSection.test.tsx src/components/Sidebar.test.tsx src/pages/Overview.test.tsx src/pages/AuthPage.test.tsx`
Expected: PASS, including mode switching, cache isolation, and demo-control visibility.

### Task 3: Keep dashboard content present through empty, loading, and error states

**Files:**
- Modify: `apps/web/src/pages/Overview.tsx`
- Modify: `apps/web/src/pages/Issues.tsx`
- Modify: `apps/web/src/pages/Logs.tsx`
- Modify: `apps/web/src/pages/Providers.tsx`
- Modify: `apps/web/src/pages/Settings.tsx`
- Create: `apps/web/src/components/PageErrorState.tsx`
- Modify: `apps/web/src/components/EmptyState.tsx`
- Modify: `apps/web/src/components/HeroSavings.tsx`
- Modify: `apps/web/src/components/ReliabilityFigure.tsx`
- Modify: `apps/web/src/components/TrendChart.tsx`
- Test: `apps/web/src/pages/Overview.test.tsx`
- Test: `apps/web/src/pages/Issues.test.tsx`
- Test: `apps/web/src/pages/Logs.test.tsx`
- Test: `apps/web/src/pages/Providers.test.tsx`
- Test: add `apps/web/src/pages/Settings.test.tsx`
- Test: add `apps/web/src/components/PageErrorState.test.tsx`

**Interfaces:**
- Consumes: Existing query return values (`data`, `isLoading`, `isError`, `refetch`) and existing API `has_data`.
- Produces: A stable Overview frame with honest unknown values before live measurements, a real no-traffic state, and a reusable retryable page error state.

- [x] **Step 1: Add failing empty-dashboard tests**

Add `renders_dashboard_frame_without_live_traffic` to `Overview.test.tsx`. For `has_data=false`, assert the heading, all metric cards, trend panel, issue section, em-dash values, and provider setup action render; assert no demo values or demo action appear for a real account.

- [x] **Step 2: Run the focused empty-dashboard test and verify it fails**

Run: `yarn --cwd apps/web test src/pages/Overview.test.tsx`
Expected: FAIL because the current empty state hides the dashboard metrics and chart.

- [x] **Step 3: Add a shared retryable page error component and test its behavior**

Create `PageErrorState` with a clear error message, a native retry button, and a callback to refetch the failed query. Test the message and retry callback in `PageErrorState.test.tsx`. Keep existing cached page content visible if a background refetch fails.

- [x] **Step 4: Add failing Overview and page error tests**

Add `shows_retry_state_for_overview_error` to `Overview.test.tsx`. Add initial-error and background-error assertions for Issues, Logs, Providers, and Settings, including retry callbacks and preserved cached content.

- [x] **Step 5: Run the focused page tests and verify the new error assertions fail**

Run: `yarn --cwd apps/web test src/pages/Overview.test.tsx src/pages/Issues.test.tsx src/pages/Logs.test.tsx src/pages/Providers.test.tsx src/pages/Settings.test.tsx`
Expected: FAIL because the current pages either keep a permanent skeleton or do not expose retry actions.

- [x] **Step 6: Render the dashboard frame for empty, initial-loading, and error states**

Update `Overview.tsx` so loading and no-data states keep the complete structure visible. Render `—` rather than invented business metrics until live data exists; use `has_data` to select the provider-setup state. Show retryable errors without replacing the frame.

- [x] **Step 7: Apply loading/error/empty distinctions to other signed-in pages**

Use `PageErrorState` for initial failures on Issues, Logs, Providers, and Settings. Preserve each page's heading and its existing empty result behavior, keeping cached content visible on background errors.

- [x] **Step 8: Run focused page tests**

Run: `yarn --cwd apps/web test src/pages/Overview.test.tsx src/pages/Issues.test.tsx src/pages/Logs.test.tsx src/pages/Providers.test.tsx src/pages/Settings.test.tsx src/components/PageErrorState.test.tsx`
Expected: PASS for empty, initial-loading, initial-error, and background-error states.

### Task 4: Unify and replace the light/dark semantic palette

**Files:**
- Modify: `apps/web/src/styles/tokens.css`
- Modify: `apps/web/src/styles/globals.css`
- Modify: `apps/web/src/lib/theme.test.ts` if token behavior needs coverage

**Interfaces:**
- Consumes: Existing semantic CSS variables and Tailwind mappings in `tailwind.config.js`.
- Produces: One shared light/dark semantic palette for page/surface/border/text/primary/status roles, used by both public and signed-in UI without per-component color literals.

- [x] **Step 1: Record and test the current semantic token roles**

Add or update a focused token check to assert both themes define the same required semantic roles and public/app aliases resolve to the same role values.

- [x] **Step 2: Run the token check and verify it exposes current drift**

Run: `yarn --cwd apps/web test src/lib/theme.test.ts`
Expected: FAIL for inconsistent or missing shared palette roles.

- [x] **Step 3: Replace duplicate theme values with one semantic mapping**

Use a cool neutral base, a clear indigo/blue primary, and distinct green/amber/red status roles. Give dark mode its own deep slate values and tune foreground/background pairs rather than reversing light values. Keep `tokens.css` and `globals.css` aliases consistent.

- [x] **Step 4: Measure required text and control contrast**

Measure the rendered semantic foreground/surface, muted text/surface, primary/button, status text/surface, and focus/control pairs in light and dark mode. Adjust lightness when a required pair fails; do not report unmeasured contrast values.

- [x] **Step 5: Run theme and design checks**

Run: `yarn --cwd apps/web test src/lib/theme.test.ts`
Expected: PASS in both themes.

- [x] **Step 6: Run the design check**

Run: `yarn --cwd apps/web check:design`
Expected: PASS with no raw component color regressions.

### Task 5: Refresh login and add the Profile route

**Files:**
- Modify: `apps/web/src/pages/AuthPage.tsx`
- Modify: `apps/web/src/pages/AuthPage.test.tsx`
- Create: `apps/web/src/pages/Profile.tsx`
- Create: `apps/web/src/pages/Profile.test.tsx`
- Modify: `apps/web/src/components/Sidebar.tsx`
- Modify: `apps/web/src/components/Sidebar.test.tsx`
- Modify: `apps/web/src/router.tsx`
- Modify: `apps/web/e2e/app.spec.ts`

**Interfaces:**
- Consumes: Existing `authClient` methods, `useAppAuth()`, `safeRedirect()`, and the existing shadcn `Card`, `Button`, and `Input` components.
- Produces: A focused login/signup page that shows demo entry only in mock mode, plus `/app/profile` with the signed-in email and supported account/security actions.

- [x] **Step 1: Add failing login tests for production and mock modes**

Update `AuthPage.test.tsx` so Supabase mode has Google/email login with no demo copy or action, while mock mode has an explicitly labeled demo entry. Preserve signup, reset, and inline error assertions.

- [x] **Step 2: Run auth page tests and verify they fail**

Run: `yarn --cwd apps/web test src/pages/AuthPage.test.tsx`
Expected: FAIL because the current login page always shows the demo option and describes a local demo session.

- [x] **Step 3: Restyle login/signup using existing shadcn components**

Build a compact responsive auth card with clear heading, Google sign-in, email/password fields, visible validation, and direct reset/signup links. Keep demo entry out of Supabase mode.

- [x] **Step 4: Add failing Profile route and account tests**

Create `Profile.test.tsx` tests for the authenticated email, password reset link, sign-out action, and a sensible fallback if email is unavailable. Test route registration and active Profile navigation.

- [x] **Step 5: Add the Profile view and route**

Create `/app/profile`, add its navigation link, and use `useAppAuth()` to render account identity and supported actions. Do not add name/avatar editing or a new profile schema.

- [x] **Step 6: Run auth, profile, and navigation tests**

Run: `yarn --cwd apps/web test src/pages/AuthPage.test.tsx src/pages/Profile.test.tsx src/components/Sidebar.test.tsx`
Expected: PASS across Supabase and mock modes.

- [x] **Step 7: Verify the full flow in Playwright**

Run: `yarn --cwd apps/web test:e2e --grep "auth|profile|demo|overview"`
Expected: a real-mode login flow never loads synthetic data, the demo flow remains explicit, Profile is reachable, and the no-traffic Overview remains useful.

### Task 6: Full verification and final report

**Files:**
- Verify: `apps/web` and `apps/api` test/build/design-check commands
- Update: `docs/superpowers/specs/2026-11-08-production-dashboard-auth-design.md` status and validation evidence

**Interfaces:**
- Consumes: Completed Tasks 1–5.
- Produces: Verified production/auth/data-state implementation and an updated design record.

- [x] **Step 1: Run the complete API test suite**

Run: `python -m pytest apps/api/tests -q`
Expected: PASS, including the updated route contract and source-isolation tests.

- [x] **Step 2: Run complete frontend tests, lint, type-check/build, design checks, and E2E**

Run each command separately and confirm each exit status is zero:

```powershell
yarn --cwd apps/web test
yarn --cwd apps/web lint
yarn --cwd apps/web typecheck
yarn --cwd apps/web build
yarn --cwd apps/web check:design
yarn --cwd apps/web test:e2e
```

Expected: all commands pass.

- [x] **Step 3: Inspect rendered light/dark and responsive states**

Check desktop and 320px widths for login, empty Overview, populated Overview, Profile, and API error recovery. Verify keyboard focus and status announcements; record any external OAuth checks blocked by missing provider credentials.

- [x] **Step 4: Update the design document with actual validation results**

Change its status from Draft only after the acceptance criteria are verified. Explicitly record any OAuth round-trip or hosted-service validation that could not be completed.
