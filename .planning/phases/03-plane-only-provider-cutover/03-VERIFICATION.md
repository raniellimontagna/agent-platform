---
phase: 03-plane-only-provider-cutover
verified: 2026-07-02T15:59:37Z
status: passed
score: 10/10 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 3: Plane-Only Provider Cutover Verification Report

**Phase Goal:** Remove Linear as an active provider path when inventory confirms Plane covers current usage, while preserving explicit migration/compatibility handling for old data.
**Verified:** 2026-07-02T15:59:37Z
**Status:** passed
**Re-verification:** No - initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | Linear webhook, gateway, env requirements, docs, and active runtime wiring are removed or converted to documented migration-only compatibility. | VERIFIED | `env.ts` rejects `CARD_PRIMARY_PROVIDER=linear` and requires Linear secrets only when `CARD_EXTRA_PROVIDERS` includes `linear`; `cards.ts` rejects Linear primary and registers Linear only as an extra provider; `/webhooks/linear` returns disabled 410 unless explicit legacy config is present; env examples default `CARD_EXTRA_PROVIDERS=`; docs call Linear legacy/migration-only. |
| 2 | Provider registry, env validation, and graph enablement are Plane-only by default for new work. | VERIFIED | `vitest.setup.ts` sets `CARD_PRIMARY_PROVIDER: 'plane'` and empty extras; `createRuntimeCards` registers Plane by default; `agent.ts` builds graph providers from primary plus explicit extras, so default graph set is Plane only. |
| 3 | Queue, worker, and scheduler paths do not silently route ambiguous new work to Linear. | VERIFIED | `resolvePlanJobCardRef` throws when provider/card cannot be resolved; worker plan/resume/comment/continuation paths use persisted provider/card fields; static check found no `?? 'linear'` fallback in queue/worker/scheduler runtime files. |
| 4 | Old BullMQ jobs and legacy Linear-origin rows remain compatible when explicit or persisted identity exists. | VERIFIED | Queue and worker tests cover old missing-provider jobs resolved from persisted run provider/card fields and explicit Linear jobs; `resolveRunCardFields` keeps explicit legacy Linear rows readable. |
| 5 | Plane-focused tests cover intake, approval, report, auto-merge labels, scheduler-created cards, and card-run history. | VERIFIED | Fresh `rtk corepack pnpm verify` ran the full Vitest suite: 81 files / 531 tests passed. Coverage includes webhooks, graph report/merge/auto-merge, scheduler, admin Mission Control history, queue, worker, runs, Plane gateway, and migration tests. |
| 6 | Database legacy fields have a documented compatibility/removal strategy and tests for existing rows if retained. | VERIFIED | `runs.test.ts` covers Plane defaults, legacy Linear identity, ambiguity rejection, and retained legacy columns; docs/runbooks state that `linear_issue_id` and `linear_issue_identifier` stay until read-only audit and destructive confirmation. |
| 7 | New generic run/card rows default to Plane, not Linear. | VERIFIED | `resolveRunCardFields({ cardId, cardIdentifier })` returns `cardProvider: 'plane'`; `schema.ts` defaults `runs.cardProvider` to `plane`; migration `0017_plane_default_card_provider.sql` changes only the `card_provider` default. |
| 8 | Current dashboards and docs describe Plane-only active operation with legacy/migration-only Linear compatibility. | VERIFIED | Dashboard SQL uses `coalesce(card_identifier, linear_issue_identifier)` plus `card_provider`; JSON parse passed for both dashboard files; README, `docs/CURRENT.md`, webhook, secrets, and migration runbooks describe Plane active and Linear legacy/migration-only. |
| 9 | No destructive schema, package, route, or historical-doc deletion occurred. | VERIFIED | `packages/linear` and `@linear/sdk` remain referenced; `/webhooks/linear` route remains present but gated; migration has no `DROP COLUMN`, `DROP TABLE`, or `RENAME COLUMN`; legacy columns remain in `schema.ts`. |
| 10 | `corepack pnpm verify` and eval regression pass after cutover. | VERIFIED | Fresh command `rtk corepack pnpm verify` exited 0: Biome checked 239 files, recursive builds passed, Vitest 81/81 files and 531/531 tests passed, eval 14/14 score 100, regression eval 14/14 score 100. |

**Score:** 10/10 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `apps/orchestrator-api/src/env.ts` | Plane-only env defaults with explicit legacy compatibility. | VERIFIED | Rejects Linear primary and conditionally requires Linear secrets only for explicit extra provider. |
| `apps/orchestrator-api/src/cards.ts` | Runtime card registry Plane primary, Linear explicit extra only. | VERIFIED | Rejects `CARD_PRIMARY_PROVIDER=linear`; imports Linear gateway only for explicit compatibility. |
| `apps/orchestrator-api/src/agent.ts` | Graph construction follows configured providers. | VERIFIED | Enabled graph providers come from primary plus extras; tests prove default Plane graph and explicit Linear graph opt-in. |
| `apps/orchestrator-api/src/routes/webhooks.ts` | Plane active webhook, Linear gated compatibility route. | VERIFIED | `/webhooks/linear` remains but is disabled unless `CARD_EXTRA_PROVIDERS=linear`; `/webhooks/plane` path remains active. |
| `apps/orchestrator-api/src/queue.ts`, `apps/orchestrator-api/src/worker.ts`, `apps/orchestrator-api/src/scheduleWorker.ts` | No silent Linear fallback in async runtime. | VERIFIED | Explicit/persisted identity required; scheduler uses `PLANE_SCHEDULED_LABEL_ID` only. |
| `apps/orchestrator-api/src/runs.ts`, `apps/orchestrator-api/src/db/schema.ts`, `apps/orchestrator-api/drizzle/0017_plane_default_card_provider.sql` | Plane default with retained legacy columns. | VERIFIED | Resolver and schema default to Plane; migration is default-only and non-destructive. |
| `README.md`, `docs/ARCHITECTURE.md`, `docs/CURRENT.md`, `docs/runbooks/*` | Current docs state Plane-only active operation and Linear compatibility strategy. | VERIFIED | Current docs and runbooks contain Plane-active and legacy/migration-only wording plus rollback/removal notes. |
| `infra/compose/observability/provisioning/dashboards/*.json` | Dashboards prefer generic identifiers with legacy fallback. | VERIFIED | JSON parse passed; direct primary `linear_issue_identifier AS issue/metric` patterns absent. |
| Phase checkpoint artifacts | Live deployment and production audit checkpoints recorded. | VERIFIED | `03-04-CHECKPOINT.md` is resolved; user-provided orchestration evidence records Plane-only deploy exposure and production audit counts. |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `env.ts` | `cards.ts` | `createRuntimeCards(env)` in `agent.ts` | WIRED | Runtime registry consumes validated provider env; Linear primary is rejected in both layers. |
| `agent.ts` | graph runtime | `resolveEnabledGraphProviders` + `resolveGraphBinding` | WIRED | Default graph is Plane; explicit Linear graph exists only when configured as extra provider. |
| `routes/webhooks.ts` | queue/run creation | `handleAiReadyCard`, `handleApprovalCard`, `agentQueue.add` | WIRED | Plane webhook creates Plane runs/jobs; Linear route is gated before signature/enqueue logic. |
| `queue.ts` | `worker.ts` | `resolvePlanJobCardRef(job.data, run)` | WIRED | Worker loads persisted run first and resolves provider/card before graph/gateway selection. |
| `scheduleWorker.ts` | run creation and queue | `cards.primary.createCard` + `createRun` + `agentQueue.add` | WIRED | Scheduler-created cards persist provider/card identity and enqueue provider-aware plan jobs. |
| `runs.ts` | DB schema/migration | `resolveRunCardFields` + `runs.cardProvider.default('plane')` | WIRED | Application resolver and schema default both make generic identity Plane-first. |
| Dashboards | DB run identity | SQL `coalesce(card_identifier, linear_issue_identifier)` | WIRED | Operator views prefer generic card identity while retaining old-row fallback. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|---|---|---|---|---|
| `routes/webhooks.ts` | Plane work item identity | Signed Plane payload normalized by `normalizePlaneWebhook` | Yes | FLOWING |
| `worker.ts` | `run.cardProvider` / `run.cardId` | `getRun(runId)` before graph/gateway selection | Yes | FLOWING |
| `scheduleWorker.ts` | created card provider/id | `cards.primary.createCard` result | Yes | FLOWING |
| `runs.ts` | persisted `cardProvider`, `cardId`, `cardIdentifier` | `resolveRunCardFields(input)` then DB insert | Yes | FLOWING |
| Dashboard JSON | card label/provider columns | SQL against `runs` table | Yes | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Full cutover verification gate | `rtk corepack pnpm verify` | Exit 0; lint/build/Vitest/eval/regression all passed. | PASS |
| No active Linear default in setup/env examples | `rtk rg -n "CARD_EXTRA_PROVIDERS=linear" vitest.setup.ts apps/orchestrator-api/.env.example infra/compose/orchestrator/.env.example` | No matches; command exited 1 as expected. | PASS |
| No silent Linear fallback in async runtime | `rtk rg -n "\\?\\? ['\\\"]linear|LINEAR_SCHEDULED_LABEL_ID" apps/orchestrator-api/src/queue.ts apps/orchestrator-api/src/worker.ts apps/orchestrator-api/src/scheduleWorker.ts` | No matches; command exited 1 as expected. | PASS |
| Migration is non-destructive for legacy columns | `rtk rg -n "DROP COLUMN|DROP TABLE|RENAME COLUMN|ALTER COLUMN \"linear_issue" apps/orchestrator-api/drizzle/0017_plane_default_card_provider.sql` | No matches; command exited 1 as expected. | PASS |
| Dashboards remain valid JSON | `rtk node -e "JSON.parse(...)"` | Both dashboard files parsed successfully. | PASS |

### Probe Execution

No phase-declared or conventional `scripts/*/tests/probe-*.sh` probes were found for this phase.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| PLN-01 | 03-01, 03-02, 03-04, 03-05 | Code inventory identifies Linear dependencies across source, tests, docs, env examples, database fields, and eval fixtures. | SATISFIED | Linear package/dependency retained and visible; docs/env/schema/dashboard surfaces converted to explicit legacy/migration compatibility. |
| PLN-02 | 03-01, 03-02, 03-03, 03-04, 03-05 | Plane is the only active card-provider path unless compatibility shim is proven necessary. | SATISFIED | Linear primary rejected; default env/setup/examples are Plane-only; webhook/queue/worker/scheduler runtime paths are Plane-first and require explicit/persisted identity. |
| PLN-03 | 03-01, 03-02, 03-03, 03-04, 03-05 | Webhook intake, approval, reporting, auto-merge, scheduler, and Mission Control behavior are covered by Plane-focused tests after Linear removal. | SATISFIED | Fresh Vitest suite passed; named tests cover Plane webhook intake/approval, graph report/merge/auto-merge, scheduler-created cards, and admin Mission Control history. |
| PLN-04 | 03-01, 03-03, 03-05 | Legacy data/schema handling has explicit migration, compatibility, or removal decision. | SATISFIED | `runs` resolver/schema/migration retain legacy columns, default generic rows to Plane, test legacy rows, and document future destructive cleanup requirements. |

No orphaned Phase 3 requirements were found: `.planning/REQUIREMENTS.md` maps `PLN-02`, `PLN-03`, and `PLN-04` to Phase 3, and `PLN-01` is the Phase 1 inventory dependency reused by Phase 3 plans.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---:|---|---|---|
| `packages/graph/src/nodes/merging.test.ts` | 16-28 | `vi.fn(async () => {})` no-op mocks | Info | Test doubles only; not production stubs. |
| `apps/orchestrator-api/src/env.ts`, `docs/runbooks/secrets.md` | various | `placeholder` wording | Info | Placeholder-secret guard and docs, not incomplete implementation. |

No unreferenced `TBD`, `FIXME`, or `XXX` markers were found in phase-touched files.

### Human Verification Required

None remaining. Live/deployed checks were resolved by `03-04-CHECKPOINT.md` plus the user-provided orchestration evidence for deployed env/Funnel/Linear webhook state. Production DB audit counts were user-provided and recorded in phase artifacts; destructive cleanup remains explicitly out of scope.

### Gaps Summary

No blocking gaps found. The phase goal is achieved in the codebase: active defaults and runtime paths are Plane-only, Linear is retained only as explicit legacy/migration compatibility, legacy data remains readable, and the fresh verification gate passed.

---

_Verified: 2026-07-02T15:59:37Z_
_Verifier: the agent (gsd-verifier)_
