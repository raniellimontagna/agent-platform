# Phase 3: Plane-Only Provider Cutover - Context

**Gathered:** 2026-07-02
**Status:** Ready for planning
**Mode:** Autonomous smart discuss with `--auto` recommended defaults

<domain>
## Phase Boundary

Remove Linear from active/default runtime operation and make Plane the only
operational card provider for new work. Preserve old data readability and
explicit migration tooling for Linear-origin cards; do not drop database columns,
delete historical docs, delete `packages/linear`, or remove deployed
`/webhooks/linear` compatibility without a separate destructive confirmation.

</domain>

<decisions>
## Implementation Decisions

### Provider Cutover Scope
- Plane is the only active provider for new intake, approval, reports,
  auto-merge labels, scheduler-created cards, and card-run history.
- Linear support may remain only as a documented legacy/migration path for old
  rows and Linear-sourced Plane provenance.
- Runtime defaults, tests, docs, and env examples should stop enabling
  `CARD_EXTRA_PROVIDERS=linear`.
- Active runtime fallbacks should prefer generic card fields or Plane; fallback
  to `linear` is allowed only when the row explicitly identifies `cardProvider:
  'linear'` or a migration command is operating on Linear-origin data.

### Compatibility Strategy
- Retain `linear_issue_id` and `linear_issue_identifier` fields during this
  phase as compatibility columns for existing rows.
- Add or update tests proving existing legacy rows still resolve through generic
  card fields or an explicit migration-only compatibility branch.
- Dashboard SQL and operator docs should prefer `card_identifier`; legacy Linear
  fields may appear only as fallbacks or historical labels.
- Dropping or renaming DB columns/indexes is out of scope until a production data
  audit and migration confirmation exist.

### Test-First Requirements
- Add Plane-focused characterization tests before removing active Linear paths.
- Cover Plane webhook intake, approval resume, report/comment routing,
  auto-merge label behavior, scheduler-created cards, and card-run history.
- Update env validation tests so Plane-only defaults pass without Linear secrets
  and enabling Linear explicitly requires legacy env.
- Keep migration tests for `plane:migrate-linear` and Linear-origin Plane
  provenance.

### Documentation and Operations
- Update README, architecture, runbooks, and secrets docs to state Plane-only
  active operation.
- Move Linear wording from "optional provider" to "legacy/migration-only" unless
  the code path is still intentionally active.
- Document rollback/migration notes for any retained compatibility behavior.
- Keep historical Linear-first docs indexed as history rather than rewriting
  them as current guidance.

### the agent's Discretion
The agent may choose the smallest safe implementation path that satisfies the
phase success criteria. If a change would permanently delete route support,
package support, schema columns, or historical records, stop and request
destructive cleanup confirmation instead of proceeding silently.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- Phase 1 inventory and risk matrix classify Linear as an active optional
  provider plus migration-only data provenance.
- `packages/cards/src/index.ts` defines `CardProvider = 'plane' | 'linear'`.
- `packages/plane` already supports `externalSource: 'linear'` migration
  provenance and has tests for migrated cards.
- `apps/orchestrator-api/src/planeMigration.ts` and
  `apps/orchestrator-api/src/planeMigrationCli.ts` are the migration-only path.

### Established Patterns
- Provider registration lives in `apps/orchestrator-api/src/cards.ts` through
  `createRuntimeCards`.
- Env validation lives in `apps/orchestrator-api/src/env.ts`; current test setup
  still sets `CARD_EXTRA_PROVIDERS=linear`.
- Webhook intake currently mixes Plane and Linear in
  `apps/orchestrator-api/src/routes/webhooks.ts`.
- Run persistence still maps legacy Linear fields to generic card fields in
  `apps/orchestrator-api/src/runs.ts`.
- Queue and worker dispatch still contain fallback defaults to `linear` in
  `apps/orchestrator-api/src/queue.ts` and `apps/orchestrator-api/src/worker.ts`.

### Integration Points
- Tests to update include `apps/orchestrator-api/src/routes/webhooks.test.ts`,
  `apps/orchestrator-api/src/runs.test.ts`,
  `apps/orchestrator-api/src/cards.test.ts`,
  `apps/orchestrator-api/src/agent.test.ts`,
  scheduler/worker tests, and provider package tests.
- Docs to update include `README.md`, `docs/ARCHITECTURE.md`,
  `docs/CURRENT.md`, `docs/runbooks/webhook-tailscale.md`,
  `docs/runbooks/secrets.md`, and dashboard SQL under
  `infra/compose/observability/provisioning/dashboards`.

</code_context>

<specifics>
## Specific Ideas

- Prefer `card_identifier` in dashboards with `linear_issue_identifier` only as
  a compatibility fallback if needed.
- Do not remove `plane:migrate-linear`; it is the explicit migration seam.
- Treat `CARD_EXTRA_PROVIDERS=linear` as opt-in legacy configuration, not a
  default or test baseline.

</specifics>

<deferred>
## Deferred Ideas

- Dropping/renaming legacy DB columns and indexes is deferred pending production
  data audit and explicit destructive confirmation.
- Deleting `packages/linear`, `@linear/sdk`, or `/webhooks/linear` entirely is
  deferred pending explicit destructive confirmation.
- Removing `coder-agent` compatibility aliases is deferred to Phase 4 unless
  required by the Plane-only cutover.

</deferred>
