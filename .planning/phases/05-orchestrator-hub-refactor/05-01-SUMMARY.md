---
phase: 05-orchestrator-hub-refactor
plan: "01"
subsystem: orchestrator-route-helpers
tags: [hono, vitest, auth, html-escaping, mission-control, registry]

requires:
  - phase: 04-operational-flow-reorganization
    provides: Plane-first operational source-owner docs and Mission Control read-only guardrails
provides:
  - Shared `requireRunnerAuth` middleware for the orchestrator route bearer-token contract
  - Shared route rendering primitives for HTML escaping, date display, and Mission Control status text
  - Fail-first characterization tests for auth and rendering helper extraction
affects: [phase-05, orchestrator-api, route-auth, mission-control, registry]

tech-stack:
  added: []
  patterns:
    - Route-local middleware duplication is replaced with small orchestrator-local helpers.
    - Shared HTML helpers are tested before route imports move.
    - Route-specific status-class mappings stay local when meanings differ.

key-files:
  created:
    - apps/orchestrator-api/src/routes/routeAuth.ts
    - apps/orchestrator-api/src/routes/routeAuth.test.ts
    - apps/orchestrator-api/src/routes/rendering.ts
    - apps/orchestrator-api/src/routes/rendering.test.ts
    - .planning/phases/05-orchestrator-hub-refactor/05-01-SUMMARY.md
  modified:
    - apps/orchestrator-api/src/routes/agents.ts
    - apps/orchestrator-api/src/routes/tools.ts
    - apps/orchestrator-api/src/routes/schedules.ts
    - apps/orchestrator-api/src/routes/admin.ts
    - apps/orchestrator-api/src/routes/registry.ts

key-decisions:
  - "Use one local `requireRunnerAuth` helper instead of Hono bearerAuth so the exact 401 JSON contract remains unchanged."
  - "Extract only `escapeHtml`, `formatDate`, and `humanizeStatus`; leave registry and Mission Control status-class mappings local."
  - "Keep Task 1 and Task 2 RED/GREEN commits separate to preserve fail-first evidence."

patterns-established:
  - "Shared route helpers live under `apps/orchestrator-api/src/routes/` and avoid package or framework changes."
  - "Helper extraction tests include route coverage when existing route test files are outside the edit scope."

requirements-completed: [REF-01, VER-01]

coverage:
  - id: D1
    description: "Shared runner bearer auth helper replaces duplicated agents, tools, and schedules route-local auth while preserving open reads and protected writes."
    requirement: REF-01
    verification:
      - kind: unit
        ref: "rtk corepack pnpm vitest run apps/orchestrator-api/src/routes/routeAuth.test.ts"
        status: pass
      - kind: unit
        ref: "rtk corepack pnpm vitest run apps/orchestrator-api/src/routes/agents.test.ts apps/orchestrator-api/src/routes/tools.test.ts apps/orchestrator-api/src/routes/schedules.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Shared rendering primitives replace duplicated admin and registry escaping/date/status text helpers without weakening HTML escaping."
    requirement: REF-01
    verification:
      - kind: unit
        ref: "rtk corepack pnpm vitest run apps/orchestrator-api/src/routes/rendering.test.ts"
        status: pass
      - kind: unit
        ref: "rtk corepack pnpm vitest run apps/orchestrator-api/src/routes/admin.test.ts apps/orchestrator-api/src/routes/registry.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Characterization tests were written and observed failing before each risky helper extraction, then passed after GREEN implementation."
    requirement: VER-01
    verification:
      - kind: other
        ref: "RED routeAuth: missing `./routeAuth.js`; GREEN routeAuth: 6 tests passed"
        status: pass
      - kind: other
        ref: "RED rendering: missing `./rendering.js`; GREEN rendering: 5 tests passed"
        status: pass
    human_judgment: false

metrics:
  started: 2026-07-02T14:54:24Z
  completed: 2026-07-02T14:59:43Z
  duration_seconds: 319
  tasks: 2
  files_modified: 9
status: complete
---

# Phase 05 Plan 01: Shared Route Helper Extraction Summary

**Shared runner auth and HTML rendering primitives now replace duplicated orchestrator route helpers with fail-first tests.**

## Performance

- **Duration:** 5m19s
- **Started:** 2026-07-02T14:54:24Z
- **Completed:** 2026-07-02T14:59:43Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments

- Added `requireRunnerAuth` and replaced duplicated local bearer auth in agents, tools, schedules, and admin while preserving the exact `{ error: "unauthorized" }` 401 body.
- Added shared `escapeHtml`, `formatDate`, and `humanizeStatus` helpers and reused them in admin/Mission Control and registry rendering.
- Added focused RED/GREEN tests covering exact bearer matching, route protection coverage, HTML escaping, date formatting, status text, and admin shared-auth wiring.

## Task Commits

1. **Task 1 RED: Extract shared runner auth middleware** - `f95042d` (test)
2. **Task 1 GREEN: Extract shared runner auth middleware** - `c8671c9` (feat)
3. **Task 2 RED: Extract shared rendering primitives** - `3ef750c` (test)
4. **Task 2 GREEN: Extract shared rendering primitives** - `1e25334` (feat)

## Files Created/Modified

- `apps/orchestrator-api/src/routes/routeAuth.ts` - Shared Hono middleware for exact `RUNNER_AUTH_TOKEN` bearer checks.
- `apps/orchestrator-api/src/routes/routeAuth.test.ts` - Focused auth helper and route coverage characterization.
- `apps/orchestrator-api/src/routes/rendering.ts` - Shared route rendering primitives.
- `apps/orchestrator-api/src/routes/rendering.test.ts` - Focused helper, admin auth, and escaping characterization.
- `apps/orchestrator-api/src/routes/agents.ts` - Uses `requireRunnerAuth` for protected POST/PATCH writes.
- `apps/orchestrator-api/src/routes/tools.ts` - Uses `requireRunnerAuth` for protected POST/PATCH writes.
- `apps/orchestrator-api/src/routes/schedules.ts` - Uses `requireRunnerAuth` for protected schedule routes.
- `apps/orchestrator-api/src/routes/admin.ts` - Uses `requireRunnerAuth` for `/admin/*` and shared rendering primitives.
- `apps/orchestrator-api/src/routes/registry.ts` - Uses shared escaping and date formatting helpers.

## Verification

| Command | Result | Notes |
|---------|--------|-------|
| RED `rtk corepack pnpm vitest run apps/orchestrator-api/src/routes/routeAuth.test.ts` | Failed as expected | Failed on missing `./routeAuth.js` before implementation. |
| GREEN `rtk corepack pnpm vitest run apps/orchestrator-api/src/routes/routeAuth.test.ts` | Passed | 1 file / 6 tests passed. |
| Task 1 route command `rtk corepack pnpm vitest run apps/orchestrator-api/src/routes/agents.test.ts apps/orchestrator-api/src/routes/tools.test.ts apps/orchestrator-api/src/routes/schedules.test.ts` | Passed | 3 files / 32 tests passed. |
| Task 1 `rtk corepack pnpm --filter @agent-platform/orchestrator-api typecheck` | Passed | `tsc --noEmit` exited 0. |
| RED `rtk corepack pnpm vitest run apps/orchestrator-api/src/routes/rendering.test.ts` | Failed as expected | Failed on missing `./rendering.js` before implementation. |
| GREEN `rtk corepack pnpm vitest run apps/orchestrator-api/src/routes/rendering.test.ts` | Passed | 1 file / 5 tests passed. |
| Task 2 route command `rtk corepack pnpm vitest run apps/orchestrator-api/src/routes/admin.test.ts apps/orchestrator-api/src/routes/registry.test.ts apps/orchestrator-api/src/routes/agents.test.ts apps/orchestrator-api/src/routes/tools.test.ts apps/orchestrator-api/src/routes/schedules.test.ts` | Passed | 5 files / 56 tests passed. |
| Task 2 `rtk corepack pnpm --filter @agent-platform/orchestrator-api typecheck` | Passed | `tsc --noEmit` exited 0. |
| Task 2 `rtk git diff --exit-code -- package.json pnpm-lock.yaml apps/orchestrator-api/package.json` | Passed | No package files changed. |
| Final `rtk corepack pnpm vitest run apps/orchestrator-api/src/routes/routeAuth.test.ts apps/orchestrator-api/src/routes/rendering.test.ts apps/orchestrator-api/src/routes/admin.test.ts apps/orchestrator-api/src/routes/registry.test.ts apps/orchestrator-api/src/routes/agents.test.ts apps/orchestrator-api/src/routes/schedules.test.ts apps/orchestrator-api/src/routes/tools.test.ts` | Passed | 7 files / 67 tests passed. |
| Final `rtk corepack pnpm --filter @agent-platform/orchestrator-api typecheck` | Passed | `tsc --noEmit` exited 0. |
| Final `rtk git diff --exit-code -- package.json pnpm-lock.yaml apps/orchestrator-api/package.json` | Passed | No package files changed. |

## Decisions Made

- Kept shared auth custom and local rather than adopting Hono `bearerAuth`, preserving exact response JSON and route behavior.
- Left `stageStatusClass` and registry `statusClass` local because their mappings encode different route-specific UI semantics.
- Added route coverage to new helper test files because the existing route test files were outside the user-approved edit scope.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- `rtk` warned that project filters are untrusted on project commands. The warning did not block execution and was not changed.

## Dirty Worktree Handling

- Preserved unrelated pre-existing untracked paths: `.planning/PROJECT.md`, `.planning/config.json`, `.planning/phases/01-bootstrap-and-architectural-inventory/`, `.planning/phases/02-living-documentation-and-historical-archive/`, `.planning/research/`, and `docs/superpowers/README.md`.
- Staged and committed only 05-01 implementation/test files during task commits.

## Known Stubs

None. Stub scan across all 05-01 created/modified implementation files found no `TODO`, `FIXME`, `placeholder`, `coming soon`, `not available`, or hardcoded empty-value UI patterns.

## Threat Review

- `T-05-01-01` mitigated: `requireRunnerAuth` preserves exact bearer comparison and 401 JSON, covered by helper and route tests.
- `T-05-01-02` mitigated: shared `escapeHtml` covers `&`, `<`, `>`, `"`, and `'`, and route rendering tests cover malicious values.
- `T-05-01-03` mitigated: `/admin/*` remains protected and now uses the shared runner auth helper.
- `T-05-01-SC` mitigated: no package installs, dependency upgrades, or package-file changes occurred.

No unplanned endpoint, schema, file-access, package, deployment, provider-env, worker, eval, or webhook trust-boundary changes were introduced.

## TDD Gate Compliance

- Task 1 RED commit present: `f95042d`; RED command failed on missing `./routeAuth.js`.
- Task 1 GREEN commit present after RED: `c8671c9`; focused and route tests passed.
- Task 2 RED commit present: `3ef750c`; RED command failed on missing `./rendering.js`.
- Task 2 GREEN commit present after RED: `1e25334`; focused and route tests passed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

05-02 can start webhook seam extraction with shared route/auth/render helpers already characterized. 05-01 did not touch webhooks, Mission Control extraction modules, worker/eval internals, package files, schema/deploy/provider env, or unrelated untracked files.

## Self-Check: PASSED

- Found created files: `apps/orchestrator-api/src/routes/routeAuth.ts`, `apps/orchestrator-api/src/routes/routeAuth.test.ts`, `apps/orchestrator-api/src/routes/rendering.ts`, `apps/orchestrator-api/src/routes/rendering.test.ts`, and `.planning/phases/05-orchestrator-hub-refactor/05-01-SUMMARY.md`.
- Found task commits: `f95042d`, `c8671c9`, `3ef750c`, and `1e25334`.
