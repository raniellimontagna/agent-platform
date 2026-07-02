---
phase: 06-worker-and-eval-hub-refactor
plan: "02"
subsystem: worker-codegen
tags: [worker, codegen, tdd, refactor, vitest, biome]
requires:
  - phase: 06-worker-and-eval-hub-refactor
    provides: "06-01 runJob facade seams and worker refactor patterns"
provides:
  - "Codegen prompt, JSON, file, selection, and fix helper modules behind the codegen facade"
  - "Fail-first Wave 0 characterization tests for codegen helper seams"
  - "Compatibility re-exports for existing codegen.ts helper imports"
affects: [phase-06, worker-code, codegen, eval-dry-run]
tech-stack:
  added: []
  patterns:
    - "Worker-local helper modules with codegen.ts facade re-exports"
    - "Fail-first characterization before extraction"
key-files:
  created:
    - apps/worker-code/src/executor/codegenPrompts.ts
    - apps/worker-code/src/executor/codegenJson.ts
    - apps/worker-code/src/executor/codegenFiles.ts
    - apps/worker-code/src/executor/codegenSelection.ts
    - apps/worker-code/src/executor/codegenFixes.ts
    - apps/worker-code/src/executor/codegenJson.test.ts
    - apps/worker-code/src/executor/codegenFiles.test.ts
    - apps/worker-code/src/executor/codegenSelection.test.ts
    - apps/worker-code/src/executor/codegenFixes.test.ts
  modified:
    - apps/worker-code/src/executor/codegen.ts
key-decisions:
  - "Keep codegen.ts as the public facade for generateAndApplyCode, applyFix, and compatibility helper exports."
  - "Use worker-local helper modules only; no package, schema, route, provider, model alias, deploy, or Plane behavior changes."
  - "Leave 06-01 runner formatting findings untouched because they are outside 06-02 ownership and user scope."
patterns-established:
  - "Codegen helpers are split by prompt, JSON, file I/O, selection shaping, and fix candidate responsibilities."
  - "Helper tests import the focused modules directly while codegen.ts re-exports compatibility helpers."
requirements-completed: [REF-04, VER-01]
follow_up_verification:
  - "Orchestrator follow-up formatted the 06-01 runner files flagged by broad Biome."
  - "`rtk corepack pnpm verify` passed after that formatting follow-up: 88 test files / 574 tests, eval 14/14, regression eval 14/14 delta 0."
coverage:
  - id: D1
    description: "Prompt and JSON repair helpers extracted behind codegen.ts while preserving strong_coder JSON-mode retry/repair behavior"
    requirement: REF-04
    verification:
      - kind: unit
        ref: "rtk corepack pnpm vitest run apps/worker-code/src/executor/codegen.test.ts apps/worker-code/src/executor/codegenJson.test.ts"
        status: pass
      - kind: other
        ref: "rtk corepack pnpm --filter @agent-platform/worker-code typecheck"
        status: pass
    human_judgment: false
  - id: D2
    description: "File, selection, and fix candidate helpers extracted behind codegen.ts without changing generated output semantics"
    requirement: REF-04
    verification:
      - kind: unit
        ref: "rtk corepack pnpm vitest run apps/worker-code/src/executor/codegen.test.ts apps/worker-code/src/executor/codegenJson.test.ts apps/worker-code/src/executor/codegenFiles.test.ts apps/worker-code/src/executor/codegenSelection.test.ts apps/worker-code/src/executor/codegenFixes.test.ts apps/worker-code/src/eval/workerDryRun.test.ts"
        status: pass
      - kind: other
        ref: "rtk git diff --exit-code -- package.json pnpm-lock.yaml apps/worker-code/package.json apps/orchestrator-api/src/db/schema.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Wave 0 helper tests were committed after a RED run caused by missing proposed helper modules"
    requirement: VER-01
    verification:
      - kind: unit
        ref: "rtk corepack pnpm vitest run apps/worker-code/src/executor/codegenJson.test.ts apps/worker-code/src/executor/codegenFiles.test.ts apps/worker-code/src/executor/codegenSelection.test.ts apps/worker-code/src/executor/codegenFixes.test.ts (expected RED before extraction)"
        status: pass
    human_judgment: false
duration: 9m12s
completed: 2026-07-02
status: complete
---

# Phase 06 Plan 02: Codegen Seams Summary

**Worker codegen split into prompt, JSON repair, file safety, selection, and fix-candidate helper modules with fail-first seam coverage**

## Performance

- **Duration:** 9m12s
- **Started:** 2026-07-02T18:06:38Z
- **Completed:** 2026-07-02T18:15:50Z
- **Tasks:** 3
- **Files modified:** 10 source/test files plus this summary

## Accomplishments

- Added four Wave 0 codegen helper characterization suites and captured RED evidence before production extraction.
- Extracted prompt constants, agent instruction glue, JSON schemas, extraction, retry, repair, and usage forwarding into `codegenPrompts.ts` and `codegenJson.ts`.
- Extracted worktree file safety/apply helpers, selected-file shaping, documentation/review filters, and self-fix candidate helpers into `codegenFiles.ts`, `codegenSelection.ts`, and `codegenFixes.ts`.
- Preserved `generateAndApplyCode`, `applyFix`, and compatibility helper exports from `codegen.ts`.

## Task Commits

1. **06-02-W0: Wave 0 codegen helper characterization** - `2d9bd86` (`test`)
2. **06-02-01: Prompt and JSON repair helper extraction** - `61352ae` (`feat`)
3. **06-02-02: File, selection, and fix helper extraction** - `541aa30` (`feat`)
4. **Owned formatting follow-up** - `6bf58d4` (`style`)

## Verification

- RED evidence: `rtk corepack pnpm vitest run apps/worker-code/src/executor/codegenJson.test.ts apps/worker-code/src/executor/codegenFiles.test.ts apps/worker-code/src/executor/codegenSelection.test.ts apps/worker-code/src/executor/codegenFixes.test.ts` failed before extraction because the four helper modules did not exist.
- Task 06-02-01: `codegen.test.ts` and `codegenJson.test.ts` passed 34 tests; worker typecheck passed; package/schema diff gate was clean.
- Task 06-02-02 final focused gate: six focused suites passed 54 tests; worker typecheck passed; owned-file Biome check passed; package/schema diff gate was clean.
- Broad `rtk corepack pnpm verify` initially failed on 06-01 runner formatting/import findings in `jobDispatch.ts`, `jobValidation.test.ts`, `runJob.seams.test.ts`, and `runJob.ts`. The orchestrator resolved those with a path-limited Biome formatting follow-up after 06-02.
- Follow-up full gate: `rtk corepack pnpm verify` passed with 88 test files / 574 tests, eval 14/14, and regression eval 14/14 with score delta 0.

## Files Created/Modified

- `apps/worker-code/src/executor/codegenPrompts.ts` - Prompt constants and agent instruction assembly.
- `apps/worker-code/src/executor/codegenJson.ts` - JSON schemas, extraction, retry, repair, and completion helper.
- `apps/worker-code/src/executor/codegenFiles.ts` - Safe worktree joins, repo file listing, reads, writes, allowed-file filtering, and available-file formatting.
- `apps/worker-code/src/executor/codegenSelection.ts` - File selection LLM call, docs/review filtering, normalization, chunking, and generation target shaping.
- `apps/worker-code/src/executor/codegenFixes.ts` - Text-fixability and self-correction candidate prioritization.
- `apps/worker-code/src/executor/codegen.ts` - Compatibility facade that delegates to helper modules and preserves public exports.
- `apps/worker-code/src/executor/codegenJson.test.ts` - JSON extraction, repair, alias, JSON mode, and usage characterization.
- `apps/worker-code/src/executor/codegenFiles.test.ts` - Path safety, file writes, current-file reads, generated-file availability, and allowed-file filtering.
- `apps/worker-code/src/executor/codegenSelection.test.ts` - Docs filtering, review-create filtering, dry-run selection compatibility, target shaping, and chunking.
- `apps/worker-code/src/executor/codegenFixes.test.ts` - Mentioned-file selection, changed-test inclusion, fallback limits, and binary/generated asset exclusion.

## Decisions Made

- Kept `codegen.ts` as the facade owner for runner/eval compatibility instead of moving public entrypoints.
- Kept model alias usage, provider routing, role aliases, package files, schema files, route surfaces, workflow labels, and deploy configuration unchanged.
- Combined docs filtering and review-create filtering in `normalizeSelectedFiles` using the existing order: documentation pruning first, review create pruning second.
- Kept the 06-02 executor changes limited to codegen files; the orchestrator later fixed 06-01 runner formatting as a phase-level verification blocker.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Formatted owned codegen seam files after broad lint surfaced style issues**
- **Found during:** Final verification
- **Issue:** `rtk corepack pnpm verify` reported Biome formatting/import issues in newly touched codegen files.
- **Fix:** Ran path-limited Biome formatting only on 06-02-owned codegen source/test files.
- **Files modified:** `codegen.ts`, `codegenJson.ts`, `codegenFiles.ts`, `codegenSelection.ts`, `codegenJson.test.ts`, `codegenFiles.test.ts`, `codegenSelection.test.ts`
- **Verification:** Focused 54-test gate passed, worker typecheck passed, owned-file Biome check passed.
- **Committed in:** `6bf58d4`

**Total deviations:** 1 auto-fixed blocking issue.
**Impact on plan:** No behavior change and no scope expansion beyond owned codegen files.

## Issues Encountered

- Broad `rtk corepack pnpm verify` was unblocked by a phase-level formatting follow-up for `apps/worker-code/src/executor/jobDispatch.ts`, `apps/worker-code/src/executor/jobValidation.test.ts`, `apps/worker-code/src/executor/runJob.seams.test.ts`, and `apps/worker-code/src/executor/runJob.ts`.
- The plan-requested focused codegen/dry-run verification, worker typecheck, owned Biome check, package/schema diff gate, and broad verify now pass.

## Known Stubs

None. Stub scan only found normal empty arrays/default parameters used as accumulators or optional defaults.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 06-03 can depend on the same facade-preserving pattern: write fail-first helper tests, extract worker-local seams, keep public facade exports stable, and avoid provider/schema/package/route behavior changes. No residual verification blocker is known after the phase-level full verify follow-up.

## Self-Check: PASSED

- Confirmed all created codegen helper modules and characterization tests exist on disk.
- Confirmed task commits `2d9bd86`, `61352ae`, `541aa30`, and `6bf58d4` exist in git history.

---
*Phase: 06-worker-and-eval-hub-refactor*
*Completed: 2026-07-02*
