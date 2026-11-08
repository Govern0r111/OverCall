# OpenAPI Response Schema Generation

Standard OpenAPI response `content` schemas are required for `openapi-typescript` to generate frontend response DTOs.

## What Happened

In OverCall task t16, `contract/openapi.yaml` had custom `x-response-*` metadata but no standard response content schemas. `openapi-typescript` 7.10.1 generated the file deterministically, but 21 operations (22 response entries) had `content?: never`, so the output did not describe response bodies.

## Takeaway

Before adding the frontend generation script, verify the contract has standard `responses.*.content.*.schema` definitions and referenced schemas, not only custom metadata used by another checker. Keep the frontend checklist open until the generated output contains response body types.

## History

- 2026-11-06 (`OverCall/t16`): initial
