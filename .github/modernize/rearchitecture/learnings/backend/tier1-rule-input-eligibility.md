# Tier 1 Rule Input Eligibility

Filter unsupported providers and self-originated traffic before grouping rows in every detection rule, in deterministic timestamp/id order.

## What Happened

During OverCall task t9, the three mounted Tier 1 rules grouped every row, including `origin="overcall"` and AWS traffic, despite B4 requiring both to be excluded. Task t10 generalized that helper to `eligible_logs` and applied it before grouping in all seven rules, while sorting by `(timestamp, id)`. Boundary and synthetic hard-negative tests verify the behavior.

## Takeaway

Keep rule input eligibility in one shared helper and apply it before every rule's grouping; filtering only final findings can still let excluded rows influence upstream grouping and matches. Retain the same deterministic row order across rules.

## History

- 2026-11-06 (OverCall/t9): initial
- 2026-11-06 (OverCall/t10): generalized eligibility to all seven rules and sorted by timestamp/id
