## [t3] Created dependency-ordered checklist execution and verification plan
- Codebase/domain discoveries: current checklist has 60 unchecked rows; F1 and several auth/proxy/demo rows are already checked. Current web uses `/v1` and backend `get_current_user` verifies JWTs; t2’s final summary contains stale statements contradicted by later artifacts and source.
- Wrong assumptions and corrections: the prior checklist inventory is no longer the current count (65 then vs 60 now); current checklist and checked rows were rescanned. No `overview.demo.json` exists in the repository.
- Debugging dead-ends and what actually worked: `Get-Date -AsUTC` is unavailable in this PowerShell version; `[DateTime]::UtcNow` produced the UTC task start timestamp.
- Techniques/patterns worth reusing: map each checklist criterion to one plan/task/evidence ID; keep provider, production, real-data, human-timed, seven-day, and PR gates distinct from locally verifiable work.
- Learnings consumed: (none)

## [t3 re-run] Reconciled checklist plan with corrected architecture evidence
- Codebase/domain discoveries: `t2.5-architect.md` reconciles the `/v1`/`/proxy`, JWT, DTO, and detection-status evidence and reports PASS with 0 HIGH/CRITICAL; the previous planning HIGH is resolved. Current `docs/PLAN.md` still has 60 unchecked rows, mapped 1:1 to 29 bounded tasks.
- Wrong assumptions and corrections: treat older route/auth mismatch statements in t2 as historical, not current blockers; retain real Supabase/OAuth, hosted CI, PostgreSQL-only, ingest-key lifecycle, broad isolation, production, and other explicit acceptance gates.
- Debugging dead-ends and what actually worked: compare source checklist counts with the existing traceability checkpoint (F=8, B=34, I=10, Appendix A=8) before reusing the plan mapping; this confirmed the criteria map remains valid.
- Techniques/patterns worth reusing: record the upstream correction and the evidence boundary in the plan/index; avoid changing the checklist or unrelated dirty artifacts during planning-only reruns.
- Learnings consumed: [teamlead/checklist-evidence-gates]
