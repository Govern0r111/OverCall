# Versioned API Response Shape Fixtures

Use property-path shape fixtures when response values such as IDs and timestamps vary but field and array structure must stay fixed.

## What Happened

During OverCall task t12, the B6 contract had only exact fixtures for overview-empty and default settings while the remaining JSON response shapes were unchecked. A path-based fixture (`[]` for array items) allowed deterministic repository-backed API responses to be compared without freezing volatile values. The test also checks each operation's top-level fields against OpenAPI and leaves response value/semantic assertions to existing tests.

## Takeaway

For versioned API shape coverage, keep stable field/array paths in a separate fixture, compare them against representative responses for every JSON-producing operation, and verify top-level properties against the authoritative contract. Keep exact-value fixtures for stable examples, exclude bodyless 204 responses, and test separately owned API surfaces (such as ingest-key lifecycle) in their own suite.

## History

- 2026-11-06 (OverCall/t12): initial
