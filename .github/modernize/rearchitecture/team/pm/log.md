## [t1] Inventory remaining plan items and blockers
- Scanned `docs/PLAN.md` without editing it; after excluding F1, the inventory has 65 unchecked rows across frontend (8), backend (38), integration (11), and Appendix A (8).
- The `b3-frozen` git tag was absent at HEAD `025721f`; the worktree already contained unrelated edits, so baseline selection should be coordinated before the tag is created.
- The current process had no exported Supabase/production credential variables checked; this does not establish whether `.env` files or external service access exist.
- The rearchitecture context, decisions, PM log/inbox, and PM learnings directory were absent; `board.md` was available and read.
- No style or architecture decisions made.
- Learnings consumed: [(none)]
