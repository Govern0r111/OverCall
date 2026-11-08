# Overcall whole-site UI/UX redesign

**Status:** Implemented and verified  
**Scope:** Every public, auth, callback, and signed-in route

## Intent

Replace the visual design and page compositions across Overcall so developers can connect API traffic, find waste, and understand what to fix without visual clutter. This is a whole-site redesign, not a series of small polish changes. Preserve working product behavior while making each route feel like part of one clear, modern product.

Use broad cues from focused developer platforms such as HackerRank: strong hierarchy, generous whitespace, direct actions, and guided progress. Do not reproduce any site's exact layout, branding, wording, or assets.

The `.aider-desk` directory mentioned in the request was not present. The repository's applicable design and accessibility guidance is in `.agents/skills/` and will be used throughout implementation.

## Audience and core job

The primary audience is a developer or engineering lead evaluating API usage. Their first visit is about connecting a provider; later visits are about understanding spend, reliability, and the highest-impact issue. The selected default is therefore a balanced experience: show connection status and a clear setup action when traffic is absent, then lead with useful insights when traffic is available.

## Goals

- Make connection state and the next step obvious.
- Help returning users understand spend, reliability, and the most valuable fix at a glance.
- Reduce competing borders, repeated controls, and unnecessary visual weight.
- Use the existing shadcn/ui component set consistently instead of introducing one-off controls.
- Keep detailed investigations available without putting every control on the first screen.
- Make public, authenticated, demo, live-data, empty, loading, and error states feel like one product.
- Replace the visual structure of every route, including the public landing page, auth forms, app shell, dashboard, investigation views, provider setup, settings, and auth callback.
- Preserve keyboard, screen-reader, zoom, reduced-motion, and narrow-screen usability.

## Non-goals

- Changing API behavior, detection rules, pricing calculations, data retention, or provider capabilities.
- Removing the demo, currency selection, theme support, filters, charts, or existing settings.
- Replacing the existing React/Vite/Tailwind/shadcn stack or adding a competing component library.
- Changing route semantics, authentication contracts, privacy claims, or backend behavior.

## Approaches considered

1. **Rebuild the visual layer across existing routes — selected.** Replace page layouts and styling in the current React/shadcn app while retaining routes, state, data contracts, and interactions. This delivers the requested from-scratch visual change without risking a rewrite of working product behavior.
2. **Rewrite the frontend architecture and flows.** Rejected because the user asked for a visual transformation, not a new application stack; it would add migration risk and delay the design work.
3. **Continue incremental polish.** Rejected because small refinements would leave some pages visually unchanged and would not meet the explicitly requested whole-site redesign.

The implementation choice is to rebuild the visual layer in place. Exact component composition, spacing, type scale, and responsive breakpoints remain implementation decisions constrained by the existing design tokens and accessibility guidance.

## Experience direction

### Shared shell

- Keep the existing Overview, Issues, Logs, Providers, and Settings routes, but replace their visual composition.
- Give each view one primary action and a clear heading, description, and status.
- Simplify the desktop sidebar and compact top bar; on mobile, retain a keyboard-operable navigation drawer and prevent utility controls from crowding the page.
- Keep light and dark themes, using the existing semantic tokens and status colors.
- Prefer the existing shadcn/ui components for buttons, inputs, filters, dialogs, cards, and related interactions; tune their variants with the current tokens rather than restyling each instance independently.
- Prefer whitespace and alignment over nested bordered cards. Reserve surfaces for actual grouping, selection, or interaction.

### Overview

- With no real traffic, show the connection state first, one clear action to configure a provider, and demo data as a secondary option.
- With traffic, summarize estimated savings, reliability, and request volume in a compact hierarchy; make the trend and highest-impact issues the primary supporting content.
- Preserve explicit labels for estimated or modelled values and keep savings distinct from reliability impact.
- Retain the demo-data distinction and the existing detection rerun behavior.

### Issues and Logs

- Keep issue severity, provider, impact, and resolution guidance scannable; keep filters easy to identify and clear.
- Preserve URL-backed issue expansion and filters.
- Keep the Logs table and its metadata-only guarantee. On narrow screens, prioritize essential row information and provide access to full metadata without forcing a wide page layout.
- Retain search, time range, filters, pagination, virtualization, and the metadata detail panel.

### Providers and Settings

- Make supported provider setup a short, ordered path: status, proxy endpoint, setup snippet, and credential guidance.
- Keep ingest-key creation, one-time key display, copy, and revoke behavior intact.
- Group technical settings by purpose and make the consequences of toggles and thresholds understandable without repeating help text.

### Landing and authentication

- Carry the same typography, spacing, surfaces, and action hierarchy into public and auth screens.
- Keep the product promise, privacy boundary, and demo path prominent; avoid adding decorative content that competes with the main action.
- Preserve all existing sign-in, signup, reset, and demo flows.
- Present the auth callback and its loading, success, and failure states in the same visual language.

## Visual and interaction constraints

- Use the existing React/TypeScript, Vite, Tailwind, shadcn/ui components under `apps/web/src/components/ui`, Radix primitives, Lucide icons, CSS variables, and Inter/JetBrains Mono fonts. Reuse an existing shadcn component when it fits; add a component in the same project pattern only when there is a real gap.
- Reuse semantic tokens; do not introduce raw component colors or a competing design system.
- Use one clear primary action per view, distinct labels for statuses, and progressive disclosure only when its trigger is visible and keyboard accessible.
- Preserve native links and controls, visible keyboard focus, accessible names, form errors, screen-reader status announcements, and reduced-motion behavior.
- Verify reflow at 320 CSS pixels and 200% zoom, plus representative desktop widths and both themes.

## Acceptance criteria

- Existing route behavior and all current user-facing capabilities remain intact.
- First-time users can identify how to connect a supported provider and can choose demo data without confusion.
- Returning users can identify connection state and the top finding without scanning multiple competing panels.
- Issues, logs, providers, settings, auth, and landing remain usable at narrow widths without horizontal page overflow or clipped actions.
- All interactive controls remain keyboard reachable, have visible focus, and expose an accessible name and state.
- Color is not the only signal for severity, connection status, or estimated values.
- Loading, empty, error, demo, and live states are reviewed—not only the populated desktop view.

## Validation

- Run frontend unit tests, design checks, lint, type-check/build, and the existing browser tests.
- Use browser checks for the landing page and demo application at 320, 390, tablet, and desktop widths; inspect light and dark themes.
- Walk the primary setup and investigation flows with keyboard only and verify accessible names and focus behavior.
- Run the existing accessibility checks and add targeted assertions for any changed behavior.

## Calls left to the implementer

- Choose exact spacing, type scale, component variants, and responsive breakpoints using the existing design tokens and the repository's `.agents/skills/better-*` guidance.
- Keep implementation scoped to the current behavior. Raise any change that would alter route semantics or product capabilities before making it.
