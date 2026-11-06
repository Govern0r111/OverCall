# t9 — Atomic Detection and Tier 1 Rules

## Summary

Verified the mounted SQLModel-backed detection path and Tier 1 rule behavior. The issue delete/replace remains atomic under a PostgreSQL failure injected after the old issue deletion. Added threshold/hard-negative unit coverage and excluded unsupported `origin="overcall"` and AWS inputs from all three Tier 1 rules. Updated only the two directly verified B4 criteria in `docs/PLAN.md`.

## Upstream Artifacts Consumed

- `.github/modernize/rearchitecture/artifacts/t8-backend.md` — used the fixture verification and B3 baseline disposition; did not change fixtures or historical baseline evidence.
- `.github/modernize/rearchitecture/artifacts/t2-architect.md` — used the final route/status review to identify the mounted `/v1` detection implementation, then verified atomic behavior on that path rather than the legacy collection-backed engine.
- `.github/modernize/rearchitecture/artifacts/t2.5-architect.md` — used the reconciliation that current route/auth/status claims refer to the current implementation.
- `docs/PLAN.md#B4` — acceptance criteria for atomic replacement and Tier 1 unit/hard-negative behavior.

## Evidence Mapping

- `docs/PLAN.md#B4` “A rerun replaces issues atomically” → `apps/api/tests/integration/test_detection_atomicity.py` forces a PostgreSQL flush error after `IssueRepository.delete_all()` and verifies the previous issue and run remain unchanged.
- `docs/PLAN.md#B4` “Tier 1 rules pass their unit and hard-negative tests” → `apps/api/tests/unit/test_tier1_rules.py` covers duplicate-call, missing-cache, and retry-storm thresholds, exclusions, and small synthetic fixture positives/hard negatives.
- `t8-backend.md#Verification Evidence` → the small synthetic dataset remains unchanged; rule evaluation is performed against the same seed/day/size parameters and does not manufacture baseline provenance.

## Implementation Notes

- The API invokes the SQLModel-backed `v1_api._perform_detection`; `overcall/engine.py` is the stale collection-backed engine and was not modified.
- Added `tier1_eligible` in `overcall/rules/base.py` and applied it before grouping in duplicate-call, missing-cache, and retry-storm rules. It excludes `origin="overcall"` rows and `provider="aws"` rows as specified by B4.
- Atomicity verification used a disposable local PostgreSQL 15 container on a temporary port, initialized from the checked-in migrations and removed after testing. No production or external database was used.
- `docs/PLAN.md` leaves the evaluate metrics and spend/reliability storage criteria unchecked; this task did not verify them.

## Test Results

- Command: `python -m pytest -q apps/api/tests` using `apps/api/.venv/Scripts/python.exe`, run from the system temporary directory with `TEST_DATABASE_URL` pointed at the disposable local PostgreSQL database.
- Passed: 146
- Failed: 0
- Skipped: 0
- Failure details: none. Three non-failing Starlette deprecation warnings.
- Additional checks: new test files pass Ruff lint and formatting; `ruff check --select F` passes for the changed rule modules and tests. The full Ruff check on the legacy rule modules still reports existing style diagnostics (including `UP035`, `UP006`, `E501`, `E741`, and `B905`) outside the new helper/test code.
- `git diff --check` on the task files: passed.

## Issues and Remaining Work

- No HIGH or CRITICAL findings.
- The complete B4 item remains open until the separate synthetic evaluation-metrics and spend/reliability-storage criteria are directly verified.
- The context store `context.md` and `decisions.md` were absent; task scope was grounded in the provided task, `docs/PLAN.md`, and the listed upstream artifacts. `board.md` was read only and not edited.
