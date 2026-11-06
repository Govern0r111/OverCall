# t8 — Synthetic Generator and Fixture Verification

## Summary

Verified the synthetic generator and `small` fixtures. Checked the first three B3 done-when items in `docs/PLAN.md`; left the historical pre-rule freeze criterion unchecked because the tagged tree already contains the rule implementations.

## Verification Evidence

- The synthetic unit suite covers deterministic same-input output, separate ground truth, seven-rule positive and hard-negative coverage, baseline cleanliness, pricing, schema validation, standard-size timing, and input/day boundaries.
- Both small-fixture files are tracked by Git.
- The documented CLI invocation (`--seed 42 --days 7 --size small`) generated 253 rows and 55 labeled requests. SHA-256 comparisons matched both generated files to the committed `logs.json` and `ground_truth.json`.
- No generator, scenario, fixture, or tag files were changed.

## Upstream Artifacts Consumed

- `.github/modernize/rearchitecture/artifacts/t7-teamlead.md` — used the baseline disposition and tagged-tree evidence to keep the pre-rule freeze criterion open.

## Evidence Mapping

- `t7-teamlead.md#Disposition` and `#Evidence` → `docs/PLAN.md#B3` — the `b3-frozen` tag’s presence does not establish that it predates rule code; criterion remains unchecked with the blocker noted in the plan.
- `docs/PLAN.md#B3` deterministic/separate-truth, hard-negative, and committed/schema-valid fixture criteria → `apps/api/tests/test_synthetic.py` (9 passing tests), tracked fixture files, and byte-identical CLI output above.

## Test Results

- Command: `& $python -m pytest -q (Join-Path $api 'tests\test_synthetic.py')` using `apps/api/.venv/Scripts/python.exe`; executed from the system temp directory with database/provider test environment variables unset.
- Passed: 9
- Failed: 0
- Skipped: 0
- Failure details: none. Three dependency deprecation warnings were emitted.
- Additional verification: `python -m overcall.synthetic --seed 42 --days 7 --size small --out <tempdir>` returned 0; generated logs and ground truth both matched the tracked fixture files byte-for-byte.

## Remaining Blocker

B3’s “`b3-frozen` tag exists before any rule code is written” criterion remains unverified: the t7 artifact records that the tagged tree already contains all seven rule implementations. The plan records this limitation and awaits coordinator disposition; no historical tag was created or moved.
