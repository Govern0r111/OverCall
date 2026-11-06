## [t3] Created dependency-ordered checklist execution and verification plan
- Codebase/domain discoveries: current checklist has 60 unchecked rows; F1 and several auth/proxy/demo rows are already checked. Current web uses `/v1` and backend `get_current_user` verifies JWTs; t2’s final summary contains stale statements contradicted by later artifacts and source.
- Wrong assumptions and corrections: the prior checklist inventory is no longer the current count (65 then vs 60 now); current checklist and checked rows were rescanned. No `overview.demo.json` exists in the repository.
- Debugging dead-ends and what actually worked: `Get-Date -AsUTC` is unavailable in this PowerShell version; `[DateTime]::UtcNow` produced the UTC task start timestamp.
- Techniques/patterns worth reusing: map each checklist criterion to one plan/task/evidence ID; keep provider, production, real-data, human-timed, seven-day, and PR gates distinct from locally verifiable work.
- Learnings consumed: (none)
