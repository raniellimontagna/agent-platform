# Phase 1 Cleanup Risk Matrix

**Created:** 2026-07-02
**Purpose:** Convert the inventory into executable cleanup gates.

## Risk Scale

- **Critical:** Can break production runs, data compatibility, or verification.
- **High:** Can regress user-facing/operator flows or major tests.
- **Medium:** Can create confusion or localized bugs.
- **Low:** Mostly documentation/comment cleanup.

## Matrix

| Risk | Severity | Owner Phase | Evidence | Required Gate |
|------|----------|-------------|----------|---------------|
| Linear runtime removal breaks active provider registry | Critical | 3 | `packages/cards`, `packages/linear`, `cards.ts`, `webhooks.ts` | Plane tests for intake/approval/report + remove Linear from env examples/tests together. |
| DB schema still requires `linear_issue_*` fields | Critical | 3 / future migration | `db/schema.ts`, drizzle 0000/0015, snapshots | Data audit and migration plan before dropping/renaming columns. |
| Grafana dashboards still query `linear_issue_identifier` | High | 3 / 7 | `infra/compose/observability/.../*.json` | Switch dashboard SQL to `card_identifier` after DB compatibility strategy. |
| Webhook route mixes Plane and Linear concerns | High | 5 | `routes/webhooks.ts` | Characterization tests, then extract Plane parsing/transition/cancel seams. |
| Admin route mixes auth, rendering, Mission Control, artifacts | High | 5 | `routes/admin.ts` | Extract shared route helpers and rendering modules under tests. |
| Worker `runJob.ts` mixes too many execution steps | High | 6 | `runJob.ts` | Characterization tests for research/media/codegen/validation/commit/report. |
| Codegen prompt/apply/fix logic is one hub | High | 6 | `codegen.ts` | Split around JSON, prompt, file selection, apply, fix candidates with tests. |
| Eval harness is large and cross-cutting | Medium | 6 | `eval/runEval.ts`, `eval/types.ts` | Preserve report format and 14/14 regression score while splitting. |
| Living docs compete with historical Superpowers docs | Medium | 2 | `docs/superpowers/**` | Add active/historical index; avoid deleting records in first pass. |
| `coder-agent` compatibility key may be externally referenced | Medium | 4 | README, registry, tests | Keep alias until references and external usage are audited. |
| Duplicate auth/render/date helpers drift | Medium | 5 | routes and card helpers | Extract only after tests lock behavior. |
| Env examples enable Linear by default | Medium | 3 | `.env.example`, compose, vitest setup | Flip to Plane-only after tests and docs are aligned. |
| Historical Linear comments mislead maintainers | Low | 2 / 3 | graph node comments, ADR text | Rename comments or mark ADR historical. |

## Human Confirmation Required

Before destructive action, ask for explicit confirmation when a phase proposes:
- Dropping or renaming DB columns/indexes.
- Deleting `packages/linear` or removing `@linear/sdk`.
- Removing `/webhooks/linear` from deployed routing.
- Deleting historical docs instead of archiving/indexing them.
- Removing `coder-agent` as an accepted key.

## Recommended Cleanup Order

1. Add documentation status/index and operator source of truth.
2. Add Plane-only characterization tests and data compatibility checks.
3. Remove Linear runtime paths in one coherent provider-cutover phase.
4. Normalize flow/source-of-truth naming.
5. Extract shared route helpers and split orchestrator hubs.
6. Split worker/eval hubs.
7. Run full verification, document remaining accepted debt, and close milestone.

## Phase 2 Inputs

Phase 2 may proceed immediately with:
- `docs/README.md` as the documentation map.
- `docs/CURRENT.md` as the current-state operator index.
- `docs/HISTORICAL.md` as historical/archival index.
- README/architecture updates pointing users to the new docs map.

## Phase 3 Blockers

Do not remove Linear runtime support until these are resolved:
- Decide whether old rows with `linear_issue_*` remain indefinitely or get
  migrated to nullable/generic card fields.
- Decide whether Plane external provenance for migrated Linear cards remains.
- Update dashboards away from Linear field names.
- Update tests to prove Plane-only intake, approval, scheduler, report, card
  history, and auto-merge flows.
- Confirm deployed env no longer sets `CARD_EXTRA_PROVIDERS=linear`.

