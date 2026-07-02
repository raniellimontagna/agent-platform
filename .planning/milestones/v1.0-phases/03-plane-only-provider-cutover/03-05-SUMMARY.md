---
phase: 03-plane-only-provider-cutover
plan: "05"
subsystem: provider-cutover
tags: [plane, linear-compatibility, drizzle, grafana, docs, verification]

requires:
  - phase: 03-plane-only-provider-cutover
    provides: Webhook gating and live Plane-only exposure from 03-04
provides:
  - Plane default for new generic run card identity
  - Non-destructive card_provider default migration
  - Dashboard SQL that prefers generic card identifiers with legacy fallback
  - Current docs and runbooks describing Linear as legacy/migration-only compatibility
  - Production read-only row audit evidence before future destructive cleanup
affects: [phase-04, provider-cutover, database-compatibility, operator-docs]

tech-stack:
  added: []
  patterns:
    - Generic card fields are authoritative for new rows and default to Plane.
    - Legacy Linear fields remain readable and are fallback-only in dashboards.
    - Generated GSD research cache is ignored by Biome so project verification can run.

key-files:
  created:
    - apps/orchestrator-api/drizzle/0017_plane_default_card_provider.sql
    - docs/CURRENT.md
    - .planning/phases/03-plane-only-provider-cutover/03-05-SUMMARY.md
  modified:
    - apps/orchestrator-api/src/runs.ts
    - apps/orchestrator-api/src/runs.test.ts
    - apps/orchestrator-api/src/db/schema.ts
    - apps/orchestrator-api/drizzle/meta/_journal.json
    - apps/orchestrator-api/src/cards.ts
    - apps/orchestrator-api/src/env.ts
    - biome.json
    - infra/compose/observability/provisioning/dashboards/agent-runs.json
    - infra/compose/observability/provisioning/dashboards/quality-memory.json
    - README.md
    - docs/ARCHITECTURE.md
    - docs/runbooks/webhook-tailscale.md
    - docs/runbooks/secrets.md
    - docs/runbooks/plane-migration-2026-06-20.md

key-decisions:
  - "New generic run/card identity defaults to Plane while legacy-only Linear identity remains readable."
  - "Legacy Linear columns are retained; only the card_provider default changed."
  - "Production audit found no legacy-only run rows, but destructive column cleanup still requires a separate confirmation."

patterns-established:
  - "Dashboard SQL should use coalesce(card_identifier, linear_issue_identifier) for operator-visible card labels."
  - "Linear active runtime remains explicit compatibility only through CARD_EXTRA_PROVIDERS=linear."

requirements-completed: [PLN-01, PLN-02, PLN-03, PLN-04]

coverage:
  - id: D1
    description: New generic run/card identity defaults to Plane and legacy Linear identity remains readable
    requirement: PLN-04
    verification:
      - kind: unit
        ref: "rtk corepack pnpm test -- apps/orchestrator-api/src/runs.test.ts"
        status: pass
      - kind: static
        ref: "grep schema and migration non-destructive checks"
        status: pass
    human_judgment: false
  - id: D2
    description: Dashboard SQL prefers generic card identifiers with legacy fallback and provider context
    requirement: PLN-01
    verification:
      - kind: static
        ref: "grep dashboard SQL fallback checks"
        status: pass
      - kind: other
        ref: "JSON.parse dashboard validation"
        status: pass
    human_judgment: false
  - id: D3
    description: Current docs and runbooks describe Plane-only active operation and Linear migration-only compatibility
    requirement: PLN-02
    verification:
      - kind: static
        ref: "rtk grep docs Plane-only and compatibility wording"
        status: pass
    human_judgment: false
  - id: D4
    description: Final phase verification and eval regression pass after cutover
    requirement: PLN-03
    verification:
      - kind: other
        ref: "rtk corepack pnpm verify"
        status: pass
      - kind: other
        ref: "rtk corepack pnpm eval:regression"
        status: pass
    human_judgment: false
  - id: D5
    description: Production read-only row audit recorded before future destructive schema cleanup
    requirement: PLN-04
    verification:
      - kind: manual_procedural
        ref: "LXC 201 read-only Postgres SELECT counts, 2026-07-02T12:37Z"
        status: pass
    human_judgment: false

metrics:
  started: 2026-07-02T12:24:10Z
  completed: 2026-07-02T12:38:13Z
  duration_seconds: 843
  tasks: 3
  files_modified: 17
status: complete
---

# Phase 03 Plan 05: Plane Run Defaults, Dashboards, and Production Audit Summary

**Plane is now the default card provider for new run identity, with retained Linear data compatibility and verified operator evidence.**

## Performance

- **Duration:** 14m03s
- **Started:** 2026-07-02T12:24:10Z
- **Completed:** 2026-07-02T12:38:13Z
- **Tasks:** 3
- **Files modified:** 17

## Accomplishments

- Added fail-first tests for Plane default run card identity, explicit legacy Linear compatibility, resolver validation, and schema default behavior.
- Updated `resolveRunCardFields`, Drizzle schema, and migration SQL so new generic card rows default to Plane without dropping legacy columns.
- Updated Grafana dashboard SQL to show `card_provider` and prefer `card_identifier` with `linear_issue_identifier` fallback.
- Updated README/current architecture/runbooks so Linear is legacy/migration-only compatibility and rollback-only external intake.
- Recorded a read-only production row audit from LXC 201 before any future destructive schema cleanup.

## Task Commits

1. **Task 1 RED: Run card compatibility tests** - `cdd5452` (test)
2. **Task 1 GREEN: Plane default run compatibility and migration** - `62c5781` (feat)
3. **Task 2 verification unblocker** - `7a31cfb` (fix)
4. **Task 2 dashboards and current docs** - `cbab142` (docs)
5. **Task 3 production row audit** - no code commit; evidence recorded in this summary.

## Files Created/Modified

- `apps/orchestrator-api/src/runs.ts` - Defaults provider-less generic card input to Plane and validates complete identities.
- `apps/orchestrator-api/src/runs.test.ts` - Covers Plane default, legacy Linear compatibility, invalid identities, and schema default.
- `apps/orchestrator-api/src/db/schema.ts` - Changes `runs.cardProvider` default to Plane while retaining legacy columns.
- `apps/orchestrator-api/drizzle/0017_plane_default_card_provider.sql` - Default-only migration for `card_provider`.
- `apps/orchestrator-api/drizzle/meta/_journal.json` - Registers migration `0017_plane_default_card_provider`.
- `apps/orchestrator-api/src/cards.ts` and `apps/orchestrator-api/src/env.ts` - Remove impossible primary-Linear branches that blocked TypeScript build.
- `biome.json` - Ignores generated GSD research cache that blocked lint.
- `infra/compose/observability/provisioning/dashboards/*.json` - Prefer generic card labels with legacy fallback and provider context.
- `README.md`, `docs/ARCHITECTURE.md`, `docs/CURRENT.md`, and runbooks - Document Plane-only active operation, Linear compatibility, rollback, and audit requirements.

## Verification

| Command | Result | Notes |
|---------|--------|-------|
| `rtk corepack pnpm test -- apps/orchestrator-api/src/runs.test.ts` | Failed before GREEN | RED evidence: 5 failures for Plane default, missing validation, ambiguity handling, and schema default. |
| `rtk corepack pnpm test -- apps/orchestrator-api/src/runs.test.ts` | Passed | 74 files / 474 tests passed under Vitest selection behavior. |
| `grep -En 'linearIssueId|linearIssueIdentifier|cardProvider' apps/orchestrator-api/src/db/schema.ts` | Passed | Legacy columns retained; `cardProvider` defaults to Plane. |
| `! grep -En 'DROP COLUMN|DROP TABLE|RENAME COLUMN|ALTER COLUMN "linear_issue' apps/orchestrator-api/drizzle/0017_plane_default_card_provider.sql` | Passed | Migration is non-destructive for legacy columns. |
| `node -e JSON.parse(...)` for both dashboard files | Passed | Dashboard JSON remains valid. |
| Dashboard grep checks for direct legacy aliases and fallback SQL | Passed | No direct primary `linear_issue_identifier AS issue/metric`; fallback coalesce present. |
| `rtk corepack pnpm test -- apps/orchestrator-api/src/runs.test.ts apps/orchestrator-api/src/planeMigration.test.ts packages/plane/src/index.test.ts` | Passed | 74 files / 474 tests passed under Vitest selection behavior. |
| `rtk corepack pnpm test -- apps/orchestrator-api/src/cards.test.ts apps/orchestrator-api/src/env.test.ts` | Passed | Provider/env focused tests passed after verification blocker fix. |
| `rtk corepack pnpm verify` | Passed | Lint checked 225 files; recursive build passed; Vitest 74 files / 474 tests passed; eval 14/14 score 100; regression eval 14/14 score 100. |
| `rtk corepack pnpm eval:regression` | Passed | 14/14 scenarios passed; score 100; delta 0. |

## Production Row Audit

Read-only audit ran on LXC 201 against `orchestrator-postgres-1`:

```sql
BEGIN READ ONLY;
SELECT
  count(*) AS total_runs,
  count(*) FILTER (WHERE card_id IS NOT NULL AND card_identifier IS NOT NULL) AS generic_complete,
  count(*) FILTER (WHERE card_id IS NULL OR card_identifier IS NULL) AS missing_generic_identity,
  count(*) FILTER (
    WHERE (card_id IS NULL OR card_identifier IS NULL)
      AND (linear_issue_id IS NOT NULL OR linear_issue_identifier IS NOT NULL)
  ) AS legacy_only_identity,
  count(*) FILTER (WHERE card_provider = 'plane') AS plane_rows,
  count(*) FILTER (WHERE card_provider = 'linear') AS linear_rows,
  count(*) FILTER (WHERE card_provider IS NULL) AS null_provider_rows,
  count(*) FILTER (
    WHERE linear_issue_id IS NOT NULL AND linear_issue_identifier IS NOT NULL
  ) AS legacy_columns_complete
FROM runs;
ROLLBACK;
```

Result:

| total_runs | generic_complete | missing_generic_identity | legacy_only_identity | plane_rows | linear_rows | null_provider_rows | legacy_columns_complete |
|------------|------------------|--------------------------|----------------------|------------|-------------|--------------------|-------------------------|
| 130 | 130 | 0 | 0 | 15 | 115 | 0 | 130 |

Interpretation: production has no legacy-only rows missing generic card identity, but legacy columns remain retained until a separate destructive confirmation exists.

## Decisions Made

- Default generic run/card identity to Plane at resolver and schema-default levels.
- Keep legacy `linear_issue_id` and `linear_issue_identifier` non-null and readable.
- Use dashboard fallback SQL instead of rewriting historical data.
- Treat `/webhooks/linear` and `CARD_EXTRA_PROVIDERS=linear` as rollback/migration-only compatibility.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Used grep fallback for unavailable `rg` in `rtk bash -lc`**
- **Found during:** Task 1 and Task 2 static checks
- **Issue:** `rg` was unavailable inside `rtk bash -lc`, causing plan commands using `rg` to fail.
- **Fix:** Used equivalent `grep -E` / `grep -R` checks and recorded the substitution.
- **Files modified:** None
- **Verification:** Grep checks passed for schema, migration, dashboard, and docs assertions.
- **Committed in:** N/A

**2. [Rule 3 - Blocking] Ignored generated GSD research cache in Biome**
- **Found during:** Task 2 full verification
- **Issue:** `rtk corepack pnpm verify` failed at `biome check .` because pre-existing untracked `.planning/research/.cache/*.json` generated cache files were not formatted.
- **Fix:** Added `.planning/research/.cache` to `biome.json` ignore rules so generated cache does not block project lint.
- **Files modified:** `biome.json`
- **Verification:** `rtk corepack pnpm verify` passed.
- **Committed in:** `7a31cfb`

**3. [Rule 3 - Blocking] Removed impossible primary-Linear branches after Plane-only cutover**
- **Found during:** Task 2 full verification
- **Issue:** Recursive TypeScript build failed in `cards.ts` and `env.ts` because earlier Plane-only cutover code compared `CARD_PRIMARY_PROVIDER` to `linear` after that branch had already been rejected.
- **Fix:** Removed dead primary-Linear validation branches and made explicit Linear compatibility require `LINEAR_API_KEY` in direct runtime construction.
- **Files modified:** `apps/orchestrator-api/src/cards.ts`, `apps/orchestrator-api/src/env.ts`
- **Verification:** Provider/env focused tests passed and `rtk corepack pnpm verify` passed.
- **Committed in:** `7a31cfb`

---

**Total deviations:** 3 auto-fixed (3 Rule 3 blocking)
**Impact on plan:** All deviations were required to run the exact verification gate. No schema drops, route deletions, package installs, or destructive production actions were performed.

## Issues Encountered

- Initial full verify failed on generated GSD research cache formatting, then on TypeScript dead-branch checks from prior Plane-only cutover work. Both blockers were fixed and the exact verify command passed.
- `rtk` warned that project filters are untrusted. This warning did not block execution and was not changed.

## Known Stubs

None. Stub scan hits were false positives for object accumulators and documentation that explains placeholder secret guards.

## Threat Review

- `T-03-05-01` mitigated: TDD proves generic card identity defaults to Plane while explicit legacy Linear identity remains readable.
- `T-03-05-02` mitigated: migration `0017_plane_default_card_provider.sql` only changes the `card_provider` default.
- `T-03-05-03` mitigated: dashboards show provider context and generic card identifiers with legacy fallback.
- `T-03-05-04` mitigated: secrets docs keep Linear secrets migration/rollback-only and use placeholders only as sample values.
- `T-03-05-SC` mitigated: no package installs, package removals, or dependency upgrades occurred.

## User Setup Required

None for this plan. Future destructive cleanup still requires separate operator confirmation after reviewing the production row audit.

## Next Phase Readiness

Phase 4 can proceed with Plane-only current operation. Legacy Linear columns and package support remain intentionally retained as compatibility/migration seams until a future destructive cleanup is explicitly approved.

## Self-Check: PASSED

- Found migration: `apps/orchestrator-api/drizzle/0017_plane_default_card_provider.sql`.
- Found summary: `.planning/phases/03-plane-only-provider-cutover/03-05-SUMMARY.md`.
- Found task commits: `cdd5452`, `62c5781`, `7a31cfb`, `cbab142`.
- Verified production row audit counts were recorded from read-only LXC 201 Postgres query.
