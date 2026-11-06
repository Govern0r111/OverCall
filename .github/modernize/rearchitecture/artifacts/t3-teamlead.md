# t3 — Checklist Execution Plan

## Summary

Created a dependency-ordered plan for the **60 checklist rows currently unchecked** in `docs/PLAN.md`. The plan preserves checklist order within modules, orders prerequisites across modules, and separates local implementation/proof from manual, provider-controlled, production, real-data, and long-duration gates. F1 is not in scope; its current rows are checked.

## Deliverables

- [t3-teamlead-plan.md](./t3-teamlead-plan.md) — execution plan, 29 bounded tasks, testing strategy, manual gates, and criterion-to-plan mapping.
- [checkpoints/t3-checklist-to-plan.yaml](./checkpoints/t3-checklist-to-plan.yaml) — all 60 unchecked `docs/PLAN.md` criteria mapped to plan items/tasks and evidence.
- [checkpoints/t3-plan-to-tasks.yaml](./checkpoints/t3-plan-to-tasks.yaml) — plan-item dependencies and task traceability.

## Upstream Artifacts Consumed

- `.github/modernize/rearchitecture/artifacts/t1-pm.md` — current checklist inventory and external/manual/soak blockers.
- `.github/modernize/rearchitecture/artifacts/t2-architect.md` — module boundaries, architecture findings, and technical verification risks.
- `.github/modernize/rearchitecture/artifacts/t2.1-backend.md` — fresh API runtime/test evidence and remaining database/isolation limits.
- `.github/modernize/rearchitecture/artifacts/t2.2-frontend.md` — browser route alignment work and integration boundaries.
- `.github/modernize/rearchitecture/artifacts/t2.2.1-frontend.md` — later DTO alignment, signed-in demo flow, and real-account boundary.
- `docs/PLAN.md` — current unchecked rows, source of acceptance criteria and plan order.
- Current `apps/web/src/lib/api.ts` and `apps/api/overcall/deps.py` — resolved stale API-path/JWT assertions in the t2 summary.
- `apps/web/package.json`, `apps/api/pyproject.toml`, `.github/workflows/ci.yml`, and `project-profile.yaml` — test commands, project types, and no-topology grouping decision.

## Evidence Mapping

- `t1-pm.md#Unchecked items, in plan order` and current `docs/PLAN.md` — 60 rows → IDs and task mapping in `checkpoints/t3-checklist-to-plan.yaml`.
- `t1-pm.md#Manual and external preconditions` — credentials, production, real-data, human timing, PR, and seven-day-soak boundaries → explicit hold points in the plan.
- `t2-architect.md#Material architecture findings for planning` plus current `api.ts` / `deps.py` and `t2.2.1-frontend.md` → API/Auth dependency order; use the later implementation evidence for `/v1` and JWT behavior, but keep real-account proof open.
- `t2.1-backend.md#Test Results` — backend baseline and PostgreSQL skips → proposed API/DB validation tiers and evidence limits.
- `t2.2.1-frontend.md#Test Results` — frontend baseline → Vitest/Playwright/build/lint command selection.
- `project-profile.yaml#assessment` — no topology grouping → use existing F/B/I module boundaries; do not invent G-groups.

## Validation Results

- Read-only checklist scan: 60 unchecked rows, grouped as F=8, B=34, I=10, Appendix A=8.
- `Docker info`: available. Node.js: `v22.22.0`. Python: `3.13.3`.
- No application tests were run; this is a planning-only task.
- Pre-existing worktree changes in `project-profile.yaml` and `board.md` were not edited.
- A t2 architecture-summary inconsistency was routed to the architect for reconciliation; the plan records the conflict and does not treat real Supabase authentication as verified.

## Findings

- 1 HIGH — t2 architecture summary contradicts current `/v1` routing/JWT verification and later DTO-alignment evidence; routed to the architect for reconciliation.
- 0 CRITICAL.
- Open coordinator gate: B3’s `b3-frozen` tag cannot be created retroactively without establishing the intended baseline and resolving dirty-worktree impact.
- External gates remain explicitly open where evidence requires user-controlled credentials, production access, authorized real-traffic data, an actual seven-day soak, or a PR.
