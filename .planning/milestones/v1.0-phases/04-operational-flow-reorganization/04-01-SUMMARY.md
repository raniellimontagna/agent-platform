---
phase: 04-operational-flow-reorganization
plan: "01"
subsystem: operational-flow-docs
tags: [plane, bullmq, worker-code, scheduler, mission-control, eval-harness, artifacts]

requires:
  - phase: 03-plane-only-provider-cutover
    provides: Plane-only active provider cutover and legacy Linear compatibility rules
provides:
  - Plane-first delivery flow documentation from webhook intake through final Plane report
  - Research-to-landing two-run workflow contract with trigger, owners, artifacts, and failure behavior
  - Active scheduler runbook and operational surface ownership/status table
  - Local verification anchors for delivery, continuation, scheduler, Mission Control, eval, skills, and artifacts
affects: [phase-04, phase-05, phase-06, operator-docs, scheduler, mission-control]

tech-stack:
  added: []
  patterns:
    - Documentation claims cite owning source files plus focused local test commands.
    - Operational surfaces are marked active, legacy, or deferred in current docs.
    - Existing tests are used as evidence for docs-only flow alignment.

key-files:
  created:
    - docs/runbooks/scheduler.md
    - .planning/phases/04-operational-flow-reorganization/04-01-SUMMARY.md
  modified:
    - docs/CURRENT.md
    - docs/ARCHITECTURE.md
    - docs/decisions/FLOW-agent-workflow.md
    - docs/runbooks/webhook-tailscale.md
    - docs/runbooks/research-to-landing-workflow.md
    - docs/runbooks/data-collector-agent.md
    - docs/runbooks/landing-page-agent.md
    - docs/runbooks/mission-control.md
    - docs/runbooks/eval-harness.md

key-decisions:
  - "Keep 04-01 documentation-only: no route, graph, worker, registry, or package changes."
  - "Use `docs/CURRENT.md` as the active surface status map because 04-02 owns runbook index/source-of-truth cleanup."
  - "Treat `apps/worker-code/src/routes/jobs.ts` as a static Worker API anchor while `runJob.test.ts` covers runner behavior."

patterns-established:
  - "Every current flow claim gets a source-file and focused-test anchor."
  - "Deferred operator controls are documented explicitly instead of implied by Mission Control."

requirements-completed: [FLOW-01, FLOW-02, FLOW-03]

coverage:
  - id: D1
    description: Plane-first delivery flow is traceable from Plane webhook through run creation, BullMQ, worker-code runner, PR/merge, and final Plane report
    requirement: FLOW-01
    verification:
      - kind: unit
        ref: "rtk corepack pnpm vitest run apps/orchestrator-api/src/routes/webhooks.test.ts apps/orchestrator-api/src/runs.test.ts apps/orchestrator-api/src/queue.test.ts apps/orchestrator-api/src/worker.test.ts apps/worker-code/src/executor/runJob.test.ts packages/graph/src/nodes/report.test.ts packages/graph/src/nodes/merging.test.ts"
        status: pass
      - kind: other
        ref: "rtk rg worker-code route/runner anchors in docs/CURRENT.md docs/ARCHITECTURE.md docs/decisions/FLOW-agent-workflow.md"
        status: pass
    human_judgment: false
  - id: D2
    description: Research-to-landing is documented as a composed two-run workflow with trigger, agents, inputs, artifacts, final report, and failure behavior
    requirement: FLOW-02
    verification:
      - kind: unit
        ref: "rtk corepack pnpm vitest run apps/orchestrator-api/src/workflows.test.ts apps/orchestrator-api/src/worker.test.ts apps/orchestrator-api/src/missionScenarios.test.ts apps/orchestrator-api/src/missionTimeline.test.ts packages/graph/src/nodes/coder.test.ts apps/worker-code/src/executor/agentSkills.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: Scheduler, Mission Control, eval harness, registry/skills, and artifact store have active/legacy/deferred ownership status
    requirement: FLOW-03
    verification:
      - kind: unit
        ref: "rtk corepack pnpm vitest run apps/orchestrator-api/src/scheduleWorker.test.ts apps/orchestrator-api/src/routes/schedules.test.ts apps/orchestrator-api/src/routes/admin.test.ts apps/orchestrator-api/src/artifacts.test.ts apps/orchestrator-api/src/routes/artifacts.test.ts apps/worker-code/src/eval/runEval.test.ts apps/worker-code/src/eval/roleQuality.test.ts"
        status: pass
      - kind: other
        ref: "rtk rg scheduler, Mission Control, eval, and artifact owner anchors in current docs/runbooks"
        status: pass
    human_judgment: false

metrics:
  started: 2026-07-02T13:34:45Z
  completed: 2026-07-02T13:41:22Z
  duration_seconds: 397
  tasks: 3
  files_modified: 10
status: complete
---

# Phase 04 Plan 01: Operational Flow Documentation Summary

**Plane-first delivery, research-to-landing continuation, and scheduler ownership are now documented with local source/test evidence.**

## Performance

- **Duration:** 6m37s
- **Started:** 2026-07-02T13:34:45Z
- **Completed:** 2026-07-02T13:41:22Z
- **Tasks:** 3
- **Files modified:** 10

## Accomplishments

- Updated current flow docs to trace Plane intake through run persistence, BullMQ, worker-code `/jobs`, `runJob`, critic/recode, PR/merge, and final Plane report.
- Documented research-to-landing as a two-run workflow with `workflow:landing-page`, `data-collector-agent`, `landing-page-agent`, artifact expectations, final report behavior, and rollback/failure rules.
- Added `docs/runbooks/scheduler.md` and surfaced active/legacy/deferred ownership for scheduler, Mission Control, eval harness, registry/skills, artifact store, and Linear intake.

## Task Commits

1. **Task 1: Consolidate the Plane-first delivery flow narrative** - `c1e9698` (docs)
2. **Task 2: Document the research-to-landing continuation contract** - `8d766d9` (docs)
3. **Task 3: Add scheduler ownership and operational surface status** - `ef09c3b` (docs)

## Files Created/Modified

- `docs/runbooks/scheduler.md` - New active scheduler runbook with owner paths, operational checks, tests, and deferred gaps.
- `docs/CURRENT.md` - Current flow evidence anchors, scheduler link, and operational surface status table.
- `docs/ARCHITECTURE.md` - Plane-first flow evidence table, including worker-code route/runner anchors.
- `docs/decisions/FLOW-agent-workflow.md` - Delivery-flow narrative and focused source/test evidence.
- `docs/runbooks/webhook-tailscale.md` - Plane-only public exposure flow and local verification gate.
- `docs/runbooks/research-to-landing-workflow.md` - Two-run workflow contract, artifacts, failure behavior, and local evidence.
- `docs/runbooks/data-collector-agent.md` - Research agent ownership, output contract, and verification.
- `docs/runbooks/landing-page-agent.md` - Landing continuation ownership, input/output contract, and verification.
- `docs/runbooks/mission-control.md` - Active read-only owner/status table plus artifact and scheduler visibility boundaries.
- `docs/runbooks/eval-harness.md` - Eval harness owner/status table.

## Verification

| Command | Result | Notes |
|---------|--------|-------|
| `rtk corepack pnpm exec biome check docs/CURRENT.md docs/ARCHITECTURE.md docs/decisions/FLOW-agent-workflow.md docs/runbooks/webhook-tailscale.md --no-errors-on-unmatched` | Passed | Biome reported 0 matching files and no errors for Markdown docs. |
| `rtk corepack pnpm vitest run apps/orchestrator-api/src/routes/webhooks.test.ts apps/orchestrator-api/src/runs.test.ts apps/orchestrator-api/src/queue.test.ts apps/orchestrator-api/src/worker.test.ts apps/worker-code/src/executor/runJob.test.ts packages/graph/src/nodes/report.test.ts packages/graph/src/nodes/merging.test.ts` | Passed | 7 files / 62 tests passed. |
| Task 1 `rtk rg -q` worker-code route/runner anchors | Passed | Used direct `rtk rg` from repo root; no subshell fallback needed. |
| `rtk corepack pnpm exec biome check docs/runbooks/research-to-landing-workflow.md docs/runbooks/data-collector-agent.md docs/runbooks/landing-page-agent.md docs/runbooks/mission-control.md --no-errors-on-unmatched` | Passed | Biome reported 0 matching files and no errors for Markdown docs. |
| `rtk corepack pnpm vitest run apps/orchestrator-api/src/workflows.test.ts apps/orchestrator-api/src/worker.test.ts apps/orchestrator-api/src/missionScenarios.test.ts apps/orchestrator-api/src/missionTimeline.test.ts packages/graph/src/nodes/coder.test.ts apps/worker-code/src/executor/agentSkills.test.ts` | Passed | 6 files / 33 tests passed. |
| `rtk corepack pnpm exec biome check docs/CURRENT.md docs/runbooks/scheduler.md docs/runbooks/mission-control.md docs/runbooks/eval-harness.md --no-errors-on-unmatched` | Passed | Biome reported 0 matching files and no errors for Markdown docs. |
| `rtk corepack pnpm vitest run apps/orchestrator-api/src/scheduleWorker.test.ts apps/orchestrator-api/src/routes/schedules.test.ts apps/orchestrator-api/src/routes/admin.test.ts apps/orchestrator-api/src/artifacts.test.ts apps/orchestrator-api/src/routes/artifacts.test.ts apps/worker-code/src/eval/runEval.test.ts apps/worker-code/src/eval/roleQuality.test.ts` | Passed | 7 files / 52 tests passed. |
| Task 3 static `rtk rg -q` scheduler/admin/eval/artifact anchors | Passed | Used direct `rtk rg` from repo root; no subshell fallback needed. |
| Full 04-01 plan-level Biome docs command | Passed | Biome reported 0 matching files and no errors for Markdown docs. |
| Full 04-01 plan-level Vitest command | Passed | 19 files / 141 tests passed. |
| Full 04-01 plan-level static `rtk rg -q` checks | Passed | Worker route/runner, Mission Control, eval, artifact, and scheduler anchors found. |

## Decisions Made

- Kept implementation strictly to documentation and runbook updates; no production code, registry, package, or test files were edited.
- Put 04-01 surface ownership status in `docs/CURRENT.md` because the runbook index and source-of-truth normalization are explicitly scoped to 04-02.
- Documented the lack of a dedicated `jobs.ts` route test as an evidence boundary, with `runJob.test.ts` covering runner behavior.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- `rtk` continued to warn that project filters are untrusted. This did not block execution and was not changed.
- Biome accepted the requested docs checks but reported 0 matching Markdown files. The exact plan commands were run and static `rtk rg` checks supplied the docs-specific evidence.

## Known Stubs

None. Stub scan across all 04-01 changed docs found no `TODO`, `FIXME`, `placeholder`, `coming soon`, `not available`, or hardcoded empty-value patterns.

## Threat Review

- `T-04-01-01` mitigated: webhook runbook now keeps public exposure to `/webhooks/plane` and names HMAC/test evidence.
- `T-04-01-02` mitigated: Mission Control remains documented as read-only and bearer-protected; launch/replay/approval/cancel controls are deferred.
- `T-04-01-03` mitigated: research and scheduler docs point to env/secrets owners and avoid copying secret values.
- `T-04-01-SC` mitigated: no package installs or dependency changes occurred.

No new runtime endpoint, auth path, schema change, or file-access trust boundary was introduced by this docs-only plan; no threat flags were added.

## Deferred Gaps

- `docs/runbooks/README.md`, `docs/README.md`, `docs/HISTORICAL.md`, `docs/runbooks/agent-skills.md`, registry normalization, and broader source-of-truth cleanup remain in 04-02 scope and were intentionally not edited.
- Scheduler cross-process duplicate fire prevention remains a documented low-probability runtime hardening gap in `apps/orchestrator-api/src/schedules.ts`.
- Mission Control launch/replay/approval/cancel controls remain deferred until a future UI/control slice adds explicit tests.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

04-02 can proceed with naming/source-of-truth normalization. The 04-01 docs now provide the active flow and ownership evidence that 04-02 can link from the runbook/documentation indexes.

## Self-Check: PASSED

- Found created file: `docs/runbooks/scheduler.md`.
- Found summary: `.planning/phases/04-operational-flow-reorganization/04-01-SUMMARY.md`.
- Found modified docs: `docs/CURRENT.md`, `docs/ARCHITECTURE.md`, `docs/decisions/FLOW-agent-workflow.md`, `docs/runbooks/webhook-tailscale.md`, `docs/runbooks/research-to-landing-workflow.md`, `docs/runbooks/data-collector-agent.md`, `docs/runbooks/landing-page-agent.md`, `docs/runbooks/mission-control.md`, and `docs/runbooks/eval-harness.md`.
- Found task commits: `c1e9698`, `8d766d9`, `ef09c3b`.
