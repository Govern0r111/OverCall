# Logs Row Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the metadata row visible in short Logs results while preserving the virtualized large-list behavior.

**Architecture:** Keep the existing Logs table and metadata detail panel. Render its header in normal flow for non-virtualized results; apply sticky positioning only when the results viewport is vertically scrollable for virtualization.

**Tech Stack:** React, TypeScript, Tailwind CSS, Vitest, React Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-20-logs-row-visibility-design.md`

## Global Constraints

- Keep the Logs page metadata-only; do not display prompt or response bodies.
- Keep virtualization for result counts greater than 500.
- Keep filtering, pagination, and the metadata detail panel unchanged.

## Review Focus

- One-row result: header must not overlap the row; pin the normal-flow header and visible endpoint in the short-list test.
- 500-row boundary: results at the cutoff must remain non-virtualized; add a threshold test for the normal-flow header.
- 501-row result: virtualization must retain a sticky `top-0` header; pin this in the existing large-list test.
- Empty results: keep the current empty state; add an empty-results assertion.
- Mobile results: keep the mobile list unaffected; assert the endpoint remains in the mobile results markup.

---

### Task 1: Correct Logs header positioning

**Files:**
- Modify: `apps/web/src/pages/Logs.tsx`
- Test: `apps/web/src/pages/Logs.test.tsx`

**Interfaces:**
- Consumes: `LogEntry[]` from the existing `useLogs` query.
- Produces: The same Logs UI and data behavior, with sticky header positioning limited to virtualized results.

- [ ] **Step 1: Add a failing short-list test**

Add a test named `uses a normal-flow header for short result lists`. Render one `sampleLog`; assert the desktop table header does not have sticky positioning, the endpoint remains rendered in both desktop and mobile results, and the empty state is absent. Add a separate test that 500 results still use a normal-flow header, and an empty-results test that checks the existing empty-state copy.

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `Set-Location apps\web; yarn test src\pages\Logs.test.tsx`
Expected: The new header-position assertion fails because the current short-list header has `sticky top-14`.

- [ ] **Step 3: Make header positioning conditional**

In `apps/web/src/pages/Logs.tsx`, apply `sticky top-0` only when `virtualized` is true. Keep the existing border, background, and text styles for both branches.

- [ ] **Step 4: Verify both short and virtualized behavior**

Extend the existing virtualized-list test to assert the header remains sticky at `top-0`; rerun `Set-Location apps\web; yarn test src\pages\Logs.test.tsx`.
Expected: The focused Logs tests pass for empty, short, threshold, and 5,000-row virtualized results.
