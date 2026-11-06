# Disconnected API Runtime Boundary

The mounted `/v1` API, separate ingest-key `/proxy`, legacy unmounted collection-backed API, and demo MSW flow are distinct paths; verify client URL, DTO, auth, and runtime evidence before claiming integration.

## What Happened

During OverCall task t2, `create_app` exposed health/readiness routes without mounting the API/proxy routers. The legacy routers import collection names that the present SQLModel `overcall.db` package does not export. Later remediation mounted a SQLModel-backed `/v1` API and `/proxy`, aligned the browser URLs and DTOs, and implemented JWT verification. Task t2.5 corrected the architecture artifact's now-stale mismatch/placeholder claims against t2.1–t2.4 evidence.

## Takeaway

When checking API integration, trace the app factory → router registration → persistence adapter → client URL/DTO → auth → runtime flow. A health endpoint or MSW demo flow alone does not prove the real browser path. A local auth stub, local signing keys, and isolated PostgreSQL establish local seams only—not real Supabase/JWKS/OAuth behavior, CI, production, or unrun database/isolation criteria.

## History

- 2026-11-06 (`OverCall/t2`): initial
- 2026-11-06 (`OverCall/t2.5`): updated after route, DTO, and JWT remediation; clarified local-versus-external verification boundaries.
