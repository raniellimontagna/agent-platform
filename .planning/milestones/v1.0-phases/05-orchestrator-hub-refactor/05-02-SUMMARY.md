---
phase: 05-orchestrator-hub-refactor
plan: "02"
subsystem: orchestrator-webhooks
tags: [hono, plane, webhooks, hmac, bullmq, vitest]

requires:
  - phase: 05-orchestrator-hub-refactor
    provides: Shared route helper extraction and Phase 5 webhook refactor guardrails from 05-01
provides:
  - Shared `verifySignature` and `verifyPlaneSignature` helpers for HMAC webhook checks
  - Plane webhook normalization for event, card, label, previous-label, identifier, and removal action data
  - Webhook run action seam for ai-ready enqueue, approval resume, and Plane removal cancellation
  - Thin `/webhooks/plane` and legacy-gated `/webhooks/linear` route orchestration
affects: [phase-05, orchestrator-api, webhooks, plane-intake, bullmq-run-actions]

tech-stack:
  added: []
  patterns:
    - Public Hono routes keep HTTP parsing/status/JSON ownership while focused modules own signature, Plane normalization, and run actions.
    - `cardWebhook.labelJustAdded` remains the source owner for label transition semantics.
    - Legacy Linear webhook behavior stays behind `CARD_EXTRA_PROVIDERS=linear`.

key-files:
  created:
    - apps/orchestrator-api/src/webhookSignature.ts
    - apps/orchestrator-api/src/webhookSignature.test.ts
    - apps/orchestrator-api/src/planeWebhook.ts
    - apps/orchestrator-api/src/planeWebhook.test.ts
    - apps/orchestrator-api/src/webhookRunActions.ts
    - apps/orchestrator-api/src/webhookRunActions.test.ts
    - .planning/phases/05-orchestrator-hub-refactor/05-02-SUMMARY.md
  modified:
    - apps/orchestrator-api/src/routes/webhooks.ts

key-decisions:
  - "Keep `/webhooks/plane` as the active intake route while moving HMAC checks, Plane parsing, and run transitions behind local seams."
  - "Keep `/webhooks/linear` present and gated by `CARD_EXTRA_PROVIDERS=linear`; do not make Linear an active provider default."
  - "Keep `cardWebhook.labelJustAdded` as the transition source owner instead of duplicating label-diff semantics."

patterns-established:
  - "Webhook seam tests are written RED first, then the route imports move in GREEN commits."
  - "Run actions return plain result objects; routes wrap them in existing JSON/status contracts."

requirements-completed: [REF-02, VER-01]

coverage:
  - id: D1
    description: "Webhook signature and Plane payload parsing live behind focused modules while preserving HMAC, no-secret development acceptance, production rejection, event variants, labels, identifiers, previous-label variants, and removal actions."
    requirement: REF-02
    verification:
      - kind: unit
        ref: "rtk corepack pnpm vitest run apps/orchestrator-api/src/webhookSignature.test.ts apps/orchestrator-api/src/planeWebhook.test.ts"
        status: pass
      - kind: unit
        ref: "rtk corepack pnpm vitest run apps/orchestrator-api/src/routes/webhooks.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Webhook run transitions live behind `webhookRunActions.ts` and preserve duplicate skips, paused/cost guards, unique-violation skips, run creation fields, queue payloads, priorities, approval resume, and removal cancellation."
    requirement: REF-02
    verification:
      - kind: unit
        ref: "rtk corepack pnpm vitest run apps/orchestrator-api/src/webhookRunActions.test.ts"
        status: pass
      - kind: unit
        ref: "rtk corepack pnpm vitest run apps/orchestrator-api/src/routes/webhooks.test.ts apps/orchestrator-api/src/cardWebhook.test.ts apps/orchestrator-api/src/runs.test.ts apps/orchestrator-api/src/queue.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "`/webhooks/plane` remains active and `/webhooks/linear` remains legacy compatibility only, with no package, schema, worker, eval, deploy, or provider-default changes."
    requirement: VER-01
    verification:
      - kind: other
        ref: "rtk rg -F -q \"webhooks.post('/webhooks/plane'\" apps/orchestrator-api/src/routes/webhooks.ts"
        status: pass
      - kind: other
        ref: "rtk rg -F -q \"webhooks.post('/webhooks/linear'\" apps/orchestrator-api/src/routes/webhooks.ts"
        status: pass
      - kind: other
        ref: "rtk rg -q \"CARD_EXTRA_PROVIDERS\" apps/orchestrator-api/src/routes/webhooks.ts"
        status: pass
      - kind: other
        ref: "rtk git diff --exit-code -- package.json pnpm-lock.yaml apps/orchestrator-api/package.json"
        status: pass
    human_judgment: false

metrics:
  started: 2026-07-02T15:08:21Z
  completed: 2026-07-02T15:18:07Z
  duration_seconds: 586
  tasks: 2
  files_modified: 7
status: complete
---

# Phase 05 Plan 02: Webhook Seam Refactor Summary

**Plane webhook intake now delegates HMAC checks, payload normalization, and run transitions to focused orchestrator-local seams.**

## Performance

- **Duration:** 9m46s
- **Started:** 2026-07-02T15:08:21Z
- **Completed:** 2026-07-02T15:18:07Z
- **Tasks:** 2
- **Files modified:** 7 implementation/test files

## Accomplishments

- Added `webhookSignature.ts` for shared HMAC verification and Plane no-secret development behavior.
- Added `planeWebhook.ts` for Plane event, card, label, previous-label, identifier, and removal normalization.
- Added `webhookRunActions.ts` for ai-ready enqueueing, approval resume, and Plane removal cancellation.
- Kept `routes/webhooks.ts` as the Hono intake owner for raw body reads, signature checks, action selection, JSON bodies, statuses, skip logging, and legacy Linear compatibility gating.

## Task Commits

1. **Task 1 RED: Extract signature and Plane payload helpers** - `e0a5d75` (test)
2. **Task 1 GREEN: Extract signature and Plane payload helpers** - `9ceafef` (feat)
3. **Task 2 RED: Extract webhook run transition actions** - `97bcfa9` (test)
4. **Task 2 GREEN: Extract webhook run transition actions** - `358f1c3` (feat)

## Files Created/Modified

- `apps/orchestrator-api/src/webhookSignature.ts` - Shared `verifySignature` and `verifyPlaneSignature` helpers.
- `apps/orchestrator-api/src/webhookSignature.test.ts` - RED/GREEN coverage for missing, mismatched, valid, development no-secret, and production no-secret signature behavior.
- `apps/orchestrator-api/src/planeWebhook.ts` - Plane webhook normalization and removal action detection.
- `apps/orchestrator-api/src/planeWebhook.test.ts` - RED/GREEN coverage for `work_item`, `issue`, event header, label, id, previous-label, fallback identifier, and removal variants.
- `apps/orchestrator-api/src/webhookRunActions.ts` - Run transition actions for ai-ready, approval, and Plane removal.
- `apps/orchestrator-api/src/webhookRunActions.test.ts` - RED/GREEN coverage for duplicate, pause, cost, unique-violation, queue payload, priority, approval resume, and cancellation behavior.
- `apps/orchestrator-api/src/routes/webhooks.ts` - Imports the new seams while preserving public route contracts.

## Verification

| Command | Result | Notes |
|---------|--------|-------|
| RED Task 1 `rtk corepack pnpm vitest run apps/orchestrator-api/src/webhookSignature.test.ts apps/orchestrator-api/src/planeWebhook.test.ts` | Failed as expected | Failed on missing `./webhookSignature.js` and `./planeWebhook.js` before implementation. |
| GREEN Task 1 focused command | Passed | 2 files / 18 tests passed. |
| Task 1 route command `rtk corepack pnpm vitest run apps/orchestrator-api/src/routes/webhooks.test.ts` | Passed | 1 file / 19 tests passed. |
| Task 1 `rtk corepack pnpm --filter @agent-platform/orchestrator-api typecheck` | Passed | `tsc --noEmit` exited 0. |
| Task 1 static route checks | Passed | `/webhooks/plane`, `/webhooks/linear`, and `CARD_EXTRA_PROVIDERS` remain present. |
| RED Task 2 `rtk corepack pnpm vitest run apps/orchestrator-api/src/webhookRunActions.test.ts` | Failed as expected | Failed on missing `./webhookRunActions.js` before implementation. |
| GREEN Task 2 focused/regression command | Passed | 5 files / 46 tests passed after implementation and formatting. |
| Task 2 `rtk corepack pnpm --filter @agent-platform/orchestrator-api typecheck` | Passed | `tsc --noEmit` exited 0 after explicit approval result typing. |
| Task 2 `rtk rg -q "JOB_PRIORITY.plan" apps/orchestrator-api/src/webhookRunActions.ts` | Passed | Plan priority remains owned in action seam. |
| Task 2 `rtk rg -q "JOB_PRIORITY.resume" apps/orchestrator-api/src/webhookRunActions.ts` | Passed | Resume priority remains owned in action seam. |
| Task 2 `rtk git diff --exit-code -- package.json pnpm-lock.yaml apps/orchestrator-api/package.json` | Passed | Package files unchanged. |
| Formatting check `rtk corepack pnpm exec biome check ...` | Passed | 7 changed TS files checked after formatting fixes. |
| Final `rtk corepack pnpm vitest run apps/orchestrator-api/src/webhookSignature.test.ts apps/orchestrator-api/src/planeWebhook.test.ts apps/orchestrator-api/src/webhookRunActions.test.ts apps/orchestrator-api/src/routes/webhooks.test.ts apps/orchestrator-api/src/cardWebhook.test.ts apps/orchestrator-api/src/runs.test.ts apps/orchestrator-api/src/queue.test.ts` | Passed | 7 files / 64 tests passed. |
| Final `rtk corepack pnpm --filter @agent-platform/orchestrator-api typecheck` | Passed | `tsc --noEmit` exited 0. |
| Final static route/package checks | Passed | `/webhooks/plane`, `/webhooks/linear`, `CARD_EXTRA_PROVIDERS`, and package-file no-diff checks all exited 0. |

## Decisions Made

- Kept all new modules under `apps/orchestrator-api/src/` and added no packages.
- Kept `/webhooks/linear` in place as a legacy-gated compatibility route; the active route remains `/webhooks/plane`.
- Kept `labelJustAdded` in `cardWebhook.ts` as the only label transition owner used by the route.
- Kept routes responsible for wrapping action results in the existing JSON/status contracts instead of moving HTTP response ownership into action modules.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added explicit approval action result typing**
- **Found during:** Task 2 GREEN typecheck
- **Issue:** TypeScript inferred the successful approval result as allowing `reason?: undefined`, so `skipPlaneWebhook(result.reason, ...)` failed typecheck after extraction.
- **Fix:** Added an explicit `ApprovalActionResult` union return type for `handleApprovalCard`.
- **Files modified:** `apps/orchestrator-api/src/webhookRunActions.ts`
- **Verification:** `rtk corepack pnpm --filter @agent-platform/orchestrator-api typecheck` passed, and Task 2 tests were rerun.
- **Committed in:** `358f1c3`

**Total deviations:** 1 auto-fixed blocking issue.
**Impact on plan:** No scope expansion; the fix was required for the extracted seam to typecheck.

## Issues Encountered

- `rtk` warned that project filters are untrusted on project commands. The warning did not block execution and was not changed.
- Biome requested formatting for two long lines after Task 2 extraction. Formatting was applied without behavior changes and the focused Biome check passed.

## Dirty Worktree Handling

- Preserved unrelated pre-existing untracked paths: `.planning/PROJECT.md`, `.planning/config.json`, `.planning/phases/01-bootstrap-and-architectural-inventory/`, `.planning/phases/02-living-documentation-and-historical-archive/`, `.planning/research/`, and `docs/superpowers/README.md`.
- Staged and committed only 05-02 implementation/test files during task commits.

## Known Stubs

None. Stub scan across the changed 05-02 files found no TODO/FIXME/placeholder/coming soon/not available patterns or hardcoded empty-value UI stubs. The existing default empty object in `skipPlaneWebhook` is a logging context default, not a UI/data-source stub.

## Threat Review

- `T-05-02-01` mitigated: `webhookSignature.ts` preserves HMAC verification, timing-safe comparison, length guard, Plane no-secret development acceptance, and production rejection with focused tests.
- `T-05-02-02` mitigated: `planeWebhook.ts` normalizes Plane event/card/labels/previous labels, and `routes/webhooks.ts` still uses `labelJustAdded` for transitions.
- `T-05-02-03` mitigated: `webhookRunActions.ts` tests cover duplicate active runs, paused agents, daily budget exhaustion, unique-violation duplicates, queue payloads, and priorities.
- `T-05-02-04` mitigated: `/webhooks/linear` remains present but gated by `CARD_EXTRA_PROVIDERS=linear`; no provider defaults changed.
- `T-05-02-SC` mitigated: no package installs, dependency upgrades, package-file changes, schema changes, worker/eval/codegen changes, deploy config changes, or provider env default changes occurred.

No unplanned endpoint, auth path, schema change, file-access boundary, package change, deployment change, worker/eval trust-boundary change, or provider-default change was introduced.

## TDD Gate Compliance

- Task 1 RED commit present: `e0a5d75`; RED command failed on missing `./webhookSignature.js` and `./planeWebhook.js`.
- Task 1 GREEN commit present after RED: `9ceafef`; focused tests, route tests, typecheck, and static route checks passed.
- Task 2 RED commit present: `97bcfa9`; RED command failed on missing `./webhookRunActions.js`.
- Task 2 GREEN commit present after RED: `358f1c3`; action tests, route/run/queue tests, typecheck, and package/static checks passed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

05-03 can proceed to admin/Mission Control extraction. 05-02 did not touch worker/eval/codegen/data-collector internals, schema/deploy/provider env files, package files, Mission Control files, or Phase 05 plans other than this summary.

## Self-Check: PASSED

- Found summary: `.planning/phases/05-orchestrator-hub-refactor/05-02-SUMMARY.md`.
- Found created implementation/test files: `apps/orchestrator-api/src/webhookSignature.ts`, `apps/orchestrator-api/src/webhookSignature.test.ts`, `apps/orchestrator-api/src/planeWebhook.ts`, `apps/orchestrator-api/src/planeWebhook.test.ts`, `apps/orchestrator-api/src/webhookRunActions.ts`, and `apps/orchestrator-api/src/webhookRunActions.test.ts`.
- Found task commits: `e0a5d75`, `9ceafef`, `97bcfa9`, and `358f1c3`.
