# Phase 1 Inventory: Agent Platform Current State

**Created:** 2026-07-02
**Scope:** Read-only architectural/documentation inventory for the aggressive
cleanup milestone.

## Executive Findings

- The project is documented, but not yet controlled as a living documentation
  system. There are 77 Markdown files under `docs/`: 23 runbooks, 7 decision
  docs/flows, and 46 historical Superpowers plans/specs.
- Plane is already the operational default in docs and env defaults, but Linear
  is still an active optional runtime provider, not just stale prose.
- The biggest cleanup risk is the provider transition: env examples enable
  Linear, tests exercise Linear webhooks, DB schema still has non-null
  `linear_issue_*` fields, dashboards query those fields, and runtime fallbacks
  still default to `linear` in several places.
- The largest technical hubs are concentrated in worker eval/executor and
  orchestrator route modules. Refactors should start with characterization
  tests and helper extraction, not broad rewrites.
- Several duplicated helpers are obvious: auth middleware, HTML escaping/date
  formatting, provider/card fallback logic, and webhook transition handling.

## Documentation Inventory

| Area | Count | Status | Notes |
|------|------:|--------|-------|
| `docs/*.md` total | 77 | Mixed | Broad coverage, but living and historical docs are intermixed. |
| `docs/runbooks` | 23 | Mostly living | Needs operator-task index and stale status labels. |
| `docs/decisions` | 7 | Mixed | ADR-0005 is historical Linear-first context; flow doc is current Plane-first. |
| `docs/superpowers` | 46 | Historical | 23 plans and 23 specs; useful evidence, not current guidance. |
| Root docs | 3 | Living | `README.md`, `CLAUDE.md`, `AGENTS.md` are current entry points. |

Living docs that should remain prominent:
- `README.md`
- `CLAUDE.md`
- `docs/ARCHITECTURE.md`
- `docs/decisions/FLOW-agent-workflow.md`
- `docs/runbooks/webhook-tailscale.md`
- `docs/runbooks/mission-control.md`
- `docs/runbooks/research-to-landing-workflow.md`
- `docs/runbooks/eval-harness.md`
- `docs/runbooks/agent-skills.md`
- `docs/runbooks/secrets.md`
- `docs/runbooks/proxmox-estado-atual.md`

Historical or special-status docs:
- `docs/superpowers/**`: historical implementation plans/specs.
- `docs/decisions/ADR-0005-linear-github-agent-workflow.md`: historical
  Linear-first decision; should be superseded or annotated by Plane-first docs.
- `docs/runbooks/plane-migration-2026-06-20.md`: migration record, not a
  recurring operator runbook.
- `docs/runbooks/auto-merge-e2e-final.md` and
  `docs/runbooks/auto-merge-opt-in-post-deploy-20260616.md`: E2E records or
  narrow validation notes; should be marked historical unless still used.

## Active Operational Flows

| Flow | Entry Point | Code | Docs | Status |
|------|-------------|------|------|--------|
| Plane `ai-ready` intake | `/webhooks/plane` | `routes/webhooks.ts`, `runs.ts`, `queue.ts` | `webhook-tailscale.md`, `FLOW-agent-workflow.md` | Active |
| Approval resume | Plane `approved` label | `routes/webhooks.ts`, `worker.ts`, `packages/graph` | `FLOW-agent-workflow.md` | Active |
| Scheduler-created cards | `/schedules`, schedule worker | `routes/schedules.ts`, `scheduleWorker.ts` | scattered | Active, needs docs consolidation |
| Research-to-landing continuation | Plane workflow label | `worker.ts`, worker executor/research modules | `research-to-landing-workflow.md`, `mission-control.md` | Active |
| Mission Control read-only E2E view | `/admin/mission-control` | `routes/admin.ts`, `missionTimeline.ts` | `mission-control.md` | Active, route hub is large |
| Eval regression | `pnpm eval`, `pnpm verify` | `apps/worker-code/src/eval/*` | `eval-harness.md` | Active |
| Agent/tool/skill registries | REST + MCP surfaces | `agents.ts`, `tools.ts`, `registry.ts`, `agent-skills/**` | `agent-skills.md`, `superpowers-planning.md` | Active |
| Linear legacy webhook | `/webhooks/linear` | `routes/webhooks.ts`, `packages/linear` | `webhook-tailscale.md` | Active optional legacy |

## Linear Reference Classification

### Active Runtime Dependency

These references affect current runtime behavior and cannot be deleted without
tests/migration:

- `packages/cards/src/index.ts`: `CardProvider = 'plane' | 'linear'`.
- `packages/linear/**`: Linear gateway package and `@linear/sdk` dependency.
- `apps/orchestrator-api/src/cards.ts`: creates Linear gateway when enabled.
- `apps/orchestrator-api/src/env.ts`: Linear env, labels, and validation gates.
- `apps/orchestrator-api/src/routes/webhooks.ts`: active `/webhooks/linear`.
- `apps/orchestrator-api/src/runs.ts`: legacy create/read helpers and default
  fallback to `linear`.
- `apps/orchestrator-api/src/queue.ts`: legacy card-provider fallback.
- `apps/orchestrator-api/src/worker.ts`: fallback and graph routing still use
  `linear` when persisted provider is absent.
- `apps/orchestrator-api/src/agent.ts`: provider-specific graph binding.
- `apps/orchestrator-api/src/scheduleWorker.ts`: Linear scheduled label fallback.
- `apps/orchestrator-api/package.json` and `pnpm-lock.yaml`: Linear package/deps.

### Schema/Data Compatibility

- `apps/orchestrator-api/src/db/schema.ts`: `runs.linearIssueId` and
  `runs.linearIssueIdentifier` are non-null; `cardProvider` defaults to
  `linear`.
- `apps/orchestrator-api/drizzle/0000_*`: original Linear columns.
- `apps/orchestrator-api/drizzle/0009_*`: active issue index on
  `linear_issue_id`.
- `apps/orchestrator-api/drizzle/0015_card_providers.sql`: backfills generic
  `card_*` fields from Linear fields.
- Drizzle snapshots still preserve the legacy column shape.

### Migration-Only

- `apps/orchestrator-api/src/planeMigration.ts`
- `apps/orchestrator-api/src/planeMigrationCli.ts`
- `apps/orchestrator-api/src/planeMigration.test.ts`
- `docs/runbooks/plane-migration-2026-06-20.md`
- Plane gateway support for `externalSource: 'linear'` provenance.

These should likely remain until old cards/rows are confirmed migrated.

### Tests/Fixtures

- `vitest.setup.ts` sets `CARD_EXTRA_PROVIDERS=linear`.
- `apps/orchestrator-api/src/routes/webhooks.test.ts` covers Linear webhook
  behavior and Plane behavior.
- `apps/orchestrator-api/src/agent.test.ts`, `cards.test.ts`, `runs.test.ts`
  exercise provider compatibility.
- `packages/cards/src/index.test.ts`, `packages/linear/src/index.test.ts`,
  `packages/plane/src/index.test.ts` include Linear compatibility/migration
  cases.

### Historical Docs or Comments

- `docs/superpowers/**`: historical card-era plans/specs.
- `docs/decisions/ADR-0005-linear-github-agent-workflow.md`: historical ADR.
- Some comments in `packages/graph/src/nodes/*` still say "Linear" while code
  has provider-generic gateway patterns.

### Removable After Tests

- Linear-only dashboard SQL aliases such as `linear_issue_identifier AS issue`
  in Grafana JSON can be migrated to `card_identifier`.
- Linear-specific comments in graph nodes can be renamed to provider/card
  wording.
- Env examples can stop enabling Linear by default after Phase 3 confirms
  legacy support is off or migration-only.

## Environment Inventory

Orchestrator env is the main provider gate:
- `CARD_PRIMARY_PROVIDER` defaults to `plane`.
- `CARD_EXTRA_PROVIDERS` defaults to empty in schema, but `.env.example`,
  compose examples, and `vitest.setup.ts` currently enable `linear`.
- Plane env: `PLANE_BASE_URL`, `PLANE_API_KEY`, `PLANE_WORKSPACE_SLUG`,
  `PLANE_PROJECT_ID`, `PLANE_WEBHOOK_SECRET`, label/state IDs.
- Linear env: `LINEAR_API_KEY`, `LINEAR_WEBHOOK_SECRET`, label IDs,
  `LINEAR_TEAM_ID`, scheduled/auto-merge/done IDs.
- Production requires `PLANE_WEBHOOK_SECRET` when Plane is primary.
- If Linear is enabled, env validation requires Linear API/webhook secrets.

Worker env is less provider-specific and centers on execution:
- LLM, runner, Git, sandbox, Firecrawl, Playwright, Instagram Graph, Apify,
  Higgsfield, and Cloudflare deploy knobs.
- No direct Linear/Plane provider switching in worker env.

## Test and Eval Surface

Current verification gate:
- `rtk corepack pnpm verify`
- Under the hood: lint, recursive build, Vitest, worker eval, eval regression.
- Fresh baseline before this GSD run: 71 test files, 441 tests, eval 14/14,
  regression eval 14/14, score 100.

High-value characterization tests already exist:
- Plane migration: `apps/orchestrator-api/src/planeMigration.test.ts`
- Plane gateway: `packages/plane/src/index.test.ts`
- Webhooks: `apps/orchestrator-api/src/routes/webhooks.test.ts`
- Runs/card compatibility: `apps/orchestrator-api/src/runs.test.ts`,
  `apps/orchestrator-api/src/cards.test.ts`
- Worker run job/codegen/research: `apps/worker-code/src/executor/*.test.ts`
- Eval harness: `apps/worker-code/src/eval/*.test.ts`

Phase 3 should add/update tests before removing Linear runtime paths.

## Large Hubs

| File | Lines | Risk | Why It Matters |
|------|------:|------|----------------|
| `apps/worker-code/src/eval/runEval.ts` | 1019 | High | CLI orchestration, reporting, scenario execution in one file. |
| `apps/worker-code/src/eval/types.ts` | 909 | Medium | Type surface is broad; splitting must avoid churn. |
| `apps/worker-code/src/executor/codegen.ts` | 740 | High | Prompting, JSON repair, file selection, apply/fix logic mixed. |
| `apps/worker-code/src/executor/firecrawlResearch.ts` | 669 | Medium | API, sanitization, policy, output formatting mixed. |
| `apps/orchestrator-api/src/routes/admin.ts` | 649 | High | Auth, rendering, Mission Control, artifacts, card-runs in one route. |
| `apps/worker-code/src/executor/runJob.ts` | 492 | High | Research, media, codegen, validation, commit, report orchestration. |
| `apps/orchestrator-api/src/routes/webhooks.ts` | 453 | High | Plane and Linear parsing, signatures, label transitions, queueing. |
| `apps/orchestrator-api/src/runs.ts` | 418 | High | Legacy Linear fields and generic card fields are intertwined. |
| `apps/orchestrator-api/src/worker.ts` | 409 | Medium | Runtime dispatch and provider fallback logic. |
| `apps/worker-code/src/eval/scoring.ts` | 377 | Medium | Eval scoring rules and report checks. |

## Duplication Hotspots

- `requireAuth` appears in multiple route modules:
  `apps/orchestrator-api/src/routes/{admin,agents,schedules,tools}.ts` and
  worker routes `jobs.ts`, `higgsfieldTools.ts`.
- `escapeHtml` and `formatDate` appear in route rendering modules and card
  formatting helpers.
- Plane/Linear provider fallback logic is repeated across `cards.ts`, `runs.ts`,
  `queue.ts`, `worker.ts`, `agent.ts`, and `webhooks.ts`.
- Webhook signature and label-transition handling are route-local.
- Dashboard/admin HTML rendering is embedded in route handlers.
- Historical `linear_issue_identifier AS issue` dashboard conventions duplicate
  the old data model even after generic card fields were introduced.

## Go/No-Go For Next Phases

Phase 2 documentation cleanup is **go**:
- It is docs-only and should not affect runtime behavior.
- It can add status/index docs without deleting historical records.

Phase 3 Linear cutover is **conditional go**:
- Go only after Plane behavior characterization tests are explicit.
- No-go for DB column removal until production rows and dashboard SQL are
  audited/migrated.
- No-go for deleting `packages/linear` until env examples, tests, webhooks, and
  package graph are updated together.

Phase 5/6 refactors are **go after Phase 4 names sources of truth**:
- Begin with helper extraction where tests already cover behavior.
- Avoid splitting `runJob.ts`, `codegen.ts`, or `webhooks.ts` without
  characterization tests around current behavior.

