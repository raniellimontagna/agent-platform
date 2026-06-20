# Task 7 Report

## What I Implemented

- Updated `apps/orchestrator-api/src/agent.ts` to construct a runtime `cards` registry with `createRuntimeCards(env)`, expose it on the runtime `Agent`, and pass `cards.primary` into `buildAgentGraph`.
- Switched graph completion state selection to `env.PLANE_DONE_STATE_ID ?? env.LINEAR_DONE_STATE_ID`.
- Updated `apps/orchestrator-api/src/worker.ts` so plan jobs load card context through the provider-selected gateway from the run or queue payload, instead of hard-coded Linear access.
- Replaced worker comment paths for scheduled approval holds, cost alerts, and research-to-landing workflow notifications with provider-aware card gateway calls.
- Preserved legacy fallback for older runs/jobs by resolving card provider/id from generic fields first and falling back to legacy Linear fields where needed.
- Updated `maybeStartResearchToLandingWorkflow` to accept the card registry, fetch the source card through the correct provider, and enqueue/create continuation runs with provider-aware card fields.
- Updated `apps/orchestrator-api/src/scheduleWorker.ts` to create scheduled cards through `cards.primary.createCard`, prefer `PLANE_SCHEDULED_LABEL_ID`, fall back to `LINEAR_SCHEDULED_LABEL_ID`, and persist/enqueue the resulting provider-aware card metadata.

## What I Tested

### Focused red check

1. `rtk corepack pnpm --filter @agent-platform/orchestrator-api build`
   - Result before changes: FAIL
   - Error: `src/agent.ts(117,7): error TS2353: Object literal may only specify known properties, and 'linear' does not exist in type 'GraphDeps'.`

### Verification after implementation

1. `rtk corepack pnpm --filter @agent-platform/orchestrator-api build`
   - Result: PASS

2. `rtk corepack pnpm --filter @agent-platform/orchestrator-api test`
   - Result: PASS

3. `rtk corepack pnpm --filter @agent-platform/orchestrator-api build`
   - Result: PASS

4. `rtk corepack pnpm --filter @agent-platform/orchestrator-api build`
   - Result: PASS
   - Note: rerun after final cleanup of a comment and indentation in `worker.ts`

## Files Changed

- `apps/orchestrator-api/src/agent.ts`
- `apps/orchestrator-api/src/worker.ts`
- `apps/orchestrator-api/src/scheduleWorker.ts`

## Commit

- `1612a3b feat(orchestrator): route execution through card registry`

## Self-Review Findings

- The runtime now has a single card-registry entrypoint and no longer recreates a separate Linear gateway for graph execution.
- Worker-side comments and card reads now follow the run/job provider and still fall back to legacy Linear fields when generic card fields are absent.
- Scheduler now creates runs using the primary provider card while still backfilling legacy `linearIssue*` columns for compatibility.
- No extra file churn was introduced outside the task-owned files.

## Issues or Concerns

- No blocking issues found.
- This task has no direct worker/scheduler unit coverage in the owned files, so verification is currently build + full `@agent-platform/orchestrator-api` test suite coverage.

## Review Fix: Provider-Specific Graph Selection

### Summary

- Reworked `apps/orchestrator-api/src/agent.ts` to cache one LangGraph instance per enabled card provider while sharing the same checkpointer, LLM, GitHub gateway, worker manager, and other expensive dependencies.
- Added `resolveGraphBinding()` coverage in `apps/orchestrator-api/src/agent.test.ts` to lock provider-specific gateway selection and `doneStateId` behavior:
  - Plane graphs use `PLANE_DONE_STATE_ID ?? LINEAR_DONE_STATE_ID`
  - Linear graphs use `LINEAR_DONE_STATE_ID`
- Updated `apps/orchestrator-api/src/worker.ts` so both `plan` and `resume` resolve the graph from the run/job card provider before calling `graph.invoke(...)`, preserving older Linear runs that only have legacy `linearIssue*` fields.

### Commands Run

1. Focused red test

```bash
rtk corepack pnpm vitest run apps/orchestrator-api/src/agent.test.ts
```

Output:

```text
FAIL  apps/orchestrator-api/src/agent.test.ts > resolveGraphBinding
TypeError: resolveGraphBinding is not a function
```

2. Focused green test after implementation

```bash
rtk corepack pnpm vitest run apps/orchestrator-api/src/agent.test.ts
```

Output:

```text
✓ apps/orchestrator-api/src/agent.test.ts (2 tests)
Tests  2 passed (2)
```

3. Required orchestrator test suite

```bash
rtk corepack pnpm vitest run apps/orchestrator-api/src
```

Output:

```text
Test Files  27 passed (27)
Tests  127 passed (127)
```

4. Required orchestrator build

```bash
rtk corepack pnpm --filter @agent-platform/orchestrator-api build
```

Output:

```text
$ tsc
exit 0
```
