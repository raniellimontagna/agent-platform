# Task 9 Report: Plane Bootstrap and Linear-to-Plane Migration Scripts

## What I Implemented

- Added `ensurePlaneProjectAndLabels(config)` in `apps/orchestrator-api/src/planeBootstrap.ts`.
  - Lists Plane projects in workspace `attodev`.
  - Creates project `Agent Platform` with identifier `AGP` when missing.
  - Ensures the required label set exists and returns `{ projectId, labelIds }`.
  - Keeps behavior idempotent by reusing the existing project and existing labels.
- Added `migrateLinearCardsToPlane(input)` in `apps/orchestrator-api/src/planeMigration.ts`.
  - Checks Plane by `external_source=linear` and `external_id=<Linear identifier>`.
  - Skips already-migrated cards.
  - Creates missing cards with mapped priorities and available label IDs.
  - Adds a provenance comment linking back to the original Linear card.
  - Returns `{ created, skipped, failed }` and continues after per-card failures.
- Added thin CLI wrappers:
  - `apps/orchestrator-api/src/planeBootstrapCli.ts`
  - `apps/orchestrator-api/src/planeMigrationCli.ts`
  - Both read `env`, call the helper, print JSON, and only execute when run as entrypoints.
- Added package scripts in `apps/orchestrator-api/package.json`:
  - `plane:bootstrap`
  - `plane:migrate-linear`
- Added focused tests for bootstrap and migration helpers.

## What I Tested and Exact Test Results

### Focused helper tests

Command:

```bash
rtk corepack pnpm exec vitest run apps/orchestrator-api/src/planeBootstrap.test.ts apps/orchestrator-api/src/planeMigration.test.ts
```

Result:

```text
✓ apps/orchestrator-api/src/planeBootstrap.test.ts (2 tests) 7ms
✓ apps/orchestrator-api/src/planeMigration.test.ts (2 tests) 10ms

Test Files  2 passed (2)
Tests       4 passed (4)
```

### Orchestrator API build

Command:

```bash
rtk corepack pnpm --filter @agent-platform/orchestrator-api build
```

Result:

```text
$ tsc
```

Exit code: `0`

## Review Fix: Provenance Links Render as Real Plane Anchors

### What Changed

- Extended `packages/cards/src/index.ts` so `markdownToPlaneHtml()` renders safe inline Markdown links as real `<a href="...">...</a>` anchors.
- Kept code spans opaque so the inline-code protection from Task 1 remains intact.
- Updated migration tests so provenance dedupe compares against rendered Plane HTML instead of raw Markdown.
- Added a Plane gateway test that locks the comment payload to the rendered anchor HTML.

### Commands Run and Outputs

#### RED: focused tests before the renderer fix

Command:

```bash
rtk corepack pnpm exec vitest run packages/cards/src/index.test.ts apps/orchestrator-api/src/planeMigration.test.ts packages/plane/src/index.test.ts
```

Result:

```text
FAIL  packages/cards/src/index.test.ts
FAIL  apps/orchestrator-api/src/planeMigration.test.ts
FAIL  packages/plane/src/index.test.ts
```

#### Build check before tightening the new parser

Command:

```bash
rtk corepack pnpm --filter @agent-platform/cards build
```

Result:

```text
src/index.ts(97,37): error TS2345: Argument of type 'string | undefined' is not assignable to parameter of type 'string'.
src/index.ts(114,37): error TS2345: Argument of type 'string | undefined' is not assignable to parameter of type 'string'.
src/index.ts(116,63): error TS2345: Argument of type 'string | undefined' is not assignable to parameter of type 'string'.
```

#### GREEN: cards build after fixing regex capture typing

Command:

```bash
rtk corepack pnpm --filter @agent-platform/cards build
```

Result:

```text
$ tsc
```

Exit code: `0`

#### Focused tests after rebuild

Command:

```bash
rtk corepack pnpm exec vitest run packages/cards/src/index.test.ts apps/orchestrator-api/src/planeMigration.test.ts packages/plane/src/index.test.ts
```

Result:

```text
✓ packages/cards/src/index.test.ts (5 tests) 6ms
✓ packages/plane/src/index.test.ts (8 tests) 25ms
✓ apps/orchestrator-api/src/planeMigration.test.ts (6 tests) 34ms

Test Files  3 passed (3)
Tests       19 passed (19)
```

#### Affected package builds

Commands:

```bash
rtk corepack pnpm --filter @agent-platform/plane build
rtk corepack pnpm --filter @agent-platform/orchestrator-api build
```

Result:

```text
$ tsc
Exit code: 0
```

## TDD Evidence

### RED

Command run before implementation:

```bash
rtk corepack pnpm exec vitest run apps/orchestrator-api/src/planeBootstrap.test.ts apps/orchestrator-api/src/planeMigration.test.ts
```

Relevant failing output:

```text
FAIL  apps/orchestrator-api/src/planeBootstrap.test.ts
Error: Cannot find module './planeBootstrap.js'

FAIL  apps/orchestrator-api/src/planeMigration.test.ts
Error: Cannot find module './planeMigration.js'
```

Why this was expected:

- The tests were added first.
- The production modules did not exist yet, so module-resolution failure was the correct red-state signal.

### GREEN

Command run after implementation:

```bash
rtk corepack pnpm exec vitest run apps/orchestrator-api/src/planeBootstrap.test.ts apps/orchestrator-api/src/planeMigration.test.ts
```

Relevant passing output:

```text
✓ apps/orchestrator-api/src/planeBootstrap.test.ts (2 tests) 7ms
✓ apps/orchestrator-api/src/planeMigration.test.ts (2 tests) 10ms

Test Files  2 passed (2)
Tests       4 passed (4)
```

## Files Changed

- `apps/orchestrator-api/src/planeBootstrap.ts`
- `apps/orchestrator-api/src/planeBootstrap.test.ts`
- `apps/orchestrator-api/src/planeBootstrapCli.ts`
- `apps/orchestrator-api/src/planeMigration.ts`
- `apps/orchestrator-api/src/planeMigration.test.ts`
- `apps/orchestrator-api/src/planeMigrationCli.ts`
- `apps/orchestrator-api/package.json`

## Self-Review Findings

- The bootstrap helper is idempotent for both project creation and label creation.
- The migration helper is idempotent by external provenance lookup and preserves per-card failure reporting.
- The CLI wrappers stay thin and avoid top-level execution on import.
- I kept changes inside the ownership boundary only.

## Issues or Concerns

- The brief’s package-level focused-test command,

  ```bash
  rtk corepack pnpm --filter @agent-platform/orchestrator-api test -- src/planeBootstrap.test.ts src/planeMigration.test.ts
  ```

  is currently blocked by an existing repo-level Vitest setup issue outside this task’s ownership. In this worktree, `apps/orchestrator-api` resolves a missing `vitest.setup.ts`, so that package-script path fails before running the targeted tests.

- To keep the task complete without editing non-owned files, I verified the new tests with a direct root `vitest` invocation and verified compilation with the package build command.

## Review Fixes Follow-Up

### What Changed

- Reused bootstrap from `planeMigrationCli.ts` so migration now consumes the full label map produced by `ensurePlaneProjectAndLabels`, instead of only three hard-coded label env vars.
- Added cursor pagination to Plane project and label lookup in `ensurePlaneProjectAndLabels`, so reruns stay idempotent beyond the first page.
- Retried provenance comments for cards already found by external Linear id, without creating duplicate Plane cards.
- Expanded tests to cover:
  - full label-map reuse through the migration CLI,
  - project pagination,
  - label pagination,
  - provenance comment retry on existing cards.

### Commands Run and Outputs

#### Focused helper tests

Command:

```bash
rtk corepack pnpm exec vitest run apps/orchestrator-api/src/planeBootstrap.test.ts apps/orchestrator-api/src/planeMigration.test.ts
```

Result:

```text
✓ apps/orchestrator-api/src/planeBootstrap.test.ts (4 tests) 10ms
✓ apps/orchestrator-api/src/planeMigration.test.ts (4 tests) 34ms

Test Files  2 passed (2)
Tests       8 passed (8)
```

#### Package-scoped focused test attempt

Command:

```bash
rtk proxy corepack pnpm --filter @agent-platform/orchestrator-api exec vitest run src/planeBootstrap.test.ts src/planeMigration.test.ts
```

Result:

```text
FAIL  src/planeBootstrap.test.ts [ src/planeBootstrap.test.ts ]
FAIL  src/planeMigration.test.ts [ src/planeMigration.test.ts ]
Error: Cannot find module '/root/agent-platform/.worktrees/feat-mac-card-providers-plane/apps/orchestrator-api/vitest.setup.ts'
```

Note:

- This remains the same package-local Vitest setup problem outside this task’s allowed write scope. I did not add `apps/orchestrator-api/vitest.setup.ts`.

#### Orchestrator API build

Command:

```bash
rtk proxy corepack pnpm --filter @agent-platform/orchestrator-api build
```

Result:

```text
$ tsc
```

Exit code: `0`

## Review Fix: Idempotent Provenance Comments

### What Changed

- Added optional comment lookup support to the Plane gateway via `listComments(cardId)`.
- Made comment lookup paginate through all Plane comment pages before dedupe.
- Updated `migrateLinearCardsToPlane()` so existing Plane cards only get the provenance comment when it is missing.
- Kept newly created cards posting the provenance comment immediately.
- Expanded tests to prove:
  - repeated existing-card runs do not append duplicate provenance comments,
  - missing provenance comments on existing cards are backfilled once,
  - the Plane gateway returns comment HTML across paginated responses.

### Commands Run and Outputs

#### RED: focused tests before the fix

Command:

```bash
rtk corepack pnpm exec vitest run apps/orchestrator-api/src/planeMigration.test.ts
rtk corepack pnpm exec vitest run packages/plane/src/index.test.ts
```

Result:

```text
❯ apps/orchestrator-api/src/planeMigration.test.ts (5 tests | 2 failed) 46ms
  × migrateLinearCardsToPlane > skips cards already present by external id and creates missing cards
    → expected 2 to be 1
  × migrateLinearCardsToPlane > does not append duplicate provenance comments for cards that already have one
    → expected { created: +0, commented: +0, skipped: 1, failed: [] }
      but received { created: +0, commented: 1, skipped: 1, failed: [] }

❯ packages/plane/src/index.test.ts (6 tests | 1 failed) 23ms
  × createPlaneGateway > lists existing work item comment html for provenance dedupe
    → gateway.listComments is not a function
```

#### GREEN: focused tests after the fix

Command:

```bash
rtk corepack pnpm exec vitest run apps/orchestrator-api/src/planeMigration.test.ts packages/plane/src/index.test.ts
```

Result:

```text
✓ packages/plane/src/index.test.ts (6 tests) 21ms
✓ apps/orchestrator-api/src/planeMigration.test.ts (5 tests) 37ms

Test Files  2 passed (2)
Tests       11 passed (11)
```

#### Plane package build

Command:

```bash
rtk corepack pnpm --filter @agent-platform/plane build
```

Result:

```text
$ tsc
```

Exit code: `0`

## Review Fix: Preserve Linear State and Exact-Name Labels

### What Changed

- Extended `LinearCardSnapshot` with the source Linear state name and updated the Linear GraphQL query to fetch `state.name`.
- Tightened `PlaneMigrationInput` so migration now always receives `listComments()`, making provenance-comment idempotency explicit.
- Added state resolution in `migrateLinearCardsToPlane()` and passed `stateId` into `createCard()` when a Plane mapping exists.
  - Exact-name matches are used first.
  - Fallback aliases are supported for the required semantics:
    - `Todo` -> `Todo` or `Unstarted`
    - `In Progress` -> `In Progress` or `Started`
    - `Backlog` -> `Backlog`
- Extended the Plane gateway with `listLabels()` and `listStates()` so the migration CLI can load the full project label/state maps.
- Updated `planeMigrationCli.ts` to merge bootstrap-required labels with the complete Plane label map, preserving exact-name labels that already exist in Plane even when they are outside `REQUIRED_PLANE_LABELS`.
- Added focused tests proving:
  - migrated cards pass `stateId` into `createCard()`,
  - exact-name labels outside `REQUIRED_PLANE_LABELS` are preserved when present in Plane,
  - the Plane gateway paginates label/state listing correctly.

### Commands Run and Outputs

#### RED: focused tests before the fix

Command:

```bash
rtk corepack pnpm exec vitest run apps/orchestrator-api/src/planeMigration.test.ts
rtk corepack pnpm exec vitest run packages/plane/src/index.test.ts
```

Result:

```text
❯ apps/orchestrator-api/src/planeMigration.test.ts (6 tests | 2 failed) 58ms
  × migrateLinearCardsToPlane > maps Linear states to Plane states and preserves exact-name labels already present in Plane
    → expected 1st "spy" call to have been called with [ ObjectContaining{…} ]
  × planeMigrationCli main > reuses bootstrap label ids instead of a narrow hard-coded label map
    → expected "spy" to be called with arguments: [ { plane: { …(3) }, …(3) } ]

❯ packages/plane/src/index.test.ts (7 tests | 1 failed) 26ms
  × createPlaneGateway > lists project labels and states across paginated responses
    → gateway.listLabels is not a function
```

Why this was the correct red state:

- Migration still dropped Linear state data before `createCard()`.
- The CLI still passed only the bootstrap allowlist labels.
- The Plane gateway still had no list method for full project labels/states.

#### GREEN: focused tests after the fix

Command:

```bash
rtk corepack pnpm exec vitest run apps/orchestrator-api/src/planeBootstrap.test.ts apps/orchestrator-api/src/planeMigration.test.ts packages/plane/src/index.test.ts
```

Result:

```text
✓ apps/orchestrator-api/src/planeBootstrap.test.ts (4 tests) 10ms
✓ packages/plane/src/index.test.ts (7 tests) 24ms
✓ apps/orchestrator-api/src/planeMigration.test.ts (6 tests) 39ms

Test Files  3 passed (3)
Tests       17 passed (17)
```

#### Plane package build

Command:

```bash
rtk corepack pnpm --filter @agent-platform/plane build
```

Result:

```text
$ tsc
```

Exit code: `0`

#### Orchestrator API build

Command:

```bash
rtk corepack pnpm --filter @agent-platform/orchestrator-api build
```

Result:

```text
$ tsc
```

Exit code: `0`

#### Orchestrator API build

Command:

```bash
rtk corepack pnpm --filter @agent-platform/orchestrator-api build
```

Result:

```text
$ tsc
```

Exit code: `0`
