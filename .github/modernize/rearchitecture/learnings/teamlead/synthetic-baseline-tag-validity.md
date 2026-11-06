# Synthetic Baseline Tag Validity

A tag named as a freeze point does not prove it predates rule implementation; inspect the exact tagged tree and the relevant history.

## What Happened
For OverCall task t7, `b3-frozen` existed but resolved to a tagged snapshot containing all seven rule implementations, the synthetic generator/tests, and fixtures. The tag therefore did not satisfy the plan's explicit “before any rule code” chronology, despite its name. No tag or source changes were made.

## Takeaway
For a historical freeze criterion, verify the tag's resolved commit and tree, not just `git tag --list` or the tag label/date. If the relevant code is already present in the tagged snapshot, do not claim pre-code ordering or move/recreate the tag; record the unmet historical condition and obtain coordinator disposition.

## History
- 2026-11-06 (OverCall/t7): initial
