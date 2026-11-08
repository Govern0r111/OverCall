# Overcall Whole-Site UI/UX Redesign Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the visual design of every Overcall route with a cohesive, minimal, responsive experience inspired by HackerRank's clarity while preserving product capabilities.

**Architecture:** Keep the existing React routes, auth, and data flows. Rebuild the shared shell and each page composition in the current React/Vite/Tailwind stack, reusing existing shadcn/ui components and semantic tokens.

**Tech Stack:** React, TypeScript, Vite, Tailwind CSS, existing shadcn/ui/Radix components, Lucide icons, Vitest, Playwright.

**Spec:** [2026-11-08-overcall-ui-ux-design.md](../specs/2026-11-08-overcall-ui-ux-design.md)

## Global Constraints

- Preserve the existing Overview, Issues, Logs, Providers, and Settings routes and all current behavior.
- Prefer existing shadcn/ui components under `apps/web/src/components/ui`; add a component in the same project pattern only when there is a real gap.
- Keep light and dark themes, using existing semantic tokens and status colors.
- Keep request/response bodies out of the interface and preserve estimated/modelled value labels.
- Verify reflow at 320 CSS pixels and 200% zoom, plus representative desktop widths and both themes.
- Preserve visible keyboard focus, accessible names, form errors, status announcements, and reduced-motion behavior.

## Review Focus

1. No-data, demo, live-data, loading, and error states — preserve the correct next action and data provenance; pin with page tests.
2. Mobile header, sidebar, filters, and tables at 320–390px — no clipped actions or page-level horizontal overflow; pin with browser checks.
3. Dark/light theme parity — semantic color and status meaning stay consistent; pin with theme tests and browser checks.
4. Keyboard navigation through the mobile drawer, filters, dialogs, and detail panels — controls remain reachable, labeled, and visibly focused; pin with interaction tests.
5. Dense or long metadata such as endpoints and request IDs — retain access to full values without forcing page overflow; pin with Logs detail tests.

---

### Task 1: Rebuild the shared design system and workspace shell

**Files:**
- Modify: `apps/web/src/styles/tokens.css`
- Modify: `apps/web/src/styles/globals.css`
- Modify: `apps/web/src/router.tsx`
- Modify: `apps/web/src/components/Sidebar.tsx`
- Modify: `apps/web/src/components/Topbar.tsx`
- Modify: `apps/web/src/components/PageHeader.tsx`
- Test: `apps/web/src/components/Sidebar.test.tsx`

**Interfaces:**
- Consumes: Existing theme context, route links, `Button`, and `Card`.
- Produces: A new shared visual system and shell used consistently by every signed-in page.

- [x] **Step 1: Write failing shell tests** for the redesigned navigation hierarchy, active route names, theme/currency/demo actions, and mobile menu behavior.
- [x] **Step 2: Run the targeted shell tests** and confirm the new assertions fail for the intended missing/changed behavior.
- [x] **Step 3: Rebuild the shared tokens and shell** using existing Tailwind/shadcn patterns; preserve routes, theme toggle, demo action, currency selection, and issue count.
- [x] **Step 4: Run shell and theme tests** and verify the desktop and mobile shell at 320px, 390px, and desktop width.

### Task 2: Redesign overview and investigation views

**Files:**
- Modify: `apps/web/src/pages/Overview.tsx`
- Modify: `apps/web/src/pages/Issues.tsx`
- Modify: `apps/web/src/pages/Logs.tsx`
- Modify: `apps/web/src/components/EmptyState.tsx`
- Modify: `apps/web/src/components/HeroSavings.tsx`
- Modify: `apps/web/src/components/IssueRow.tsx`
- Modify: `apps/web/src/components/IssueDetail.tsx`
- Modify: `apps/web/src/components/TrendChart.tsx`
- Test: `apps/web/src/pages/Overview.test.tsx`
- Test: `apps/web/src/pages/Issues.test.tsx`
- Test: `apps/web/src/pages/Logs.test.tsx`

**Interfaces:**
- Consumes: Task 1 tokens/shell and existing query/data contracts.
- Produces: New, cohesive Overview, Issues, and Logs page compositions with all existing data and investigation behavior.

- [x] **Step 1: Add failing page assertions** for the new hierarchy, first-run connection action, data/demo labels, issue filters, log filters, and full metadata access.
- [x] **Step 2: Run the targeted page tests** and confirm failures point to the intended UI behavior.
- [x] **Step 3: Rebuild Overview, Issues, and Logs** with existing shadcn components; retain query parameters, filtering, pagination, virtualization, and detail behavior.
- [x] **Step 4: Run page tests** and verify all empty, loading, error, demo, and populated states.

### Task 3: Redesign provider setup and settings

**Files:**
- Modify: `apps/web/src/pages/Providers.tsx`
- Modify: `apps/web/src/pages/Settings.tsx`
- Modify: `apps/web/src/components/settings/SettingsSection.tsx`
- Modify: `apps/web/src/components/settings/RulesSection.tsx`
- Modify: `apps/web/src/components/settings/WindowsSection.tsx`
- Modify: `apps/web/src/components/settings/UpstreamSection.tsx`
- Modify: `apps/web/src/components/settings/DataSection.tsx`
- Modify: `apps/web/src/components/settings/AccuracySection.tsx`
- Test: `apps/web/src/pages/Providers.test.tsx`

**Interfaces:**
- Consumes: Task 1 tokens/shell and existing provider/settings hooks.
- Produces: A clear, new provider setup experience and purpose-grouped settings using shared controls.

- [x] **Step 1: Add failing assertions** for provider status, copy/setup actions, ingest-key dialogs, and rule/settings controls.
- [x] **Step 2: Run the provider tests** and confirm intended behavior is not yet represented.
- [x] **Step 3: Rebuild provider and settings layouts** with existing shadcn `Card`, `Button`, `Input`, `Dialog`, `Tabs`, and `Switch` components; preserve key creation, one-time display, revoke confirmation, and settings semantics.
- [x] **Step 4: Run provider/settings tests** and verify keyboard behavior and narrow-width wrapping.

### Task 4: Redesign landing, authentication, and callback

**Files:**
- Modify: `apps/web/src/features/landing/landing.css`
- Modify: `apps/web/src/features/landing/Nav.tsx`
- Modify: `apps/web/src/features/landing/Hero.tsx`
- Modify: `apps/web/src/features/landing/DashboardPreview.tsx`
- Modify: `apps/web/src/features/landing/HowItWorks.tsx`
- Modify: `apps/web/src/features/landing/WhatWeCatch.tsx`
- Modify: `apps/web/src/features/landing/Faq.tsx`
- Modify: `apps/web/src/pages/AuthPage.tsx`
- Modify: `apps/web/src/pages/AuthCallback.tsx`
- Test: `apps/web/src/features/landing/LandingPage.test.tsx`
- Test: `apps/web/src/pages/AuthPage.test.tsx`

**Interfaces:**
- Consumes: Task 1 semantic tokens and existing auth/navigation behavior.
- Produces: New public, auth, and callback screens aligned with the workspace design, with primary actions preserved.

- [x] **Step 1: Add failing assertions** for theme control accessibility, the primary demo/signup paths, auth validation/error states, and mobile navigation.
- [x] **Step 2: Run the targeted landing/auth tests** and confirm the expected failures.
- [x] **Step 3: Rebuild landing, auth, and callback surfaces** using existing shadcn controls; preserve privacy claims, demo, Google, signup, login, and password reset behavior.
- [x] **Step 4: Run landing/auth tests** and verify both themes and narrow viewports.

### Task 5: Final interface verification

**Files:**
- Verify: `apps/web/src/**`
- Verify: `apps/web/scripts/check-design-rules.mjs`
- Verify: existing Playwright E2E suite

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces: Verified responsive, accessible, production-buildable interface.

- [x] **Step 1: Run `yarn test`, `yarn check:design`, `yarn lint`, and `yarn build`.**
- [x] **Step 2: Run `yarn test:e2e` and exercise setup and investigation flows.**
- [x] **Step 3: Use browser checks** at 320px, 390px, tablet, and desktop widths; inspect light/dark themes, keyboard focus, and no-data/live states.
- [x] **Step 4: Fix any regressions and repeat the failing checks.**

**Validation result:** 75 unit tests and 20 Playwright tests pass; design checks, configured lint, and the production TypeScript/Vite build pass. Browser checks cover public landing, auth forms, and all signed-in routes in light/dark themes at 320, 390, 768, and 1280px. A separate direct ESLint run over page files was blocked by the installed `eslint-plugin-jsx-a11y`/`minimatch` incompatibility; it did not affect the configured lint command or build.
