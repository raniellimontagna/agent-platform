---
phase: 03-plane-only-provider-cutover
plan: "01"
subsystem: testing
tags: [plane, linear-compatibility, vitest, provider-cutover, scheduler, webhooks]
status: complete

requires:
  - phase: 01-bootstrap-and-architectural-inventory
    provides: Linear dependency inventory and provider risk classification
  - phase: 02-living-documentation-and-historical-archive
    provides: Plane-first current docs context and historical archive boundary
provides:
  - Plane-only Vitest baseline without globally enabling the legacy provider
  - Provider registry, env, queue, webhook, scheduler, admin, graph, run, migration, and Plane gateway characterization coverage
  - Legacy Linear row and Linear-to-Plane migration provenance compatibility coverage
affects: [03-02, 03-03, 03-04, 03-05, provider-cutover, legacy-compatibility]

tech-stack:
  added: []
  patterns:
    - Vitest characterization tests for Plane-only defaults before runtime cutover
    - Explicit legacy Linear test setup instead of global legacy env defaults
    - BullMQ worker processor testing through module mocks

key-files:
  created:
    - apps/orchestrator-api/src/queue.test.ts
    - apps/orchestrator-api/src/scheduleWorker.test.ts
    - .planning/phases/03-plane-only-provider-cutover/deferred-items.md
  modified:
    - vitest.setup.ts
    - apps/orchestrator-api/src/cards.test.ts
    - apps/orchestrator-api/src/env.test.ts
    - apps/orchestrator-api/src/routes/webhooks.test.ts
    - apps/orchestrator-api/src/runs.test.ts
    - apps/orchestrator-api/src/planeMigration.test.ts
    - packages/plane/src/index.test.ts

key-decisions:
  - "Linear env defaults are no longer global Vitest setup; tests that need legacy behavior own their setup explicitly."
  - "03-01 remains characterization-only for runtime behavior; active provider cutover implementation stays in later Phase 3 plans."
  - "Linear provenance on Plane cards is treated as migration metadata, not active provider routing."

patterns-established:
  - "Plane-only baseline: default tests load with CARD_PRIMARY_PROVIDER=plane and CARD_EXTRA_PROVIDERS empty."
  - "Legacy compatibility tests must opt into Linear with local env or explicit cardProvider fields."
  - "Scheduler worker tests can capture the BullMQ processor and invoke it directly with mocked dependencies."

requirements-completed: [PLN-01, PLN-02, PLN-03, PLN-04]

coverage:
  - id: D1
    description: Plane-only global test defaults and provider/env registry characterization
    requirement: PLN-02
    verification:
      - kind: unit
        ref: "rtk corepack pnpm test -- apps/orchestrator-api/src/cards.test.ts apps/orchestrator-api/src/env.test.ts apps/orchestrator-api/src/queue.test.ts"
        status: pass
      - kind: other
        ref: "rtk bash -lc \"! grep -n 'CARD_EXTRA_PROVIDERS.*linear' vitest.setup.ts\""
        status: pass
    human_judgment: false
  - id: D2
    description: Plane workflow characterization for webhook intake, approval, auto-merge, scheduler cards, admin card history, and graph gateway behavior
    requirement: PLN-03
    verification:
      - kind: unit
        ref: "rtk corepack pnpm test -- apps/orchestrator-api/src/routes/webhooks.test.ts apps/orchestrator-api/src/scheduleWorker.test.ts apps/orchestrator-api/src/routes/admin.test.ts packages/graph/src/nodes/report.test.ts packages/graph/src/nodes/merging.test.ts packages/graph/src/nodes/autoMerge.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: Legacy row readability and Linear-to-Plane migration provenance characterization
    requirement: PLN-04
    verification:
      - kind: unit
        ref: "rtk corepack pnpm test -- apps/orchestrator-api/src/runs.test.ts apps/orchestrator-api/src/planeMigration.test.ts packages/plane/src/index.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: Plan-level focused test set and workspace build remain green
    requirement: PLN-03
    verification:
      - kind: unit
        ref: "rtk corepack pnpm test -- apps/orchestrator-api/src/cards.test.ts apps/orchestrator-api/src/env.test.ts apps/orchestrator-api/src/queue.test.ts apps/orchestrator-api/src/routes/webhooks.test.ts apps/orchestrator-api/src/scheduleWorker.test.ts apps/orchestrator-api/src/routes/admin.test.ts apps/orchestrator-api/src/runs.test.ts apps/orchestrator-api/src/planeMigration.test.ts packages/plane/src/index.test.ts packages/graph/src/nodes/report.test.ts packages/graph/src/nodes/merging.test.ts packages/graph/src/nodes/autoMerge.test.ts"
        status: pass
      - kind: other
        ref: "rtk corepack pnpm -r build"
        status: pass
    human_judgment: false

metrics:
  started: 2026-07-02T04:35:06Z
  completed: 2026-07-02T04:42:20Z
  duration_seconds: 434
  tasks: 3
---

# Phase 03 Plan 01: Plane Characterization Safety Net Summary

**Plane-only provider characterization with legacy Linear compatibility and migration provenance tests**

## Accomplishments

- Removed global Linear provider enablement from `vitest.setup.ts` while keeping Plane, database, Redis, GitHub, runner, and LLM dummy defaults.
- Added provider registry and env tests proving Plane-only defaults load without Linear secrets and explicit legacy opt-in still validates Linear requirements.
- Added queue characterization for provider-aware Plane jobs and explicit legacy Linear jobs.
- Extended Plane webhook coverage for auto-merge labels and archive cancellation, and added scheduler worker coverage for Plane scheduled cards and provider-aware jobs.
- Confirmed existing admin and graph tests cover protected Plane card history and provider-neutral Plane gateway comment/state behavior.
- Extended legacy row and migration tests to distinguish explicit Linear compatibility data from Linear provenance on migrated Plane cards.

## Task Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Establish Plane-only test defaults and provider registry characterization | f1f4531 | `vitest.setup.ts`, `apps/orchestrator-api/src/cards.test.ts`, `apps/orchestrator-api/src/env.test.ts`, `apps/orchestrator-api/src/queue.test.ts` |
| 2 | Characterize Plane intake, approval, scheduler, report, auto-merge, and card-run history | 002ac5a | `apps/orchestrator-api/src/routes/webhooks.test.ts`, `apps/orchestrator-api/src/scheduleWorker.test.ts` |
| 3 | Characterize legacy row readability and migration-only Plane provenance | aead6f3 | `apps/orchestrator-api/src/runs.test.ts`, `apps/orchestrator-api/src/planeMigration.test.ts`, `packages/plane/src/index.test.ts` |

## Verification

| Command | Result | Notes |
|---------|--------|-------|
| `rtk corepack pnpm test -- apps/orchestrator-api/src/cards.test.ts apps/orchestrator-api/src/env.test.ts apps/orchestrator-api/src/queue.test.ts` | Passed | Vitest ran the workspace suite; 72 files / 446 tests passed on Task 1 run. |
| `rtk bash -lc "! grep -n 'CARD_EXTRA_PROVIDERS.*linear' vitest.setup.ts"` | Passed | Used `grep` equivalent because `rg` is not installed in this environment. |
| `rtk corepack pnpm test -- apps/orchestrator-api/src/routes/webhooks.test.ts apps/orchestrator-api/src/scheduleWorker.test.ts apps/orchestrator-api/src/routes/admin.test.ts packages/graph/src/nodes/report.test.ts packages/graph/src/nodes/merging.test.ts packages/graph/src/nodes/autoMerge.test.ts` | Passed | Vitest ran the workspace suite; 73 files / 448 tests passed on final Task 2 run. |
| `rtk corepack pnpm test -- apps/orchestrator-api/src/runs.test.ts apps/orchestrator-api/src/planeMigration.test.ts packages/plane/src/index.test.ts` | Passed | Vitest ran the workspace suite; 73 files / 450 tests passed on Task 3 run. |
| `rtk corepack pnpm test -- apps/orchestrator-api/src/cards.test.ts apps/orchestrator-api/src/env.test.ts apps/orchestrator-api/src/queue.test.ts apps/orchestrator-api/src/routes/webhooks.test.ts apps/orchestrator-api/src/scheduleWorker.test.ts apps/orchestrator-api/src/routes/admin.test.ts apps/orchestrator-api/src/runs.test.ts apps/orchestrator-api/src/planeMigration.test.ts packages/plane/src/index.test.ts packages/graph/src/nodes/report.test.ts packages/graph/src/nodes/merging.test.ts packages/graph/src/nodes/autoMerge.test.ts` | Passed | Plan-level run passed with 73 files / 450 tests. |
| `rtk corepack pnpm -r build` | Passed | All workspace package builds completed. |
| `rtk corepack pnpm exec biome check <touched files>` | Passed | Touched-file checks passed for all files modified in this plan. |

## Deviations from Plan

None - plan executed exactly as written.

## Deferred Issues

- Full `rtk corepack pnpm lint -- <files>` did not honor the intended file scope and scanned untracked `.planning/research/.cache/*.json` files, failing on cache JSON formatting outside this plan. This was recorded in `.planning/phases/03-plane-only-provider-cutover/deferred-items.md`; touched-file Biome checks passed.

## Known Stubs

None. Stub scan found only normal empty arrays used as test collectors in existing tests.

## Threat Review

- No new runtime endpoints, auth paths, schema changes, package installs, or file access surfaces were introduced.
- Threat mitigations from the plan were covered by tests: global legacy provider defaults removed, Plane signature tests preserved, admin card history remains bearer-protected, and legacy row behavior remains explicit.

## Next Plan Readiness

Plans 03-02 through 03-05 can now change provider registry defaults, queue/worker behavior, webhook gating, schema defaults, dashboards, and docs against this characterization safety net.

## Self-Check: PASSED

- Found created files: `apps/orchestrator-api/src/queue.test.ts`, `apps/orchestrator-api/src/scheduleWorker.test.ts`, `.planning/phases/03-plane-only-provider-cutover/deferred-items.md`, `.planning/phases/03-plane-only-provider-cutover/03-01-SUMMARY.md`.
- Found task commits: `f1f4531`, `002ac5a`, `aead6f3`.
