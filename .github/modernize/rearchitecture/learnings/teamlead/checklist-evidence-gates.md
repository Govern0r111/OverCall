# Checklist Evidence Gates

For brownfield checklist execution, map every currently unchecked acceptance row to a bounded task and evidence artifact, while separating local proof from manual/external prerequisites.

## What Happened
For OverCall task t3, the PM inventory was stale by five rows; a fresh scan found 60 unchecked rows and confirmed F1 plus several remediation rows were already checked. Later frontend/backend evidence and current source also superseded stale API-route/auth statements in an architecture summary.

## Takeaway
Always rescan the source checklist at planning time, map every open row to a criterion/task/evidence ID, and explicitly preserve gates for credentials, production, real-data labels, human timing, long-duration soaks, and PRs. When upstream artifacts disagree, verify the specific current implementation boundary and notify the owning role; do not silently treat either stale claims or partial test evidence as complete.

## History
- 2026-11-06 (OverCall/t3): initial
