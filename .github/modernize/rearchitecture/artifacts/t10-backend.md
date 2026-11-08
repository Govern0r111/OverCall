# t10 — Shared Rules and Tier 3 Gates

## Summary

Expanded the shared rule-input eligibility filter to all seven detection rules and made rule evaluation deterministic by `(timestamp, id)`. Corrected Tier 3 token-bloat to use `context_tokens` for its threshold and savings, and model-overuse to exclude tool calls and honor `model_overuse_min_calls`. Made the Tier 3 detection gate a tested predicate; confirmed issue listing/detail still require the setting. Updated the B5 checklist after direct verification.

## Upstream Artifacts Consumed

- `.github/modernize/rearchitecture/artifacts/t8-backend.md` — preserved the verified synthetic fixture and baseline disposition; no fixture or historical tag changes.
- `.github/modernize/rearchitecture/artifacts/t9-backend.md` — followed its mounted SQLModel detection boundary and extended the existing Tier 1 eligibility behavior across all rules.

## Evidence Mapping

- `t8-backend.md#Verification Evidence` → `docs/PLAN.md#B5` — reused the established seed-42, seven-day synthetic setup without changing committed fixture data or baseline provenance.
- `t9-backend.md#Implementation Notes` → `apps/api/overcall/rules/base.py` and all seven rule modules — generalized filtering of `origin="overcall"` and AWS inputs and applied it before grouping.
- `docs/PLAN.md#B5` all-seven interface/settings thresholds → `apps/api/tests/unit/test_tier23_rules.py`, `tests/unit/test_tier1_rules.py`, and `tests/test_synthetic.py`.
- `docs/PLAN.md#B5` Tier 3 gate/confidence → `v1_api._rule_enabled_for_detection`, the Tier 3 rule tests, and `tests/contract/test_v1_contract.py` list/detail gate checks.
- `docs/PLAN.md#B5` per-rule synthetic metrics → `v1_api._synthetic_accuracy`, `GET /v1/accuracy`, and the verified metrics below.

## Changes

- `apps/api/overcall/rules/base.py`: shared `eligible_logs` filters unsupported rows and sorts deterministically; the `Rule` interface includes defaults and threshold keys.
- `apps/api/overcall/rules/{duplicate_calls,missing_cache,retry_storm,oversized_payload,unbatched_calls,token_bloat,model_overuse}.py`: use shared eligibility and declare threshold keys. Tier 3 rules now honor the plan's context-token, tool-use, and configurable minimum-call requirements.
- `apps/api/overcall/v1_api.py`: detection uses one rule-enabled predicate for per-rule settings and the Tier 3 gate.
- `apps/api/tests/unit/test_tier23_rules.py`: shared interface/filter, Tier 2/Tier 3 boundaries, experimental confidence, gate, pricing-basis, and synthetic metrics coverage.
- `apps/api/tests/test_synthetic.py` and `tests/contract/test_v1_contract.py`: updated test thresholds and verified Tier 3 issue list/detail visibility.
- `docs/PLAN.md`: checked the three B5 done-when criteria and recorded synthetic-only evidence.

## Synthetic Metrics

Generated seed 42, seven-day `small` dataset; 253 requests. The mounted evaluator returned:

| Rule | Positives | Flagged | Precision | Recall | False positives on hard negatives |
|---|---:|---:|---:|---:|---:|
| duplicate_calls | 4 | 4 | 1.0000 | 1.0000 | 0 |
| missing_cache | 6 | 6 | 1.0000 | 1.0000 | 0 |
| retry_storm | 3 | 3 | 1.0000 | 1.0000 | 0 |
| oversized_payload | 2 | 2 | 1.0000 | 1.0000 | 0 |
| unbatched_calls | 4 | 4 | 1.0000 | 1.0000 | 0 |
| token_bloat | 3 | 3 | 1.0000 | 1.0000 | 0 |
| model_overuse | 10 | 10 | 1.0000 | 1.0000 | 0 |

These are circular synthetic-data measurements, not real-traffic accuracy.

## Test Results

- Command: `C:\Users\abhis\OneDrive\Desktop\Overcall\apps\api\.venv\Scripts\python.exe -m pytest -q -rs --tb=short -c C:\Users\abhis\OneDrive\Desktop\Overcall\apps\api\pyproject.toml C:\Users\abhis\OneDrive\Desktop\Overcall\apps\api\tests`; run from `%TEMP%` with `PYTHONPATH=C:\Users\abhis\OneDrive\Desktop\Overcall\apps\api`.
- Passed: 165
- Failed: 0
- Skipped: 8
- Failure details: none in the final run. The 8 skips are PostgreSQL integration cases requiring `TEST_DATABASE_URL`. Earlier root-directory runs loaded `.env` and failed config/CORS assertions; the clean `%TEMP%` rerun passed. A concurrent SSE test also failed once while its implementation was being edited, then passed in the full rerun.
- API runtime: `test_v1_endpoints_respond_at_runtime` exercised the versioned endpoint set including `/v1/detection/run` and `/v1/accuracy`; Tier 3 list/detail gate test passed (2 targeted tests passed).
- Lint: `ruff check --select F` on changed rules, API, and tests passed; `ruff format --check tests/unit/test_tier23_rules.py` passed.
- `git diff --check`: passed.

## Findings and Remaining Constraints

- No HIGH or CRITICAL findings.
- PostgreSQL integration coverage was skipped because `TEST_DATABASE_URL` was not supplied; no production credentials, OAuth/provider setup, or production access were used.
- Synthetic accuracy is not evidence for the real-data accuracy gate.
