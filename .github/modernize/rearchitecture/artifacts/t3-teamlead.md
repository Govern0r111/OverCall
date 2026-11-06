# t3 — Checklist Execution Plan (Architecture-Reconciled Re-run)

## Summary

Re-ran the dependency-ordered plan for the **60 checklist rows currently unchecked** in `docs/PLAN.md`. The prior attempt’s sole HIGH finding came from route/auth statements in the architecture summary that were corrected by t2.5. The corrected architecture evidence now passes, and this plan no longer carries the superseded mismatch as a blocker. The plan preserves checklist order within modules, orders prerequisites across modules, and separates local implementation/proof from manual, provider-controlled, production, real-data, and long-duration gates. F1 is not in scope; its current rows are checked.

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
- `.github/modernize/rearchitecture/artifacts/t2.3-backend.md` — JWT verification and external-provider limits.
- `.github/modernize/rearchitecture/artifacts/t2.4-backend.md` — persisted and public detection-status behavior.
- `.github/modernize/rearchitecture/artifacts/t2.5-architect.md` — corrected route/auth/status claims and remaining acceptance boundaries.
- `docs/PLAN.md` — current unchecked rows, source of acceptance criteria and plan order.
- Current `apps/web/src/lib/api.ts` and `apps/api/overcall/deps.py` — implementation corroboration for the corrected route and auth boundary.
- `apps/web/package.json`, `apps/api/pyproject.toml`, `.github/workflows/ci.yml`, and `project-profile.yaml` — test commands, project types, and no-topology grouping decision.

## Evidence Mapping

- `t1-pm.md#Unchecked items, in plan order` and current `docs/PLAN.md` — 60 rows → IDs and task mapping in `checkpoints/t3-checklist-to-plan.yaml`.
- `t1-pm.md#Manual and external preconditions` — credentials, production, real-data, human timing, PR, and seven-day-soak boundaries → explicit hold points in the plan.
- `t2-architect.md#Final re-review after route, DTO, auth, and detection-status remediation` plus `t2.5-architect.md#Reconciled claims` → current `/v1`/`/proxy` route, JWT, DTO, and detection-status facts; old mismatch is resolved while real-account proof remains open.
- `t2.1-backend.md#Test Results` — backend baseline and PostgreSQL skips → proposed API/DB validation tiers and evidence limits.
- `t2.2-frontend.md#Final Re-verification After t2.4` and `t2.2.1-frontend.md#Test Results` — frontend integration boundary and Vitest/Playwright/build/lint command selection.
- `t2.3-backend.md#Remaining Boundaries` / `t2.4-backend.md#Evidence Mapping` — real-provider limits and detection status semantics.
- `project-profile.yaml#assessment` — no topology grouping → use existing F/B/I module boundaries; do not invent G-groups.

## Validation Results

- Read-only checklist scan: 60 unchecked rows, grouped as F=8, B=34, I=10, Appendix A=8.
- `Docker info`: available. Node.js: `v22.22.0`. Python: `3.13.3`.
- No application tests were run; this is a planning-only task.
- Pre-existing worktree changes in `project-profile.yaml` and `board.md` were not edited.
- The t2.5 architecture reconciliation reports PASS with 0 HIGH and 0 CRITICAL findings. The earlier route/auth inconsistency is resolved; real Supabase authentication remains unverified.

## Findings

- 0 HIGH — the prior finding is resolved by t2.5.
- 0 CRITICAL.
- Open coordinator gate: B3’s `b3-frozen` tag cannot be created retroactively without establishing the intended baseline and resolving dirty-worktree impact.
- External gates remain explicitly open where evidence requires user-controlled credentials, production access, authorized real-traffic data, an actual seven-day soak, or a PR.
