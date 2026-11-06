# OpenAPI Contract Drift Checks

Keep the hand-authored contract and generated FastAPI response schemas aligned by checking response property names, required lists, and normalized property types as well as routes and statuses.

## What Happened

During Overcall task t2.1.2, a route/method/status/property-name-only drift check was insufficient to detect schema compatibility changes. The B6 contract calls for property types and required fields too. The contract stores those expectations as operation extensions in `contract/openapi.yaml`; `apps/api/scripts/check_contract.py` normalizes nullable types, arrays, and component references before comparing with generated OpenAPI.

## Takeaway

When using JSON as a YAML 1.2 subset for a shared OpenAPI file, keep it valid JSON and parse it with the standard library. Encode expected required fields and normalized types alongside each operation, then compare them against FastAPI's generated response model. Keep fixture equality checks separate: schema drift parity does not prove that every endpoint response matches a fixture.

## History
- 2026-11-06 (Overcall/t2.1.2): initial
