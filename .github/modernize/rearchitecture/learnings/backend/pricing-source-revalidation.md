# Pricing Source Revalidation

Separate a current provider-price review from proof that old events select historical price snapshots.

## What Happened

During OverCall task t6, all OpenAI Standard rates in the current pricing files matched the public pricing page; the public Batch API guide supported the recorded 50% basis. Stripe's public page lists transaction/product pricing, while the repository correctly treats its per-request amount as Overcall-modeled overhead. AWS remains unsupported. Current OpenAI model pages mark the four configured GPT-4/4o identifiers deprecated. The repo has one actual pricing snapshot per provider, so historical selection was verified with temporary versions having deliberately different rates, not with a production history.

## Takeaway

On revalidation, record the source-review date in `retrieved_at` but do not change a snapshot's `version` or `effective_from` unless the provider's effective date is evidenced. Test historical lookup with distinct snapshot rates and check both the resulting cost and version. Keep modeled overhead separate from provider fees, and report deprecated model IDs separately instead of silently rewriting historical data.

## History

- 2026-11-06 (OverCall/t6): initial
