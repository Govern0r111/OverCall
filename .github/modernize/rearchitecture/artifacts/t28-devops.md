# t28 — Production deployment verification gate (post-remediation recheck)

## Summary

The prior HIGH finding is remediated in the local worktree: the protected `/internal/db-size` route and the least-privilege keep-alive workflow now exist, and their local contract/syntax checks pass. The production verification gate itself remains **blocked**: the workflow is not present on GitHub's default branch, no repository Actions secrets are configured, and no production URL or production service credentials are available. All three production-only I3 checks remain unchecked in `docs/PLAN.md`.

## Upstream Artifacts Consumed

- `.github/modernize/rearchitecture/artifacts/t27-devops.md` — local Render/Vercel configuration evidence and the production-vs-local verification boundary.
- `.github/modernize/rearchitecture/artifacts/t28.1-backend.md` — protected endpoint contract and local authentication/database-size verification.
- `.github/modernize/rearchitecture/artifacts/t28.2-devops.md` — local workflow design and its required Actions secrets.

## Evidence Mapping

- `t27-devops.md#Open Gates and Risks` → `docs/PLAN.md#I3 Done when` retains all three production checks as `[ ]`; local manifest checks are not treated as production smoke evidence.
- `t28.1-backend.md#Result` and `#Test Results` → `apps/api/tests/unit/test_internal_api.py` passed all five focused tests, including token rejection, valid size response, and safe database failures.
- `t28.2-devops.md#Workflow Behavior` and `#Remaining Blockers` → `.github/workflows/keepalive.yml` is present locally and its four embedded shell scripts parse; remote checks show the workflow is not registered on the default branch and the repository has no Actions secrets.
- `docs/PLAN.md#I3 Done when` → the production smoke, keep-alive/DB-size alert operation, and hosted secret/log review remain unchecked; the locally verified always-on plan change remains checked.

## Verification Findings

- `GET /internal/db-size` implementation and tests are present locally; the focused endpoint suite passed (5 passed, 0 failed).
- The local `.github/workflows/keepalive.yml` has the documented readiness and protected DB-size jobs, empty workflow permissions, and secret-backed `API_URL` / `INTERNAL_TOKEN`. YAML/job assertions passed and `bash -n` accepted all four embedded scripts. `actionlint` is unavailable.
- GitHub CLI repository read access is available, but `gh workflow list` returns only `API CI`; `gh run list --workflow keepalive.yml` returns HTTP 404 because the workflow is absent on the remote default branch. `gh secret list` returned no repository secret names.
- No local `API_URL`, `INTERNAL_TOKEN`, `RENDER_API_KEY`, `VERCEL_TOKEN`, or `SUPABASE_ACCESS_TOKEN` environment variables are set. No production endpoint was contacted.
- The prior limited repository secret-pattern scan remains non-comprehensive and does not establish the contents of hosted Vercel variables or production logs.

## Checklist Disposition

- Production smoke test: **open** — no production URL/configuration or authorized production test credentials are available.
- Keep-alive and DB-size alert: **open** — local remediation is present and unit/static checks pass, but the workflow must be published to the default branch, Actions secrets `API_URL` and `INTERNAL_TOKEN` must be configured, and a live dispatch/scheduled run must be observed against the deployed API. Alert delivery also depends on GitHub notification settings; an external pinger remains unconfigured.
- Secret-free repository, Vercel public variables, and logs: **open** — GitHub repository access does not provide production Vercel/Render variable or log review; a limited local scan cannot satisfy the full check.

## Test Results

- Command: `apps/api/.venv/Scripts/python.exe -m pytest -q -c apps/api/pyproject.toml apps/api/tests/unit/test_internal_api.py`
- Passed: 5.
- Failed: 0.
- Skipped: 0.
- Workflow validation: PyYAML assertions passed for workflow structure, triggers, job names, empty permissions, and secret usage; `C:\Program Files\Git\bin\bash.exe -n` passed for all four embedded shell scripts.
- Additional verification: all three production I3 checklist assertions passed; `git diff --check` exited 0.
- Skipped: `actionlint` (not installed); live workflow dispatch, production smoke, alert delivery, and hosted-variable/log inspection (not possible without remote workflow registration, configured secrets, and production access).

## Issues

- Prior HIGH finding (missing DB-size endpoint/workflow): **remediated locally**; no new HIGH/CRITICAL implementation issue found in this recheck.
- Operational gate: **blocked** by missing remote workflow registration, absent repository Actions secrets, and missing production endpoint/access.
