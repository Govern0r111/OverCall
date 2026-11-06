# t21 — Supabase email and Google authentication check

## Status
**BLOCKED — manual real-project verification not performed.** The F2 checklist item remains unchecked.

The repo has a Supabase auth implementation (`authClient.ts` and `supabaseClient.ts`), including email signup/password login and Google OAuth redirect to `/auth/callback`. This is implementation evidence only, not proof of a real Supabase account/provider flow.

## Blocker
- No `apps/web/.env.local` is present; the only checked-in web env file is `.env.example`, which contains placeholder Supabase URL/key values and defaults `VITE_AUTH_MODE=mock`.
- Neither `VITE_SUPABASE_URL` nor `VITE_SUPABASE_ANON_KEY` is set in the process environment.
- The Supabase CLI is unavailable.
- No authorized access to the actual project's Email/Google provider configuration or OAuth redirect setup is available in this environment.

To unblock: provide authorized dev-project configuration/access, confirm the Email and Google providers and local callback URLs, then exercise email signup/confirmation and Google sign-in through the configured project. Do not treat mock-mode tests as satisfying this check.

## Test Results
- `npm test -- src/auth/authClient.test.ts` — passed: 3; failed: 0; skipped: 0. These tests cover the mock auth client only; they do not exercise Supabase.
- `npm run build` — passed.
- Real Supabase email and Google runtime flows — not run; blocked as above.

## Upstream Artifacts Consumed
- none — no dependency artifacts provided

## Evidence Mapping
- none — no dependency artifacts provided
- `docs/PLAN.md` §4A/F2 manual-auth item → blocker recorded beside the unchecked checklist entry; no completion claim.
