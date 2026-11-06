# Tier 1 Rule Input Eligibility

Filter unsupported providers and self-originated traffic before grouping request rows in Tier 1 detection rules.

## What Happened

During OverCall task t9, the three mounted Tier 1 rules grouped every row, including `origin="overcall"` and AWS traffic, despite B4 requiring both to be excluded. A shared `tier1_eligible` helper in `overcall/rules/base.py` now removes those rows before duplicate, cache, or retry grouping. Boundary and synthetic hard-negative tests verify the behavior.

## Takeaway

Keep Tier 1 input eligibility in one shared helper and apply it before rule-specific grouping; filtering only the final findings can still let excluded rows influence upstream grouping and matches.

## History

- 2026-11-06 (OverCall/t9): initial
