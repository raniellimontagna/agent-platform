---
phase: 06-worker-and-eval-hub-refactor
plan: "01"
subsystem: worker-executor
tags: [worker, runJob, seams, validation, self-correction, tdd]
requires:
  - phase: 05-orchestrator-hub-refactor
    provides: Protected route/helper refactors and fail-first seam pattern used by this runner split.
provides:
  - Worker-local runJob dispatch, validation, media, result, and self-correction seams.
  - Fail-first characterization tests for runner dispatch, result shape, callback payloads, validation, and retry behavior.
  - Stable runJob/reportResult facade for jobs routes.
affects: [06-worker-and-eval-hub-refactor, worker-runner, codegen, eval-dry-run]
tech-stack:
  added: []
  patterns:
    - Worker-local seam modules with dependency injection for focused characterization tests.
    - runJob facade re-exporting compatibility helpers while delegating implementation details.
key-files:
  created:
    - apps/worker-code/src/executor/runJob.seams.test.ts
    - apps/worker-code/src/executor/jobValidation.test.ts
    - apps/worker-code/src/executor/jobSelfCorrection.test.ts
    - apps/worker-code/src/executor/jobDispatch.ts
    - apps/worker-code/src/executor/jobValidation.ts
    - apps/worker-code/src/executor/jobSelfCorrection.ts
    - apps/worker-code/src/executor/jobMedia.ts
    - apps/worker-code/src/executor/jobResult.ts
  modified:
    - apps/worker-code/src/executor/runJob.ts
key-decisions:
  - "Keep runJob.ts as the public worker facade and compatibility re-export owner for existing tests and jobs routes."
  - "Keep provider, Git, worktree, sandbox, Higgsfield, and validation-policy behavior in existing owners; new modules only delegate or orchestrate."
  - "Use dependency-injected seam helpers for characterization tests instead of changing product/runtime behavior."
patterns-established:
  - "Runner seam modules live under apps/worker-code/src/executor and use explicit .js imports."
  - "Characterization tests prove RED via missing seam modules before production extraction and then pass after extraction."
requirements-completed: [REF-03, VER-01]
coverage:
  - id: D1
    description: "runJob delegates data-collector dispatch, validation, landing media, result/callback helpers, and self-correction to focused worker-local modules."
    requirement: REF-03
    verification:
      - kind: unit
        ref: "rtk corepack pnpm vitest run apps/worker-code/src/executor/runJob.test.ts apps/worker-code/src/executor/runJob.seams.test.ts apps/worker-code/src/executor/jobValidation.test.ts apps/worker-code/src/executor/jobSelfCorrection.test.ts apps/worker-code/src/executor/codegen.test.ts apps/worker-code/src/eval/workerDryRun.test.ts"
        status: pass
      - kind: other
        ref: "rtk corepack pnpm --filter @agent-platform/worker-code typecheck"
        status: pass
    human_judgment: false
  - id: D2
    description: "Wave 0 characterization tests failed before extraction and passed after implementation."
    requirement: VER-01
    verification:
      - kind: unit
        ref: "RED: missing ./jobDispatch.js, ./jobValidation.js, ./jobSelfCorrection.js before production extraction"
        status: pass
      - kind: unit
        ref: "GREEN: combined focused Vitest gate passed 59 tests"
        status: pass
    human_judgment: false
  - id: D3
    description: "Route, package, and schema surfaces remained unchanged."
    requirement: REF-03
    verification:
      - kind: other
        ref: "rtk rg -F -q \"import { reportResult, runJob } from '../executor/runJob.js'\" apps/worker-code/src/routes/jobs.ts"
        status: pass
      - kind: other
        ref: "rtk git diff --exit-code -- package.json pnpm-lock.yaml apps/worker-code/package.json apps/orchestrator-api/src/db/schema.ts"
        status: pass
    human_judgment: false
duration: 11m45s
completed: 2026-07-02
status: complete
---

# Phase 06 Plan 01: runJob Seams Summary

**Worker runner seams with fail-first characterization and a stable runJob/reportResult facade.**

## Performance

- **Duration:** 11m45s
- **Started:** 2026-07-02T17:49:04Z
- **Completed:** 2026-07-02T18:00:49Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments

- Added fail-first tests for runner dispatch, validation, self-correction, commit retry, callback payload, route import stability, and result shape.
- Extracted dispatch, validation, landing media, result/callback, and self-correction logic into worker-local modules.
- Preserved `/jobs` route import, provider behavior, package files, schema files, validation behavior, callback shape, and commit/push ownership boundaries.

## TDD Evidence

- **RED:** `rtk corepack pnpm vitest run apps/worker-code/src/executor/runJob.test.ts apps/worker-code/src/executor/runJob.seams.test.ts apps/worker-code/src/executor/jobValidation.test.ts apps/worker-code/src/executor/jobSelfCorrection.test.ts` failed before production extraction because `./jobDispatch.js`, `./jobValidation.js`, and `./jobSelfCorrection.js` did not exist. Existing `runJob.test.ts` still passed 12 tests.
- **GREEN:** The final combined focused gate passed 6 test files / 59 tests after extraction.

## Task Commits

1. **06-01-W0: Wave 0 runner seam characterization** - `7bd9b07` (`test`)
2. **06-01-01: Dispatch, validation, media, and result seams** - `be7a45a` (`refactor`)
3. **06-01-02: Self-correction and commit-retry seam** - `bd49b92` (`refactor`)

## Files Created/Modified

- `apps/worker-code/src/executor/runJob.seams.test.ts` - Characterizes dispatch, runJob facade result shapes, callback payload, route import, cleanup, commit recovery, and no-op revise behavior.
- `apps/worker-code/src/executor/jobValidation.test.ts` - Covers allowlist blocking, first-failure stop, landing-aware validation, and failure-tail behavior.
- `apps/worker-code/src/executor/jobSelfCorrection.test.ts` - Covers touched-file/cost accumulation, media restoration, max fix attempts, and commit retry feedback.
- `apps/worker-code/src/executor/jobDispatch.ts` - Owns data-collector branch selection and env-to-provider option mapping.
- `apps/worker-code/src/executor/jobValidation.ts` - Owns guarded command execution, validation loops, landing-aware validation, and failure-tail plumbing.
- `apps/worker-code/src/executor/jobSelfCorrection.ts` - Owns validation-fix and git commit retry loops through existing `applyFix` and Git helpers.
- `apps/worker-code/src/executor/jobMedia.ts` - Owns landing media prompt, public asset path, context text, and restore helper.
- `apps/worker-code/src/executor/jobResult.ts` - Owns commit message, commit error conversion, sandbox summary, and callback reporting.
- `apps/worker-code/src/executor/runJob.ts` - Remains the public runner facade and delegates to the new seams.

## Verification

- `rtk corepack pnpm vitest run apps/worker-code/src/executor/runJob.test.ts apps/worker-code/src/executor/runJob.seams.test.ts apps/worker-code/src/executor/jobValidation.test.ts apps/worker-code/src/executor/jobSelfCorrection.test.ts apps/worker-code/src/executor/codegen.test.ts apps/worker-code/src/eval/workerDryRun.test.ts` - passed 6 files / 59 tests.
- `rtk corepack pnpm --filter @agent-platform/worker-code typecheck` - passed.
- `rtk rg -F -q "import { reportResult, runJob } from '../executor/runJob.js'" apps/worker-code/src/routes/jobs.ts` - passed.
- `rtk git diff --exit-code -- package.json pnpm-lock.yaml apps/worker-code/package.json apps/orchestrator-api/src/db/schema.ts` - passed.

## Decisions Made

- Keep `runJob.ts` as the facade and compatibility export surface; the jobs route still imports only `runJob` and `reportResult`.
- Keep provider request behavior in existing provider modules; `jobDispatch.ts` only chooses Firecrawl versus Playwright and passes the same env-derived options.
- Keep Git/worktree mutation in `git.ts`/`worktree.ts`; `jobSelfCorrection.ts` retries through injected `tryCommit` and existing helpers.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Test Bug] Corrected review no-op characterization**
- **Found during:** Task 06-01-01
- **Issue:** The Wave 0 test expected `commitSha: undefined` to be present in the no-op review result, but existing behavior omits the key.
- **Fix:** Asserted `result.commitSha` is undefined without requiring the key in `toMatchObject`.
- **Files modified:** `apps/worker-code/src/executor/runJob.seams.test.ts`
- **Verification:** Focused 06-01-01 Vitest subset passed.
- **Committed in:** `be7a45a`

**2. [Rule 1 - Test Bug] Fixed callback fake response**
- **Found during:** Task 06-01-01
- **Issue:** The callback test used `new Response('', { status: 204 })`, which is invalid with a response body in undici.
- **Fix:** Changed the fake response to HTTP 200.
- **Files modified:** `apps/worker-code/src/executor/runJob.seams.test.ts`
- **Verification:** Focused 06-01-01 Vitest subset passed.
- **Committed in:** `be7a45a`

**3. [Rule 3 - Blocking Type Issue] Tightened self-correction seam types**
- **Found during:** Task 06-01-02 typecheck
- **Issue:** `applyFix` requires a full `Logger`, and `correctionState` needed an explicit `SelfCorrectionState` annotation.
- **Fix:** Updated the seam context type and annotated runner state.
- **Files modified:** `apps/worker-code/src/executor/jobSelfCorrection.ts`, `apps/worker-code/src/executor/runJob.ts`
- **Verification:** Worker typecheck and all focused gates passed.
- **Committed in:** `bd49b92`

**Total deviations:** 3 auto-fixed (2 test bugs, 1 blocking type issue)
**Impact on plan:** No scope expansion. All fixes were required for correct characterization or type-safe extraction.

## Known Stubs

None. Stub-pattern scan found only harmless default parameters and local empty arrays in tests/helpers.

## Threat Flags

None. The plan moved existing worker trust-boundary logic behind local seams without adding new endpoints, auth paths, schema changes, package changes, or provider calls.

## Auth Gates

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 06-02 can build on the extracted runner seams. `runJob.ts` is now a smaller facade, and codegen/refactor plans can use `jobSelfCorrection.ts` and `jobValidation.ts` as stable worker-local boundaries.

## Self-Check: PASSED

- Summary file exists: `.planning/phases/06-worker-and-eval-hub-refactor/06-01-SUMMARY.md`
- Created seam/test files exist: `runJob.seams.test.ts`, `jobValidation.test.ts`, `jobSelfCorrection.test.ts`, `jobDispatch.ts`, `jobValidation.ts`, `jobSelfCorrection.ts`, `jobMedia.ts`, `jobResult.ts`
- Task commits found: `7bd9b07`, `be7a45a`, `bd49b92`

---
*Phase: 06-worker-and-eval-hub-refactor*
*Completed: 2026-07-02*
