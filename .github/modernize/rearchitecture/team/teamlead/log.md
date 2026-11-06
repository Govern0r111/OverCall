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

## [stage2-dag] Generated execute-and-validate DAG from t3 plan artifacts
- Codebase/domain discoveries: `project-profile.yaml` sets `grouping_needed: false`; no fanout file exists. The t3 plan covers 60 unchecked criteria in 29 tasks and has distinct local, manual-provider, real-data, production, human-timing, soak, and PR gates.
- Wrong assumptions and corrections: do not treat the whole DAG as only immediately executable code work; preserve blocked gates as explicit tasks and make final conformance report them open. Split T021 (API provenance vs Settings UI) and T026 (retention implementation vs seven-day soak) across role boundaries.
- Debugging dead-ends and what actually worked: context.md and decisions.md are absent; t3 plan itself documents these absences and preserves F/B/I boundaries without inventing topology groups.
- Techniques/patterns worth reusing: Stage 2 IDs continue flat after t3; keep output schema fields, direct dependencies, conditional CVE scan, independent smoke/runtime/security reviews, and final checklist completeness/conformance gate.
- Learnings consumed: [teamlead/checklist-evidence-gates]

## [t7] Determined synthetic baseline disposition
- Codebase/domain discoveries: `b3-frozen` resolves to `3299fef`, whose tagged tree includes `engine.py`, all seven rule modules, synthetic generator/truth/scenario code, synthetic tests, and both small fixtures.
- Wrong assumptions and corrections: the tag exists, but its label does not prove a pre-rule freeze; the tagged snapshot already contains the rule implementation, so B3-04 remains historically unmet.
- Debugging dead-ends and what actually worked: `git tag --list` alone is insufficient; resolve the tag target and inspect its committed tree and rule export list.
- Techniques/patterns worth reusing: do not move/recreate a historical freeze tag or alter source to simulate chronology; document the evidence and request coordinator disposition.
- Learnings consumed: [teamlead/checklist-evidence-gates]
