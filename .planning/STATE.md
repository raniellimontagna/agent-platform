---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 05
current_phase_name: Orchestrator Hub Refactor
status: completed
stopped_at: Completed 05-03-PLAN.md
last_updated: "2026-07-02T16:10:14.473Z"
last_activity: 2026-07-02
last_activity_desc: Phase 04 complete, transitioned to Phase 05
progress:
  total_phases: 7
  completed_phases: 5
  total_plans: 14
  completed_plans: 14
  percent: 71
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-07-02)

**Core value:** Recover control of `agent-platform` through Plane-first docs,
legacy removal, modular flow refactors, and verification gates.
**Current focus:** Phase 05 — Orchestrator Hub Refactor (complete; Phase 6 not started)

## Current Position

Phase: 05 — Orchestrator Hub Refactor
Plan: Not started
Status: Phase 5 complete; Phase 6 not started
Last activity: 2026-07-02 — Phase 04 complete, transitioned to Phase 05

Progress: [███████░░░] 71%

## Performance Metrics

**Velocity:**

- Total plans completed: 24
- Average duration: ~23 minutes
- Total execution time: ~2.7 hours documented effort

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Bootstrap and Architectural Inventory | 2 | 2 | ~28m |
| 2. Living Documentation and Historical Archive | 2 | 2 | ~28m |
| 3. Plane-Only Provider Cutover | 5 | 5 | ~14m |
| 4. Operational Flow Reorganization | 2 | 2 | ~6m56s |
| 5. Orchestrator Hub Refactor | 3 | 3 | ~10m30s |
| 6. Worker and Eval Hub Refactor | 0 | 3 | - |
| 7. Final Verification and Governance Closeout | 0 | 2 | - |
| 05 | 3 | - | - |
| 03 | 5 | - | - |
| 04 | 2 | - | - |

**Recent Trend:**

- Last 5 completed plans: 04-01, 04-02, 05-01, 05-02, 05-03 all complete.
- Trend: Phase 5 is complete with shared route helpers, webhook seams, and Mission Control data/render seams all covered by fail-first evidence.

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
| Phase 05 P01 | 5m19s | 2 tasks | 9 files |
| Phase 05 P02 | 9m46s | 2 tasks | 7 files |
| Phase 05 P03 | 16m26s | 2 tasks | 7 files |

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
- [Phase 05]: 05-01: Use one local requireRunnerAuth helper instead of Hono bearerAuth so exact 401 JSON remains unchanged.
- [Phase 05]: 05-01: Extract only escapeHtml, formatDate, and humanizeStatus; keep route-specific status-class mappings local.
- [Phase 05]: 05-01: Keep Task 1 and Task 2 RED/GREEN commits separate to preserve fail-first evidence.
- [Phase 05]: 05-02: Keep /webhooks/linear present and gated by CARD_EXTRA_PROVIDERS=linear; do not make Linear an active provider default.
- [Phase 05]: 05-02: Keep cardWebhook.labelJustAdded as the transition source owner instead of duplicating label-diff semantics.
- [Phase 05]: 05-02: Keep /webhooks/plane as active intake while moving HMAC checks, Plane parsing, and run transitions behind local seams.
- [Phase 05]: 05-03: Split Mission Control into missionControlData.ts and missionControlRender.ts while keeping routes/admin.ts as protected route orchestration.
- [Phase 05]: 05-03: Preserve routes/admin.ts renderer re-exports and keep Mission Control read-only with no operator controls.
- [Phase 05]: 05-03: Apply one human-approved lint-only import-order fix in routes/rendering.test.ts to satisfy the full Phase 5 gate.

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

Last session: 2026-07-02T15:44:21.817Z
Stopped at: Completed 05-03-PLAN.md
Resume file: None
