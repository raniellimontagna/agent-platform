---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 04
current_phase_name: Operational Flow Reorganization
status: in_progress
stopped_at: Completed 04-02-PLAN.md
last_updated: "2026-07-02T13:58:15.447Z"
last_activity: 2026-07-02
last_activity_desc: Completed 04-02-PLAN.md
progress:
  total_phases: 7
  completed_phases: 4
  total_plans: 11
  completed_plans: 11
  percent: 57
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-07-02)

**Core value:** Recover control of `agent-platform` through Plane-first docs,
legacy removal, modular flow refactors, and verification gates.
**Current focus:** Phase 04 — Operational Flow Reorganization

## Current Position

Phase: 04 — COMPLETE
Plan: 2 of 2
Status: Phase 4 complete; Phase 5 not started
Last activity: 2026-07-02 — Completed 04-02-PLAN.md

Progress: [██████░░░░] 57%

## Performance Metrics

**Velocity:**

- Total plans completed: 11
- Average duration: ~23 minutes
- Total execution time: ~2.2 hours documented effort

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Bootstrap and Architectural Inventory | 2 | 2 | ~28m |
| 2. Living Documentation and Historical Archive | 2 | 2 | ~28m |
| 3. Plane-Only Provider Cutover | 5 | 5 | ~14m |
| 4. Operational Flow Reorganization | 2 | 2 | ~6m56s |
| 5. Orchestrator Hub Refactor | 0 | 3 | - |
| 6. Worker and Eval Hub Refactor | 0 | 3 | - |
| 7. Final Verification and Governance Closeout | 0 | 2 | - |

**Recent Trend:**

- Last 5 completed plans: 03-03, 03-04, 03-05, 04-01, 04-02 all complete.
- Trend: Phase 4 operational flow reorganization is complete with source-owner docs, registry compatibility tests, and full verification evidence recorded.

**Recent Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 03 P01 | 7m14s | 3 tasks | 10 files |
| Phase 03 P02 | 6m19s | 2 tasks | 6 files |
| Phase 03 P03 | 16m10s | 3 tasks | 6 files |
| Phase 03 P04 | 24m29s | 2 tasks | 4 files |
| Phase 03 P05 | 14m03s | 3 tasks | 17 files |
| Phase 04 P01 | 6m37s | 3 tasks | 10 files |
| Phase 04 P02 | 7m16s | 2 tasks | 7 files |

## Accumulated Context

### Decisions

- [2026-07-02]: Run cleanup as a complete GSD milestone.
- [2026-07-02]: Use aggressive cleanup posture with tests and rollback notes.
- [2026-07-02]: Linear legacy can be removed if Phase 1 inventory confirms Plane covers current usage.
- [2026-07-02]: Start with inventory before destructive refactors.
- [2026-07-02]: GSD Core is installed globally for Codex; use `$gsd-autonomous`.
- [2026-07-02]: Phase 1 classified Linear as active optional runtime dependency, not just stale docs.
- [2026-07-02]: Phase 2 established `docs/README.md`, `docs/CURRENT.md`, and `docs/HISTORICAL.md` as the docs control layer.
- [Phase 03]: 03-01: Linear env defaults are no longer global Vitest setup; tests that need legacy behavior own their setup explicitly.
- [Phase 03]: 03-01: Runtime provider behavior remains characterization-only in this plan; active cutover implementation stays in later Phase 3 plans.
- [Phase 03]: 03-01: Linear provenance on Plane cards is migration metadata, not active provider routing.
- [Phase 03]: 03-02: CARD_PRIMARY_PROVIDER=linear is rejected at both env validation and direct runtime registry construction.
- [Phase 03]: 03-02: CARD_EXTRA_PROVIDERS=linear remains the explicit legacy compatibility seam and keeps Plane as primary.
- [Phase 03]: 03-02: Agent graph enablement remains env-driven but provider parsing is centralized in a local helper.
- [Phase 03]: 03-03: Queue and worker provider resolution now uses explicit or persisted run card identity and rejects unresolved ambiguity.
- [Phase 03]: 03-03: Scheduler-created cards use PLANE_SCHEDULED_LABEL_ID only; legacy scheduled labels are not substituted for new Plane work.
- [Phase 03]: 03-03: Deployed BullMQ inspection found no waiting/delayed/paused missing-provider plan jobs; two failed legacy jobs had persisted Linear provider/card rows.
- [Phase 03]: 03-04: Repository webhook gating is implemented; legacy Linear webhook route is disabled unless explicit compatibility config is present.
- [Phase 03]: 03-04: Deployed env no longer sets CARD_EXTRA_PROVIDERS=linear, Tailscale Funnel exposes only /webhooks/plane, and the Linear webhook pointing at /webhooks/linear is disabled.
- [Phase 03]: 03-05: New generic run/card identity defaults to Plane while legacy-only Linear identity remains readable.
- [Phase 03]: 03-05: Legacy Linear columns are retained; only the card_provider default changed.
- [Phase 03]: 03-05: Production audit found no legacy-only run rows, but destructive column cleanup still requires a separate confirmation.
- [Phase 04]: 04-01 kept flow reorganization documentation-only; no route, graph, worker, registry, package, or test files were edited.
- [Phase 04]: 04-01 uses docs/CURRENT.md as the active surface status map while 04-02 owns runbook index/source-of-truth cleanup.
- [Phase 04]: 04-01 treats apps/worker-code/src/routes/jobs.ts as a static Worker API anchor while runJob.test.ts covers runner behavior.
- [Phase 04]: 04-02 uses existing owner files instead of adding a new constants package for workflow labels, agent keys, skills, models, env, runner paths, or artifacts.
- [Phase 04]: 04-02 keeps coder-agent as compatibility alias and documents software-delivery-pipeline as the current clearer identity.

### Pending Todos

- Review Phase 3 gates before removing Linear runtime paths.
- Decide whether `coder-agent` remains a permanent compatibility alias or becomes deprecated after external reference audit.

### Phase 3 Gates

- Phase 3 provider cutover gates are complete.
- Future destructive cleanup still requires separate confirmation before dropping or renaming `linear_issue_*` fields.
- Keep GSD Core loaded in Codex before invoking the next autonomous phase.

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Provider deletion | Runtime Linear removal until schema/env/test gates pass | Deferred to Phase 3 | 2026-07-02 |
| File moves/deletion | Historical docs remain in place until index is reviewed | Deferred to later cleanup | 2026-07-02 |

## Session Continuity

Last session: 2026-07-02T13:58:15.436Z
Stopped at: Completed 04-02-PLAN.md
Resume file: None
