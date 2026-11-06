# t6 — Pricing and Historical Pricing Verification

## Summary

Verified the pricing data against provider-published pages as of 2026-11-06, strengthened the historical price-selection test with different values per version, and verified the versioned pricing returned by `GET /v1/providers`. Updated `retrieved_at` in each provider file and checked off B2 in `docs/PLAN.md`.

## Pricing Evidence

- **OpenAI:** All configured model values match the public Standard pricing table, USD per 1M tokens:

  | Model | Input | Cached input | Output |
  |---|---:|---:|---:|
  | `gpt-4o` | 2.50 | 1.25 | 10.00 |
  | `gpt-4.1` | 2.00 | 0.50 | 8.00 |
  | `gpt-4o-mini` | 0.15 | 0.075 | 0.60 |
  | `gpt-4.1-mini` | 0.40 | 0.10 | 1.60 |
  | `text-embedding-3-small` | 0.02 | 0.02 | 0 |
  | `text-embedding-3-large` | 0.13 | 0.13 | 0 |

  The embedding API lists input pricing; equal cached-input values do not apply a discount. The [OpenAI Batch guide](https://developers.openai.com/api/docs/guides/batch) confirms 50% lower cost for eligible batch requests, as described in the existing OpenAI `batch_equivalents` entry.
- **Stripe:** The [Stripe pricing page](https://stripe.com/pricing) lists transaction/product fees, not a per-API-call fee. The existing `$0.0004` is explicitly an Overcall `modelled` overhead, not a Stripe charge.
- **AWS:** The [AWS pricing page](https://aws.amazon.com/pricing/) describes service/usage-specific pricing. The existing file is marked `supported: false`, with no model catalog or modeled price; no per-call amount was inferred.
- The four configured GPT-4/4o IDs are marked deprecated on their [official model pages](https://developers.openai.com/api/docs/models/gpt-4o). Their snapshot was retained for historical compatibility; selecting replacement models is a separate change.
- Updated `retrieved_at` to `2026-11-06` in the OpenAI, Stripe, and AWS pricing files. This is the review date, not a change to their `version` or `effective_from`.

## Historical Pricing Evidence

`PricingBook.for_time` chooses the latest entry whose `effective_from` is not after the event time, and `estimate_cost` returns that snapshot's version with the calculated cost. The unit test now creates two distinct temporary versions (input rate `$0.15` effective Jan 15 and `$0.30` effective Jun 1) and verifies a one-million-token call before and after the date returns the corresponding cost and `pricing_version`. This directly tests history selection without pretending the repository has a multi-version production archive; each provider currently has one committed pricing file.

The `RequestLog` model stores `cost_usd`, `cost_basis`, and `pricing_version`. The proxy integration test verifies version and basis metadata are persisted in the request-log row using the test session; this is not evidence of a live PostgreSQL or production write. The synthetic generator passes each event timestamp to the estimator, and its tests verify the generated rows retain the resulting pricing version.

## API Evidence

The `GET /v1/providers` contract test calls the route through FastAPI `TestClient` and compares each provider's returned active version, source URL, and input-price rows to the loaded `PricingBook`.

## Upstream Artifacts Consumed

- none — no dependency artifacts provided

## Evidence Mapping

- none — no dependency artifacts provided

## Test Results

- Command: `.\.venv\Scripts\python.exe -m pytest tests/unit/pricing -q`
  - Passed: 20; Failed: 0; Skipped: 0
- Command: `.\.venv\Scripts\python.exe -m pytest tests/contract/test_v1_contract.py -k "provider_endpoint_exposes_active_versioned_pricing or v1_endpoints_respond_at_runtime" -q`
  - Passed: 2; Failed: 0; Skipped: 0
- Command: `.\.venv\Scripts\python.exe -m pytest tests/test_synthetic.py -q`
  - Passed: 9; Failed: 0; Skipped: 0
- Command: `.\.venv\Scripts\python.exe -m pytest tests/integration/test_proxy_persistence.py -q`
  - Passed: 9; Failed: 0; Skipped: 0
- Combined: 40 passed; 0 failed; 0 skipped. The focused pytest runs emitted only the existing Starlette/AnyIO `BlockingPortal` deprecation warning.
- Command: `.\.venv\Scripts\python.exe scripts/check_pricing_age.py --as-of 2026-11-06`
  - Result: all three files valid; each reviewed 0 days ago; exit code 0.
- Command: `.\.venv\Scripts\ruff.exe check overcall/pricing tests/unit/pricing tests/contract/test_v1_contract.py`
  - Result: passed.
- Command: `git diff --check`
  - Result: passed.

## Issues and Limits

- OpenAI's current model pages mark all four configured GPT-4/4o IDs deprecated; coordinator was notified to consider a separate supported-model migration.
- No multi-version official price archive is committed, and no production log dataset was tested. Historical behavior is verified with distinct temporary snapshots, not claimed from real production history.
