# t16 — Repeatable Frontend API Type Generation

## Summary

Verified the official generator is deterministic against the current contract, but the checklist cannot be completed yet: the contract has no standard response schemas, so all 21 operations produce 22 `content?: never` response entries rather than usable response types. The F3 checklist remains unchecked, and its blocker now describes the actual contract gap.

## Upstream Artifacts Consumed

- `.github/modernize/rearchitecture/artifacts/t12-backend.md` — confirmed the shared OpenAPI contract and its 19 versioned paths were validated by the backend drift checker.
- `docs/PLAN.md#D5` and `docs/PLAN.md#F3` — authoritative requirement for generating frontend types from `contract/openapi.yaml` with `openapi-typescript`.

## Evidence Mapping

- `t12-backend.md#Test Results` (19 versioned paths match) → this task checked what the standard OpenAPI generator can consume from the checked-in contract; backend route coverage does not supply response schemas to the generator.
- `docs/PLAN.md#D5` / `#F3` → repeated generator runs produced identical output, but the output lacks response body types; the F3 checklist stays open and the precise blocker is recorded beside it.

## Findings

- `contract/openapi.yaml` defines response `description` values and custom `x-response-model`, `x-response-properties`, `x-response-required`, and `x-response-types` extensions. It does not define standard response `content` schemas or `components.schemas` for these operations.
- `openapi-typescript` 7.10.1 successfully generated output twice from the contract with identical SHA-256 (`24E2BF5246DB2CE906580E30A0919B377D6C70FB2E795B71984141A47BCC8523`).
- Inspection found 19 distinct versioned paths and 21 operations; all 22 response entries are emitted with `content?: never`. Thus CLI output is deterministic but is not a usable generated response contract.
- `apps/web/package.json` has no `gen:api` script or `openapi-typescript` dependency, and `apps/web/src/api/schema.d.ts` does not exist. These should be added only after the shared contract exposes standard response schemas.
- Notified backend to add standard response schemas that preserve the existing response metadata, including referenced/nested models.

## Changes

- Updated the F3 blocker in `docs/PLAN.md`; the checklist item remains unchecked.
- No application source, package manifests, generated files, or backend contract files were changed because the response model definitions are owned by the shared contract and are not represented in standard OpenAPI form yet.

## Test Results

- Command: `npx --yes --package=openapi-typescript@7.10.1 -- openapi-typescript contract/openapi.yaml -o "$env:TEMP\overcall-schema-preview.d.ts"` — **passed, exit code 0**.
- Repeatability command: same generator/version/input to a second temporary output, followed by SHA-256 comparison — **passed; identical hashes, 2/2 generation runs passed; 1/1 hash comparison passed**.
- Output inspection: 19 paths, 21 operations, 22 response entries without content schemas — **blocker confirmed; not a test failure**.
- `npm run gen:api` — **not available** because no script is defined; not run.
- Passed: 3 verification checks (two generation runs and one hash comparison); failed: 0; skipped: 1 frontend test/build suite because no frontend source or package files changed.

## Issues Found

One HIGH finding: generated frontend response types cannot be produced until standard response schemas are added to the shared contract. No external credentials or production access were needed or used.
