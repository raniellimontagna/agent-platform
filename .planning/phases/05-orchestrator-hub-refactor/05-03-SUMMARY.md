---
phase: 05-orchestrator-hub-refactor
plan: "03"
subsystem: orchestrator-mission-control
tags: [hono, vitest, mission-control, html-escaping, admin-routes]

requires:
  - phase: 05-orchestrator-hub-refactor
    provides: Shared route auth/rendering primitives from 05-01 and webhook seam closeout from 05-02
provides:
  - Mission Control data assembly seam for summaries, detail pages, safe limit normalization, run grouping, artifacts, and approvals
  - Mission Control HTML renderer seam for dashboard and detail pages using shared escaping/date/status helpers
  - Fail-first characterization coverage for Mission Control JSON, HTML, escaping, read-only copy, and route behavior
  - Phase 5 closeout verification with `rtk corepack pnpm verify`
affects: [phase-05, orchestrator-api, mission-control, admin-routes, route-rendering]

tech-stack:
  added: []
  patterns:
    - Admin routes stay thin and protected while Mission Control data/render concerns live in orchestrator-local modules.
    - Renderers consume shared `routes/rendering.ts` primitives instead of duplicating escaping/date/status text helpers.
    - Mission Control remains a read-only inspection surface with no launch/replay/approve/retry/cancel/deploy controls.

key-files:
  created:
    - apps/orchestrator-api/src/missionControlData.ts
    - apps/orchestrator-api/src/missionControlData.test.ts
    - apps/orchestrator-api/src/missionControlRender.ts
    - apps/orchestrator-api/src/missionControlRender.test.ts
    - .planning/phases/05-orchestrator-hub-refactor/05-03-SUMMARY.md
  modified:
    - apps/orchestrator-api/src/routes/admin.ts
    - apps/orchestrator-api/src/routes/admin.test.ts
    - apps/orchestrator-api/src/routes/rendering.test.ts

key-decisions:
  - "Split Mission Control into `missionControlData.ts` and `missionControlRender.ts` while keeping `routes/admin.ts` as protected route orchestration."
  - "Preserve `renderMissionControlPage` and `renderMissionDetailPage` re-exports from `routes/admin.ts` for existing imports/tests."
  - "Use shared `escapeHtml`, `formatDate`, and `humanizeStatus` from `routes/rendering.ts` in Mission Control renderers."
  - "Apply the human-approved one-line import-order fix in `routes/rendering.test.ts` solely to satisfy the full Phase 5 Biome gate."

patterns-established:
  - "Mission Control data assembly is testable without HTML string assertions."
  - "Mission Control HTML escaping tests cover stored run, card, scenario, artifact, approval, and PR URL values."
  - "Phase closeout can include a narrow human-approved lint-only scope expansion when required by full-repo verification."

requirements-completed: [REF-01, VER-01]

coverage:
  - id: D1
    description: "Mission Control summary/detail data assembly moved behind `missionControlData.ts` while preserving JSON shape, safe limit bounds, source-run grouping, no-card fallback, artifact aggregation, approval aggregation, aliases, auth, and detail 404 behavior."
    requirement: REF-01
    verification:
      - kind: unit
        ref: "rtk corepack pnpm vitest run apps/orchestrator-api/src/missionControlData.test.ts"
        status: pass
      - kind: unit
        ref: "rtk corepack pnpm vitest run apps/orchestrator-api/src/routes/admin.test.ts apps/orchestrator-api/src/missionScenarios.test.ts apps/orchestrator-api/src/missionTimeline.test.ts apps/orchestrator-api/src/artifacts.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Mission Control dashboard/detail rendering moved behind `missionControlRender.ts` while preserving read-only copy, content type behavior through admin routes, empty states, artifact links, PR URLs, and escaping."
    requirement: REF-01
    verification:
      - kind: unit
        ref: "rtk corepack pnpm vitest run apps/orchestrator-api/src/missionControlRender.test.ts"
        status: pass
      - kind: unit
        ref: "rtk corepack pnpm vitest run apps/orchestrator-api/src/routes/admin.test.ts apps/orchestrator-api/src/missionScenarios.test.ts apps/orchestrator-api/src/missionTimeline.test.ts apps/orchestrator-api/src/artifacts.test.ts apps/orchestrator-api/src/routes/artifacts.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Phase 5 closeout gate passed after the final admin/Mission Control refactor slice, with package files unchanged."
    requirement: VER-01
    verification:
      - kind: other
        ref: "rtk corepack pnpm verify"
        status: pass
      - kind: other
        ref: "rtk git diff --exit-code -- package.json pnpm-lock.yaml apps/orchestrator-api/package.json"
        status: pass
    human_judgment: false

metrics:
  started: 2026-07-02T15:25:22Z
  completed: 2026-07-02T15:41:48Z
  duration_seconds: 986
  tasks: 2
  files_modified: 7
status: complete
---

# Phase 05 Plan 03: Mission Control Data and Renderer Refactor Summary

**Mission Control now uses focused data and HTML renderer modules while admin routes remain protected, read-only orchestration.**

## Performance

- **Duration:** 16m26s
- **Started:** 2026-07-02T15:25:22Z
- **Completed:** 2026-07-02T15:41:48Z
- **Tasks:** 2
- **Files modified:** 7 implementation/test files plus this summary

## Accomplishments

- Added `missionControlData.ts` for Mission Control summary/detail data assembly, safe limit normalization, source-run grouping, artifact aggregation, approval aggregation, and not-found detail behavior.
- Added `missionControlRender.ts` for dashboard/detail HTML renderers that reuse shared escaping/date/status primitives from 05-01.
- Slimmed `routes/admin.ts` from 486 lines to 107 lines while preserving `/admin/*` auth, JSON aliases, detail HTML, content behavior, and renderer re-exports.
- Added fail-first tests for data and render seams, including malicious stored values and read-only/no-control assertions.
- Closed Phase 5 with the full repository gate: lint, build, tests, eval, and eval regression passed.

## Task Commits

1. **Task 1 RED: Extract Mission Control data assembly** - `ef003a6` (test)
2. **Task 1 GREEN: Extract Mission Control data assembly** - `0576c85` (feat)
3. **Task 2 RED: Extract Mission Control renderers** - `c4aaadc` (test)
4. **Task 2 GREEN: Extract Mission Control renderers** - `036e2e3` (feat)

## Files Created/Modified

- `apps/orchestrator-api/src/missionControlData.ts` - Mission Control data assembly, safe limit handling, source-run grouping, artifact aggregation, approval aggregation, and detail lookup.
- `apps/orchestrator-api/src/missionControlData.test.ts` - RED/GREEN tests for data assembly, grouping, fallback, detail not-found, and aggregation.
- `apps/orchestrator-api/src/missionControlRender.ts` - Dashboard/detail HTML renderers using shared route rendering primitives.
- `apps/orchestrator-api/src/missionControlRender.test.ts` - RED/GREEN tests for read-only copy, empty states, artifact/PR rendering, and escaping.
- `apps/orchestrator-api/src/routes/admin.ts` - Thin protected admin route orchestration that calls data/render seams and preserves renderer re-exports.
- `apps/orchestrator-api/src/routes/admin.test.ts` - Additional route guardrails for `/admin/api` mission aliases, mission detail auth, and 404s.
- `apps/orchestrator-api/src/routes/rendering.test.ts` - Human-approved import-order-only fix required by Biome/full verify.

## Verification

| Command | Result | Notes |
|---------|--------|-------|
| RED Task 1 `rtk corepack pnpm vitest run apps/orchestrator-api/src/missionControlData.test.ts` | Failed as expected | Failed on missing `./missionControlData.js` before implementation. |
| GREEN Task 1 focused command | Passed | `missionControlData.test.ts`: 6 tests passed. |
| Task 1 route/domain command | Passed | `missionControlData`, `admin`, `missionScenarios`, `missionTimeline`, and `artifacts`: 5 files / 39 tests passed. |
| Task 1 `rtk corepack pnpm --filter @agent-platform/orchestrator-api typecheck` | Passed | `tsc --noEmit` exited 0 after explicit summary array typing. |
| Task 1 `rtk rg -q "buildRecentMissionSummaries" ...` | Passed | Function lives in `missionControlData.ts` and is imported by `routes/admin.ts`. |
| RED Task 2 `rtk corepack pnpm vitest run apps/orchestrator-api/src/missionControlRender.test.ts` | Failed as expected | Failed on missing `./missionControlRender.js` before implementation. |
| GREEN Task 2 focused command | Passed | `missionControlRender.test.ts`: 6 tests passed. |
| Task 2 route/domain command | Passed | `missionControlRender`, `admin`, `missionScenarios`, `missionTimeline`, `artifacts`, and `routes/artifacts`: 6 files / 43 tests passed. |
| Task 2 typecheck | Passed | `rtk corepack pnpm --filter @agent-platform/orchestrator-api typecheck` exited 0. |
| Task 2 read-only grep | Passed | `rtk rg -q "Read-only" apps/orchestrator-api/src/missionControlRender.ts` exited 0. |
| Task 2 package diff | Passed | `package.json`, `pnpm-lock.yaml`, and `apps/orchestrator-api/package.json` unchanged. |
| Final plan Vitest command | Passed | 15 files / 124 tests passed. |
| Final typecheck | Passed | `tsc --noEmit` exited 0. |
| Final package diff | Passed | No package file changes. |
| Final Phase 5 `rtk corepack pnpm verify` | Passed | Biome checked 239 files; build passed; Vitest 81 files / 531 tests passed; eval 14/14 score 100; eval regression 14/14 score 100 with delta 0. |

## Decisions Made

- Kept scenario and timeline semantics in `missionScenarios.ts` and `missionTimeline.ts`; new modules call those owners instead of duplicating stage logic.
- Kept route HTTP response ownership in `routes/admin.ts`; data/render modules return data or strings only.
- Preserved `routes/admin.ts` renderer re-exports to avoid breaking tests or downstream imports during the refactor.
- Accepted one human-approved lint-only scope expansion for `routes/rendering.test.ts` because the full Phase 5 gate could not pass otherwise.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added explicit Mission Control summary array typing**
- **Found during:** Task 1 GREEN typecheck
- **Issue:** TypeScript inferred the `Promise.all` summary array too narrowly for the final `undefined` filter type predicate.
- **Fix:** Annotated the intermediate `missions` array as `Array<MissionControlSummary | undefined>`.
- **Files modified:** `apps/orchestrator-api/src/missionControlData.ts`
- **Verification:** `rtk corepack pnpm --filter @agent-platform/orchestrator-api typecheck` and Task 1 tests passed.
- **Committed in:** `0576c85`

### Approved Scope Adjustments

**1. Human-approved Biome import-order fix outside the original write scope**
- **Found during:** Task 2 full Phase 5 `rtk corepack pnpm verify`
- **Issue:** Biome required import sorting in `apps/orchestrator-api/src/routes/rendering.test.ts`, which was outside the original 05-03 write scope.
- **Decision:** Execution paused at a decision checkpoint; the user approved expanding scope only for that one-line non-behavioral import-order fix.
- **Files modified:** `apps/orchestrator-api/src/routes/rendering.test.ts`
- **Verification:** `rtk corepack pnpm verify` passed after the fix.
- **Committed in:** `036e2e3`

**Total deviations:** 1 auto-fixed blocking issue and 1 human-approved scope adjustment.
**Impact on plan:** No runtime behavior, route contract, schema, provider, deploy, package, worker, eval, or Mission Control control-surface expansion occurred.

## Issues Encountered

- `rtk` warned that project filters are untrusted on project commands. The warning did not block execution and was not changed.
- The first Task 2 full verify failed on Biome formatting/import order. Formatting in allowed 05-03 files was applied, and the single outside-scope import-order fix was applied only after explicit user approval.
- Full test output includes expected tested error logs from existing suites (`db down`, Redis connection refusal, and semantic lesson fallback); all tests still passed.

## Dirty Worktree Handling

- Preserved unrelated pre-existing untracked paths: `.planning/PROJECT.md`, `.planning/config.json`, `.planning/phases/01-bootstrap-and-architectural-inventory/`, `.planning/phases/02-living-documentation-and-historical-archive/`, `.planning/research/`, and `docs/superpowers/README.md`.
- Staged and committed only task files plus the explicitly approved `routes/rendering.test.ts` import-order fix.

## Known Stubs

None. Stub scan across created/modified 05-03 implementation and test files found no `TODO`, `FIXME`, `placeholder`, `coming soon`, `not available`, or hardcoded empty-value UI/data-source stubs.

## Threat Review

- `T-05-03-01` mitigated: `/admin/*` remains protected by `requireRunnerAuth`; admin route auth tests cover Mission Control endpoints.
- `T-05-03-02` mitigated: `missionControlRender.ts` uses shared `escapeHtml`, `formatDate`, and `humanizeStatus`; renderer tests cover malicious run title, card identifier, scenario text, artifact id/kind, approval text, and PR URL values.
- `T-05-03-03` mitigated: data helpers preserve safe limit bounds and existing read-only data shapes; no new data route was introduced.
- `T-05-03-04` mitigated: Mission Control tests assert absence of launch, replay, approve, retry, cancel, deploy controls, forms, and buttons.
- `T-05-03-SC` mitigated: no package installs, dependency upgrades, or package-file changes occurred.

No unplanned endpoint, auth path, schema change, file-access boundary, package change, deployment change, provider env default change, worker/eval trust-boundary change, or webhook behavior change was introduced.

## TDD Gate Compliance

- Task 1 RED commit present: `ef003a6`; RED command failed on missing `./missionControlData.js`.
- Task 1 GREEN commit present after RED: `0576c85`; focused tests, route/domain regressions, typecheck, and static grep passed.
- Task 2 RED commit present: `c4aaadc`; RED command failed on missing `./missionControlRender.js`.
- Task 2 GREEN commit present after RED: `036e2e3`; focused tests, route/domain regressions, typecheck, static checks, package diff, and full Phase 5 verify passed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 5 is complete. Phase 6 can start worker/eval hub refactors with shared route helpers, webhook seams, and Mission Control data/render seams already characterized. 05-03 did not touch schema/deploy/provider env files, package files, worker/eval/codegen/data-collector internals, webhook files, or provider runtime files.

## Self-Check: PASSED

- Found created files: `apps/orchestrator-api/src/missionControlData.ts`, `apps/orchestrator-api/src/missionControlData.test.ts`, `apps/orchestrator-api/src/missionControlRender.ts`, `apps/orchestrator-api/src/missionControlRender.test.ts`, and `.planning/phases/05-orchestrator-hub-refactor/05-03-SUMMARY.md`.
- Found task commits: `ef003a6`, `0576c85`, `c4aaadc`, and `036e2e3`.
