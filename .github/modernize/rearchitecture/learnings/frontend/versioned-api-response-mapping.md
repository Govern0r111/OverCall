# Versioned API Response Mapping

Keep frontend wire DTOs aligned to the versioned response schema and adapt them into UI view models at the query boundary.

## What Happened

In OverCall task t2.2.1, `/v1` response models differed from the frontend's Overview, Issue, Log, Settings, Provider, and Accuracy types. Explicit API DTOs and `fromApi*` adapters preserved the existing screen models while translating decimal strings, nested fields, nullable values, and list envelopes. Demo MSW handlers were changed to emit the same wire shapes so browser tests exercise the real mapping boundary.

## Takeaway

Keep wire types and UI view models distinct. Convert fields only when the API provides the evidence (for example, percent-of-spend is divided by 100 for the UI's fractional ratio); never fabricate response fields such as source counts. Make demo handlers follow the same versioned contract and test both response shape and the user journey.

## History

- 2026-11-06 (`OverCall/t2.2.1`): initial
