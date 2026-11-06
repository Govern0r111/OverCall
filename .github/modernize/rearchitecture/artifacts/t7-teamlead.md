# t7 — Synthetic Baseline Disposition

## Disposition

The `b3-frozen` tag exists, but it does **not** establish the required pre-rule freeze. It points to commit `3299fefc9d6db4c85d7d18761e73ebd888bb72c6` (`Publish Overcall as an independent project`, 2026-10-22). The tagged tree already contains `apps/api/overcall/engine.py`, all seven rule implementations under `apps/api/overcall/rules/`, the synthetic generator and truth/scenario modules, `apps/api/tests/test_synthetic.py`, and both committed `small` fixtures. The tagged `rules/__init__.py` imports all seven rules.

Because rule code is present in the tagged snapshot, its name and timestamp cannot prove that the tag was created before any rule code was written. B3-04 remains unmet; do not check it off, recreate or move the tag, or represent it as a valid pre-rule baseline. No tag or application source was changed. The pre-existing worktree edits to `project-profile.yaml` and `board.md` were preserved.

**Coordinator decision required:** decide whether B3-04 should remain an explicitly unmet historical criterion or be formally re-scoped to a verifiable baseline policy. T005 and subsequent B3-dependent rule work remain gated on that decision, per the task plan.

## Evidence

- `git tag --list '*b3*'` lists `b3-frozen`.
- `git show --no-patch --decorate --format=fuller b3-frozen` resolves the tag to commit `3299fef...` and shows its tag/commit date.
- `git ls-tree -r --name-only b3-frozen` lists the rules, engine, generator, tests, and fixture paths in the tagged snapshot.
- `git show b3-frozen:apps/api/overcall/rules/__init__.py` shows imports for `DuplicateCalls`, `MissingCache`, `ModelOveruse`, `OversizedPayload`, `RetryStorm`, `TokenBloat`, and `UnbatchedCalls`.
- Worktree inspection showed existing edits outside the application source. No source or tag mutations were made for this disposition check.

## Upstream Artifacts Consumed

- `.github/modernize/rearchitecture/artifacts/t3-teamlead-plan.md` — task ordering and the requirement to resolve baseline history before generator/rule verification.
- `.github/modernize/rearchitecture/artifacts/checkpoints/t3-plan-to-tasks.yaml` — T004/P3.1 dependency boundary.
- `.github/modernize/rearchitecture/artifacts/checkpoints/t3-checklist-to-plan.yaml` — B3-04 gate and required evidence.
- `.github/modernize/rearchitecture/artifacts/t1-pm.md` — earlier baseline concern; the tag-list claim there is superseded by this direct check.
- `docs/PLAN.md` — B3 freeze rule and B3-04 acceptance wording.

## Evidence Mapping

- `t3-teamlead-plan.md#Step 3 — Synthetic data and freeze-point disposition` and `t3-checklist-to-plan.yaml#B3-04` → tag/tree evidence above; pre-rule ordering is not provable, so B3-04 remains open.
- `docs/PLAN.md#B3 — Synthetic data generator` freeze rule / done-when → no completion claim; coordinator disposition is required before proceeding.

## Verification

- Checks: read-only Git tag, object/tree, and worktree inspection.
- Application tests: not run; this task determines historical tag validity and makes no implementation changes.
- Outcome: disposition recorded; no test or tag state modified.
