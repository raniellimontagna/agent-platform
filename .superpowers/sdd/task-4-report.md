# Task 4 Report: Environment and Runtime Card Registry

## What I Implemented
- Added `@agent-platform/cards` and `@agent-platform/plane` to `apps/orchestrator-api/package.json`.
- Extended `apps/orchestrator-api/src/env.ts` with the card-provider and Plane runtime settings from the brief, including secret-guard coverage for `PLANE_API_KEY` and `PLANE_WEBHOOK_SECRET`.
- Added `apps/orchestrator-api/src/cards.ts` with `createRuntimeCards(env)`:
  - Plane is enabled as the primary provider by default.
  - Linear stays optional.
  - Provider parsing is compile-safe and handled separately before building the enabled set.
  - Plane gateway creation requires `PLANE_API_KEY` and `PLANE_PROJECT_ID`.
  - Linear gateway creation only happens when credentials are present, unless Linear is the primary provider, in which case missing `LINEAR_API_KEY` throws.
- Added `apps/orchestrator-api/src/cards.test.ts` to cover the Plane-primary / Linear-optional registry behavior.
- Updated `apps/orchestrator-api/src/env.test.ts` and `vitest.setup.ts` with safe defaults for the new env surface.
- Updated `pnpm-lock.yaml` to record the new workspace dependencies.

## What I Tested and Exact Test Results
- `rtk corepack pnpm exec vitest run apps/orchestrator-api/src/cards.test.ts --reporter=verbose`
  - Result: failed as expected before implementation with `ERR_MODULE_NOT_FOUND` for `./cards.js`.
- `rtk corepack pnpm test -- apps/orchestrator-api/src/cards.test.ts apps/orchestrator-api/src/env.test.ts --reporter=verbose`
  - Result: passed.
  - Relevant output: `apps/orchestrator-api/src/cards.test.ts` passed and `apps/orchestrator-api/src/env.test.ts` passed.
- `rtk corepack pnpm --filter @agent-platform/orchestrator-api typecheck`
  - Result: passed.
- `rtk corepack pnpm install --lockfile-only`
  - Result: completed successfully and left the lockfile updated.

## TDD Evidence
### RED
- Command: `rtk corepack pnpm exec vitest run apps/orchestrator-api/src/cards.test.ts --reporter=verbose`
- Failing output:
  - `Error: Cannot find module './cards.js' imported from .../apps/orchestrator-api/src/cards.test.ts`
  - `Serialized Error: { code: 'ERR_MODULE_NOT_FOUND' }`
- Why it was expected: `apps/orchestrator-api/src/cards.ts` did not exist yet, so the new registry test could not load the module.

### GREEN
- Command: `rtk corepack pnpm test -- apps/orchestrator-api/src/cards.test.ts apps/orchestrator-api/src/env.test.ts --reporter=verbose`
- Passing output:
  - `apps/orchestrator-api/src/cards.test.ts` passed
  - `apps/orchestrator-api/src/env.test.ts` passed
  - Root suite summary: `Test Files 55 passed (55)` / `Tests 310 passed (310)`

## Files Changed
- `apps/orchestrator-api/package.json`
- `apps/orchestrator-api/src/env.ts`
- `apps/orchestrator-api/src/env.test.ts`
- `apps/orchestrator-api/src/cards.ts`
- `apps/orchestrator-api/src/cards.test.ts`
- `vitest.setup.ts`
- `pnpm-lock.yaml`

## Self-Review Findings
- The registry helper is small and bounded to the card-provider concern; it does not reach into unrelated orchestrator runtime code.
- Plane and Linear are wired through their published workspace packages rather than reimplemented locally.
- The provider selection path is explicit and compile-safe, and the Plane/Linear gating matches the task brief.
- The new env defaults keep tests isolated without overwriting real runtime values.

## Issues or Concerns
- None beyond the intentional runtime requirement that Plane cards need `PLANE_API_KEY` and `PLANE_PROJECT_ID` when Plane is enabled.
