# Production dashboard and authentication design

**Status:** Implemented — local validation passed; Supabase/Google OAuth round-trip remains to be verified  
**Scope:** Signed-in app shell, Overview, login/signup, profile, and demo/live data boundaries

## Intent

Make Overcall feel reliable and production-ready after sign-in. A new real account should see a calm, complete dashboard that explains the next step without synthetic metrics or an indefinite loading screen. Demo traffic should appear only in an explicitly selected demo session.

## Goals

- Replace the current duplicated light/dark palette with one coherent semantic token system shared by the public site and the signed-in app.
- Keep the dashboard structure visible while real data loads or is absent. Use honest placeholders for unknown metrics, a useful no-traffic state, and actionable recovery when requests fail.
- Add a Profile route reachable from workspace navigation.
- Restyle login/signup with the existing shadcn/Radix components and keep Google and email authentication clear and focused.
- Keep synthetic data and controls within local/mock demo mode. Real authenticated accounts must not create or see synthetic request data.
- Preserve existing routes, real Supabase authentication, provider setup, real traffic, settings, and accessibility behavior.

## Non-goals

- Rebuild the public marketing site or every investigation page beyond applying the shared palette and correcting their loading/error treatment where required for consistency.
- Add public production demo accounts, editable profile names/avatars, billing, teams, or a new backend profile schema.
- Change proxy behavior, detection rules, pricing calculations, or how genuine production request data is stored.
- Delete historical synthetic records from a real user's database. The application will stop creating them for real users and exclude them from real-user views.
- Replace React, Vite, Tailwind, shadcn/ui, Radix, or the existing API.

## Approaches considered

1. **Production boundary in the existing application — selected as the safe default.** Keep demo mode only in the local/mock auth flow. Hide demo actions in Supabase mode, reject synthetic writes through the real API, and make customer-facing API reads select proxy/live data. Keep the existing app and shadcn components, improve its shared tokens, and build persistent dashboard, login, and profile states in place. This directly meets the request without exposing a shared demo tenant or making production data ambiguous.
2. **Separate public production demo workspace — deferred.** Keep an “Explore demo” experience on the live site, but give it isolated credentials/data and its own explicit route. This is valuable if public product exploration is required, but needs a dedicated isolation design and operational ownership; it must not be approximated by inserting synthetic rows into a real account.
3. **Visual-only redesign — rejected.** It would leave the current demo controls available to real users and leave missing/error responses looking like a permanent loading screen.

## Experience and behavior

### Color system

- Use the existing CSS custom-property and Tailwind/shadcn setup.
- Define one semantic palette for page background, surface, elevated surface, border, foreground, muted text, primary action, and status colors. Map both `tokens.css` and `globals.css` to the same roles so public and app routes cannot drift.
- Use a cool neutral base with a clear indigo/blue primary; reserve green, amber, and red for positive, warning, and critical states. Tune dark mode as its own deep slate palette rather than reversing light values.
- Keep status labels/icons alongside their colors, and verify text and control contrast in both themes.

### Signed-in dashboard and loading/error states

- Render the Overview frame immediately: its heading, metric cards, trend panel, issue section, and connection status remain visible before data arrives.
- Show an em dash and a short “Waiting for first traffic” explanation for metrics with no real measurements. Do not invent zero-valued business metrics or show synthetic data as a placeholder.
- For a valid empty API response, show a focused no-traffic state with one primary action to configure a provider and a secondary explanation of how real traffic arrives. Hide demo-loading actions for Supabase users.
- During a request, keep the page layout stable and use small in-context progress text rather than replacing the view with the current large page skeleton.
- On request failure, show a recoverable error with a retry action. Never leave a skeleton in place after a query has failed.
- Apply the same explicit loading/empty/error distinction to Settings and the main Issues, Logs, and Providers views where the current shared skeleton can otherwise obscure an error.

### Demo and live data separation

- In mock/demo mode, keep the explicit demo entry and the existing MSW-backed sample experience.
- In Supabase mode, do not treat a stale local demo session as authenticated; do not show “Continue as demo,” “Load demo data,” or synthetic-data settings.
- Clear or scope tenant-sensitive query cache when the authenticated identity or demo/live mode changes so a cached demo response cannot flash for a real account.
- The real API's customer-facing Overview, issues, logs, facets, provider counts/status, and related summary views read proxy/live data only. Synthetic rows are not deleted, but they are excluded from those views.
- Source filtering fails closed: include only request rows explicitly marked `source="proxy"` and issues/runs explicitly marked `is_demo_data=false`; missing or unknown markers never become live data. The current schema already marks these columns non-null.
- The real API does not accept synthetic-data creation from a real authenticated account. Demo API handlers remain available to the isolated local mock flow.
- Real traffic remains visible normally and takes precedence over no-data placeholders as soon as the API returns it.

### Authentication and Profile

- Keep login/signup in the existing component stack. Use a focused shadcn card with Google sign-in, a clear email/password form, visible validation, and simple links to reset password or create an account.
- In Supabase mode, remove demo wording and demo actions from login/signup. In mock mode, label the demo path explicitly.
- Add `/app/profile` and a Profile navigation item. The first version shows the signed-in email and the available account/security actions (including reset password and sign out); it does not offer name/avatar editing without a real profile model.
- Reuse the current Supabase OAuth callback, safe redirect handling, password reset flow, and sign-out behavior.

## Constraints and implementation calls

- This change intentionally supersedes the earlier UI design's “demo as a secondary option in an empty signed-in dashboard” decision.
- The repository already has `is_demo_data`/source fields and a mock-service-worker demo session. Use those mechanisms rather than introducing a second demo model.
- The repository has no root `AGENTS.md`, `CONTRIBUTING.md`, or `CODING_STANDARDS.md`; the current UI design document and `.agents/skills/` provide project guidance.
- No migration or destructive cleanup is expected. If a data-source filter cannot be applied without changing a public contract, keep the contract stable and filter at repository/query boundaries.
- The app uses `@tanstack/react-query`; expose its loading, error, and refetch states rather than adding a second fetch mechanism.
- Profile scope and copy are implementation calls unless the builder finds an auth/API limitation that changes this behavior.

## Acceptance criteria

- Light and dark themes use one shared, semantic palette across public and signed-in UI; both are checked for text and control contrast.
- An authenticated user with no real requests sees the complete dashboard structure, honest placeholders, and a provider setup path instead of demo metrics or an empty screen.
- Loading is visibly distinct from empty and failed; a failed Overview or Settings request can be retried and does not display a permanent skeleton.
- Supabase login never starts or displays demo data. Demo controls and sample data remain available only in the mock/demo session.
- Real API reads do not surface synthetic rows or synthetic benchmark values to Supabase users, and the real API rejects new synthetic data writes.
- Profile is reachable from the signed-in navigation, displays the current account email, and links to supported account actions.
- Login/signup continue to support Google and email auth, show useful inline errors, and do not expose demo entry in Supabase mode.
- Existing tests pass; targeted tests cover real-vs-demo visibility, empty/loading/error dashboard states, Profile routing, and auth form mode behavior.
- Validate both themes and representative narrow/desktop layouts, plus keyboard and screen-reader access for the login and Profile paths.

## Validation plan

- Add unit/component tests for live-only demo gating, dashboard no-data/loading/error states, and Profile content/navigation.
- Add or update API tests for source filtering and rejection of demo writes for real auth.
- Run the frontend test suite, API tests covering changed routes/repositories, design checks, lint, type-check/build, and relevant Playwright flows.
- Inspect the real rendered app in light and dark themes, including a real empty API response and a failed API request.

## Validation results

- API: `python -m pytest apps/api/tests -q` — 219 passed, 8 skipped, 3 dependency deprecation warnings.
- Frontend: `yarn --cwd apps/web test` — 26 files and 113 tests passed. `typecheck`, `build`, `lint`, and `check:design` passed. The build still reports existing dependency annotation and large-chunk warnings.
- Browser: `yarn --cwd apps/web test:e2e` — 22 passed, including Profile navigation/sign-out, empty and populated dashboard flows, API error recovery, keyboard skip navigation, light/dark axe checks, and responsive checks from 320px to desktop.
- Theme: automated token and contrast checks pass for light and dark text, control, status, and focus pairs. The browser suite found no axe violations on tested routes.
- The E2E server uses the checked-in `.env.test` mock-auth configuration and a separate port, so it remains isolated from developer Supabase credentials in `.env.local`.
- Not verified: a live Supabase password login or Google OAuth round-trip against the hosted project. Those require the configured Supabase and Google provider credentials and redirect allow-list.
