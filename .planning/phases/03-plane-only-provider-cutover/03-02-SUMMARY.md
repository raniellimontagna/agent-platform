---
phase: 03-plane-only-provider-cutover
plan: "02"
subsystem: api
tags: [plane, linear-compatibility, provider-registry, env-validation, graph-enablements, vitest]

requires:
  - phase: 03-plane-only-provider-cutover
    provides: Plane-only test baseline and legacy compatibility characterization from 03-01
provides:
  - Plane-only active provider defaults for env validation and runtime card registry
  - Explicit legacy Linear extra-provider compatibility with retained package/dependency support
  - Agent graph provider coverage proving default Plane-only graph construction and legacy Linear opt-in
affects: [03-03, 03-04, 03-05, provider-cutover, graph-runtime, legacy-compatibility]

tech-stack:
  added: []
  patterns:
    - Active provider rejection at env and runtime registry boundaries
    - Local graph provider parsing helper in agent initialization
    - Mocked graph construction tests for provider enablement

key-files:
  created:
    - .planning/phases/03-plane-only-provider-cutover/03-02-SUMMARY.md
  modified:
    - apps/orchestrator-api/src/cards.ts
    - apps/orchestrator-api/src/cards.test.ts
    - apps/orchestrator-api/src/env.ts
    - apps/orchestrator-api/src/env.test.ts
    - apps/orchestrator-api/src/agent.ts
    - apps/orchestrator-api/src/agent.test.ts

key-decisions:
  - "CARD_PRIMARY_PROVIDER=linear is rejected at both env validation and direct runtime registry construction."
  - "CARD_EXTRA_PROVIDERS=linear remains the explicit legacy compatibility seam and keeps Plane as primary."
  - "Agent graph enablement remains env-driven but provider parsing is centralized in a local helper."

patterns-established:
  - "Provider cutover tests assert rejection of legacy primary config before accepting implementation."
  - "Graph provider enablement tests mock graph construction instead of requiring database checkpointer setup."
  - "Package support checks use grep fallback when rg is unavailable in the execution environment."

requirements-completed: [PLN-01, PLN-02, PLN-03]

coverage:
  - id: D1
    description: Provider registry and env validation reject Linear as an active primary provider while keeping Plane defaults
    requirement: PLN-02
    verification:
      - kind: unit
        ref: "rtk corepack pnpm test -- apps/orchestrator-api/src/cards.test.ts apps/orchestrator-api/src/env.test.ts apps/orchestrator-api/src/agent.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: Explicit legacy extra-provider config still registers Linear without making Linear primary
    requirement: PLN-02
    verification:
      - kind: unit
        ref: "apps/orchestrator-api/src/cards.test.ts#createRuntimeCards registers Linear only when explicit legacy env is supplied"
        status: pass
      - kind: unit
        ref: "apps/orchestrator-api/src/env.test.ts#loads explicit legacy provider env without changing the Plane primary default"
        status: pass
    human_judgment: false
  - id: D3
    description: Agent graph construction builds Plane by default and Linear only through explicit legacy extra-provider config
    requirement: PLN-03
    verification:
      - kind: unit
        ref: "apps/orchestrator-api/src/agent.test.ts#getAgent graph provider enablement"
        status: pass
    human_judgment: false
  - id: D4
    description: Linear package and SDK support remain installed for legacy/migration compatibility
    requirement: PLN-01
    verification:
      - kind: other
        ref: "rtk bash -lc \"grep -R -n -E '@agent-platform/linear|@linear/sdk' apps/orchestrator-api/package.json packages/linear/package.json pnpm-lock.yaml\""
        status: pass
    human_judgment: false

metrics:
  started: 2026-07-02T04:48:39Z
  completed: 2026-07-02T04:54:58Z
  duration_seconds: 379
  tasks: 2
  files_modified: 6
status: complete
---

# Phase 03 Plan 02: Plane-Only Provider Registry and Graph Cutover Summary

**Plane-only active provider config with explicit legacy Linear opt-in for registry and graph runtime**

## Performance

- **Duration:** 6m 19s
- **Started:** 2026-07-02T04:48:39Z
- **Completed:** 2026-07-02T04:54:58Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Added failing Task 1 tests proving `CARD_PRIMARY_PROVIDER=linear` was still accepted by env validation and runtime registry construction.
- Updated `env.ts` and `cards.ts` to reject Linear as active primary while preserving `CARD_EXTRA_PROVIDERS=linear` with legacy env.
- Added agent graph enablement tests proving default graph construction builds Plane only and explicit legacy config builds Linear as a secondary graph.
- Refactored graph provider parsing into a local helper so `agent.ts` uses one stable provider-list path.
- Confirmed `@agent-platform/linear` and `@linear/sdk` remain installed.

## Task Commits

Each task was committed atomically; TDD-style work produced separate test and implementation/refactor commits.

1. **Task 1: RED provider registry and env validation cutover** - `fc91501` (test)
2. **Task 1: GREEN provider registry and env validation cutover** - `a7fe1d1` (feat)
3. **Task 2: Graph provider enablement tests** - `f6fcc52` (test)
4. **Task 2: Graph provider parsing cleanup** - `0fe8a3e` (refactor)

## Files Created/Modified

- `apps/orchestrator-api/src/cards.ts` - Rejects Linear as active primary provider during runtime registry construction.
- `apps/orchestrator-api/src/cards.test.ts` - Covers Plane-only registry defaults, explicit legacy Linear opt-in, and Linear-primary rejection.
- `apps/orchestrator-api/src/env.ts` - Rejects `CARD_PRIMARY_PROVIDER=linear` during env loading.
- `apps/orchestrator-api/src/env.test.ts` - Covers Plane-only env loading, explicit legacy Linear opt-in, and Linear-primary rejection.
- `apps/orchestrator-api/src/agent.ts` - Uses a local helper to resolve enabled graph providers from primary and extra provider config.
- `apps/orchestrator-api/src/agent.test.ts` - Covers Plane-only graph defaults, explicit legacy Linear graph opt-in, and provider-specific gateway binding.
- `.planning/phases/03-plane-only-provider-cutover/03-02-SUMMARY.md` - Plan execution summary.

## Verification

| Command | Result | Notes |
|---------|--------|-------|
| `rtk corepack pnpm test -- apps/orchestrator-api/src/cards.test.ts apps/orchestrator-api/src/env.test.ts` | Failed before GREEN | RED evidence: 2 intended failures showed env and registry accepted `CARD_PRIMARY_PROVIDER=linear`. |
| `rtk corepack pnpm test -- apps/orchestrator-api/src/cards.test.ts apps/orchestrator-api/src/env.test.ts` | Passed | Task 1 GREEN: 73 files / 452 tests passed under Vitest selection behavior. |
| `rtk corepack pnpm test -- apps/orchestrator-api/src/agent.test.ts` | Passed before refactor | Task 2 target graph behavior was already present; new tests passed before `agent.ts` cleanup. |
| `rtk corepack pnpm test -- apps/orchestrator-api/src/agent.test.ts` | Passed | Task 2 post-refactor: 73 files / 454 tests passed under Vitest selection behavior. |
| `rtk corepack pnpm test -- apps/orchestrator-api/src/cards.test.ts apps/orchestrator-api/src/env.test.ts apps/orchestrator-api/src/agent.test.ts` | Passed | Plan-level run: 73 files / 454 tests passed. |
| `rtk bash -lc "rg -n '@agent-platform/linear\\|@linear/sdk' apps/orchestrator-api/package.json packages/linear/package.json pnpm-lock.yaml"` | Failed | `rg` is not installed in this environment. |
| `rtk bash -lc "grep -R -n -E '@agent-platform/linear\\|@linear/sdk' apps/orchestrator-api/package.json packages/linear/package.json pnpm-lock.yaml"` | Passed | Confirmed `@agent-platform/linear` and `@linear/sdk` references remain. |
| `rtk corepack pnpm exec biome check apps/orchestrator-api/src/cards.ts apps/orchestrator-api/src/cards.test.ts apps/orchestrator-api/src/env.ts apps/orchestrator-api/src/env.test.ts apps/orchestrator-api/src/agent.ts apps/orchestrator-api/src/agent.test.ts` | Passed | Checked 6 touched files; no fixes applied. |

## Decisions Made

- Active Linear primary config is invalid even if legacy Linear secrets are present.
- Legacy Linear remains available only through explicit extra-provider config, preserving old-data and migration compatibility.
- The graph provider parser stays local to `agent.ts`; no new provider abstraction was introduced.

## Deviations from Plan

### Auto-fixed Issues

None.

### TDD Gate Deviation

**1. Task 2 RED target was already green**
- **Found during:** Task 2 (RED-GREEN graph provider enablement cutover)
- **Issue:** The new graph provider enablement tests passed before production edits because `agent.ts` already built graphs from `CARD_PRIMARY_PROVIDER` plus `CARD_EXTRA_PROVIDERS`, and Phase 03 Plan 01 had already removed global Linear extra-provider defaults.
- **Fix:** Kept the tests as target coverage and limited production work to a local helper refactor that preserved behavior.
- **Files modified:** `apps/orchestrator-api/src/agent.ts`, `apps/orchestrator-api/src/agent.test.ts`
- **Verification:** `rtk corepack pnpm test -- apps/orchestrator-api/src/agent.test.ts`
- **Committed in:** `f6fcc52`, `0fe8a3e`

**Total deviations:** 1 TDD gate deviation; 0 auto-fixed code issues.
**Impact on plan:** Target graph behavior is covered and passing; no scope expansion or legacy deletion occurred.

## Issues Encountered

- `rg` is unavailable in this environment, so the exact static verification command failed with exit 127. The equivalent recursive `grep` command passed and confirmed Linear package references remain.

## Known Stubs

None. Stub scan found only ordinary local accumulator collections and the existing placeholder-secret guard text.

## Threat Review

- `T-03-02-01` mitigated: active legacy primary provider config is rejected in `env.ts` and `cards.ts`.
- `T-03-02-02` mitigated: graph construction tests prove Plane-only default graph enablement and explicit Linear legacy opt-in.
- `T-03-02-03` mitigated: legacy Linear secrets remain optional unless `CARD_EXTRA_PROVIDERS=linear` is explicitly configured.
- `T-03-02-SC` mitigated: no package installs or dependency removals occurred.

## Threat Flags

None. No new endpoints, auth paths, schema changes, package installs, or file access surfaces were introduced.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 03-03 can now cut queue, worker, and scheduler provider resolution against Plane-only active provider defaults while retaining explicit legacy compatibility.

## Self-Check: PASSED

- Found created summary: `.planning/phases/03-plane-only-provider-cutover/03-02-SUMMARY.md`.
- Found task commits: `fc91501`, `a7fe1d1`, `f6fcc52`, `0fe8a3e`.
- Verified touched-file tests and formatting checks passed.
