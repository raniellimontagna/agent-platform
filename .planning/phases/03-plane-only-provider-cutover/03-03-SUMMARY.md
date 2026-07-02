---
phase: 03-plane-only-provider-cutover
plan: "03"
subsystem: api
tags: [plane, linear-compatibility, bullmq, worker, scheduler, live-checkpoint]

requires:
  - phase: 03-plane-only-provider-cutover
    provides: Plane-only provider registry and explicit legacy provider config from 03-02
provides:
  - Queue and worker provider resolution using explicit or persisted run card identity
  - Scheduler-created Plane cards using Plane scheduled label config only
  - Read-only deployed BullMQ checkpoint evidence for legacy missing-provider jobs
affects: [03-04, 03-05, async-runtime, scheduler-runtime, provider-cutover]

tech-stack:
  added: []
  patterns:
    - Persisted run card identity resolves old BullMQ payloads before rejecting ambiguity
    - New async work fails clearly when provider/card identity cannot be resolved
    - Scheduler-created cards use Plane scheduled label config and do not fall back to Linear labels

key-files:
  created:
    - .planning/phases/03-plane-only-provider-cutover/03-03-SUMMARY.md
  modified:
    - apps/orchestrator-api/src/queue.ts
    - apps/orchestrator-api/src/queue.test.ts
    - apps/orchestrator-api/src/worker.ts
    - apps/orchestrator-api/src/worker.test.ts
    - apps/orchestrator-api/src/scheduleWorker.ts
    - apps/orchestrator-api/src/scheduleWorker.test.ts

key-decisions:
  - "Plan jobs resolve card identity from explicit payload fields or persisted run provider/card fields; missing unresolved identity throws instead of defaulting to Linear."
  - "Explicit legacy Linear plan jobs remain compatible when the job or persisted run identifies Linear."
  - "Scheduler-created cards use PLANE_SCHEDULED_LABEL_ID only; absent Plane scheduled label means no scheduled label is passed."
  - "Read-only deployed BullMQ inspection satisfies the queue checkpoint without draining or mutating jobs."

patterns-established:
  - "Worker paths load persisted run identity before choosing provider-specific card gateways."
  - "Research-to-landing continuations preserve the source run provider/card identity when creating follow-up work."
  - "Live queue checkpoints record deployed evidence separately from local test evidence."

requirements-completed: [PLN-02, PLN-03, PLN-04]

coverage:
  - id: D1
    description: Queue and worker reject unresolved missing-provider plan jobs instead of silently defaulting to Linear
    requirement: PLN-02
    verification:
      - kind: unit
        ref: "rtk corepack pnpm test -- apps/orchestrator-api/src/queue.test.ts apps/orchestrator-api/src/worker.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: Old missing-provider BullMQ jobs resolve through persisted run provider/card fields when present
    requirement: PLN-04
    verification:
      - kind: unit
        ref: "apps/orchestrator-api/src/queue.test.ts and apps/orchestrator-api/src/worker.test.ts legacy persisted-run cases"
        status: pass
      - kind: live-read-only
        ref: "LXC 201 BullMQ inspection at 2026-07-02T05:12:59Z"
        status: pass
    human_judgment: true
  - id: D3
    description: Scheduler-created cards use Plane scheduled label config only
    requirement: PLN-03
    verification:
      - kind: unit
        ref: "rtk corepack pnpm test -- apps/orchestrator-api/src/scheduleWorker.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: No active waiting, delayed, or paused legacy BullMQ plan jobs remain with missing cardProvider
    requirement: PLN-04
    verification:
      - kind: live-read-only
        ref: "BullMQ states waiting=0, delayed=0, paused=0; failed=4; missing-provider plan jobs in failed only"
        status: pass
    human_judgment: true

metrics:
  started: 2026-07-02T04:57:20Z
  completed: 2026-07-02T05:13:30Z
  duration_seconds: 970
  tasks: 3
  files_modified: 6
status: complete
---

# Phase 03 Plan 03: Queue, Worker, and Scheduler Cutover Summary

**Async runtime paths now use Plane-first explicit/persisted provider identity with old BullMQ compatibility.**

## Performance

- **Duration:** 16m 10s
- **Started:** 2026-07-02T04:57:20Z
- **Completed:** 2026-07-02T05:13:30Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- Added failing queue/worker tests for unresolved missing-provider jobs, old missing-provider jobs resolved from persisted run data, and explicit legacy Linear compatibility.
- Updated `queue.ts` and `worker.ts` so plan, resume, cost alert, approval comment, and research-to-landing paths use explicit or persisted provider/card identity instead of a silent Linear fallback.
- Added failing scheduler label coverage proving the previous legacy scheduled-label fallback was still active.
- Updated `scheduleWorker.ts` so scheduler-created cards use `PLANE_SCHEDULED_LABEL_ID` when configured and pass no scheduled label when it is absent.
- Completed the live BullMQ checkpoint through read-only inspection on LXC 201.

## Task Commits

1. **Task 1: RED queue and worker provider resolution tests** - `c6e9f07` (test)
2. **Task 1: GREEN queue and worker provider resolution** - `5c32ef0` (feat)
3. **Task 2: RED scheduler Plane scheduled-label test** - `aef1582` (test)
4. **Task 2: GREEN scheduler Plane scheduled-label behavior** - `9e267f6` (feat)

## Files Created/Modified

- `apps/orchestrator-api/src/queue.ts` - Resolves plan job card identity from explicit payload fields or persisted run fields; rejects unresolved ambiguity.
- `apps/orchestrator-api/src/queue.test.ts` - Covers explicit Plane, explicit Linear, persisted-run compatibility, and missing-provider rejection.
- `apps/orchestrator-api/src/worker.ts` - Uses persisted run card identity across plan/resume/comment/cost/continuation paths.
- `apps/orchestrator-api/src/worker.test.ts` - Covers persisted provider/card resolution and ambiguous legacy row rejection.
- `apps/orchestrator-api/src/scheduleWorker.ts` - Uses Plane scheduled label config only for scheduler-created cards.
- `apps/orchestrator-api/src/scheduleWorker.test.ts` - Covers Plane scheduled label presence, absence, and legacy label non-substitution.
- `.planning/phases/03-plane-only-provider-cutover/03-03-SUMMARY.md` - Plan execution and checkpoint summary.

## Verification

| Command | Result | Notes |
|---------|--------|-------|
| `rtk corepack pnpm test -- apps/orchestrator-api/src/queue.test.ts apps/orchestrator-api/src/worker.test.ts` | Failed before GREEN | RED evidence: 7 intended provider-resolution failures. |
| `rtk corepack pnpm test -- apps/orchestrator-api/src/queue.test.ts apps/orchestrator-api/src/worker.test.ts` | Passed | Task 1 GREEN: 74 files / 463 tests passed under Vitest selection behavior. |
| `rtk corepack pnpm test -- apps/orchestrator-api/src/scheduleWorker.test.ts` | Failed before GREEN | RED evidence: legacy Linear label fallback was still used. |
| `rtk corepack pnpm test -- apps/orchestrator-api/src/scheduleWorker.test.ts` | Passed | Task 2 GREEN: 74 files / 464 tests passed under Vitest selection behavior. |
| `rtk corepack pnpm test -- apps/orchestrator-api/src/queue.test.ts apps/orchestrator-api/src/worker.test.ts apps/orchestrator-api/src/scheduleWorker.test.ts` | Passed | Plan-level run: 74 files / 464 tests passed. |
| `rtk bash -lc "! rg -n \"\\?\\? 'linear'|\\?\\? \\\"linear\\\"|LINEAR_SCHEDULED_LABEL_ID\" apps/orchestrator-api/src/queue.ts apps/orchestrator-api/src/worker.ts apps/orchestrator-api/src/scheduleWorker.ts"` | Passed via grep fallback | `rg` was unavailable in the executor environment; equivalent grep found no forbidden fallback. |
| `rtk corepack pnpm exec biome check <touched files>` | Passed | Checked all six touched source/test files. |

## Live BullMQ Checkpoint

Task 3 required deployed Redis/BullMQ inspection before treating fallback removal as deployment-ready.

Read-only evidence collected from LXC 201:

- `pct status 201` reported the LXC running.
- `orchestrator-redis-1` was healthy and `orchestrator-api-1` was running.
- BullMQ state counts at `2026-07-02T05:12:59Z`:
  - waiting: 0
  - delayed: 0
  - failed: 4
  - paused: 0
- Missing-provider `plan` payloads were found only in `failed` jobs:
  - job `95`, run `bc862f50-6c82-4999-b7e4-dd0e60b3e9ac`, `issueId` present, `cardProvider` missing, failed after 2 attempts with duplicate-key error.
  - job `96`, run `76cf6388-9bce-45e1-b3d9-d612f5d856dd`, `issueId` present, `cardProvider` missing, failed after 2 attempts with connection error.
- The referenced Postgres rows both have persisted compatibility fields:
  - `card_provider=linear`
  - `card_id=9958f3cc-67b7-448d-8bba-42195142a174`
  - `card_identifier=MAC-86`
  - `status=failed`

No Redis/BullMQ or Postgres mutation was performed. There are no active waiting, delayed, or paused missing-provider plan jobs that would be broken by the new runtime behavior. The two failed legacy jobs are compatible if intentionally retried because persisted provider/card fields exist.

## Decisions Made

- Missing provider data is not a reason to infer Linear for new work.
- Old queued jobs can continue only when explicit job fields or persisted run fields prove the provider/card identity.
- Failed historical jobs with persisted provider/card identity do not block the repository cutover, but should remain visible in deployment notes if an operator decides to retry them.

## Deviations from Plan

### Auto-fixed Issues

None.

### TDD Gate Deviations

None. Both target behavior sets failed before implementation and passed after production edits.

## Issues Encountered

- `rg` was unavailable in the executor shell, so an equivalent grep-based static check was used.
- The deployed orchestrator container currently reports `CARD_EXTRA_PROVIDERS=linear`; this is not part of the BullMQ checkpoint, but it is an input to Plan 03-04's deployed env/webhook exposure checkpoint.

## Known Stubs

None.

## Threat Review

- `T-03-03-01` mitigated: `queue.ts` and `worker.ts` reject unresolved missing provider/card identity instead of inferring Linear.
- `T-03-03-02` mitigated: old BullMQ payloads are compatible through persisted run identity, and live queue state was inspected read-only.
- `T-03-03-03` mitigated: scheduler-created cards use Plane scheduled label config only.
- `T-03-03-SC` mitigated: no package installs, dependency removals, route removals, or schema deletion occurred.

## Threat Flags

None. No new endpoints, auth paths, schema changes, package installs, or file access surfaces were introduced.

## User Setup Required

None for the BullMQ checkpoint. Plan 03-04 still must handle deployed env/webhook exposure; current deployed env inspection found `CARD_EXTRA_PROVIDERS=linear`.

## Next Phase Readiness

Plan 03-04 can now gate legacy webhook behavior and update env examples. Its live checkpoint must decide whether the deployed `CARD_EXTRA_PROVIDERS=linear` setting is intentional legacy compatibility or should be removed before deploy cutover completion.

## Self-Check: PASSED

- Found created summary: `.planning/phases/03-plane-only-provider-cutover/03-03-SUMMARY.md`.
- Found task commits: `c6e9f07`, `5c32ef0`, `aef1582`, `9e267f6`.
- Verified focused tests, static checks, and touched-file formatting passed.
- Verified deployed BullMQ checkpoint read-only and recorded exact legacy failed job evidence.
