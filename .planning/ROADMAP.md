# Roadmap: Agent Platform Retomada Arquitetural

## Overview

This milestone restores control over `agent-platform` through an aggressive but
test-gated cleanup. It starts with a factual inventory, consolidates living docs,
removes Linear legacy if safe, clarifies active flows, decomposes the largest hubs,
and finishes with full verification and governance notes. The roadmap is designed
for `$gsd-autonomous` execution in Codex: each phase has boundaries,
requirements, success criteria, and validation expectations.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work.
- Decimal phases may be inserted only for urgent cleanup discovered during execution.

- [x] **Phase 1: Bootstrap and Architectural Inventory** - Build the factual baseline before destructive cleanup.
- [x] **Phase 2: Living Documentation and Historical Archive** - Consolidate current docs and separate history from operations.
- [x] **Phase 3: Plane-Only Provider Cutover** - Remove or migrate Linear legacy behind tests and migration notes. (completed 2026-07-02)
- [x] **Phase 4: Operational Flow Reorganization** - Make each active flow explicit, owned, and testable. (completed 2026-07-02)
- [x] **Phase 5: Orchestrator Hub Refactor** - Split duplicated route/provider/render/orchestration responsibilities. (completed 2026-07-02)
- [ ] **Phase 6: Worker and Eval Hub Refactor** - Split worker codegen/research/validation/eval responsibilities.
- [ ] **Phase 7: Final Verification and Governance Closeout** - Prove the system, document remaining debt, and close the milestone.

## Phase Details

### Phase 1: Bootstrap and Architectural Inventory

**Goal**: Produce a factual current-state inventory that identifies living docs,
historical docs, provider dependencies, flow entry points, large hubs, duplication
hotspots, tests/evals, env vars, schema concerns, and cleanup risks.
**Depends on**: Nothing (first phase)
**Requirements**: [GOV-01, GOV-02, GOV-03, PLN-01]
**Success Criteria** (what must be TRUE):

  1. Maintainer can see one inventory document listing docs, flows, modules, env vars, providers, schema concerns, and risky files.
  2. Every Linear reference is classified as active dependency, migration-only, test fixture, historical doc, or removable.
  3. Large hubs and duplicated helpers are ranked by risk and cleanup order.
  4. The next phases have explicit blockers or go/no-go notes based on the inventory.

**Plans**: 2 plans

Plans:

- [ ] 01-01: Inventory docs, flows, provider references, env vars, schema fields, tests, evals, and code hubs.
- [ ] 01-02: Produce a cleanup risk matrix and mark decisions that require human confirmation.

### Phase 2: Living Documentation and Historical Archive

**Goal**: Make documentation usable again by separating current operational docs from
historical planning artifacts and updating the top-level map to match the current
Plane-first architecture.
**Depends on**: Phase 1
**Requirements**: [GOV-02, DOC-01, DOC-02, DOC-03, DOC-04]
**Success Criteria** (what must be TRUE):

  1. README and architecture docs describe the current system without stale roadmap/card-history overload.
  2. Active runbooks are indexed by operator task and stale/one-off runbooks are archived or marked historical.
  3. `docs/superpowers` plans/specs are indexed as historical records and no longer compete with living docs.
  4. Documentation names the canonical flow, agent identities, and ownership boundaries.

**Plans**: 2 plans

Plans:

- [ ] 02-01: Rewrite current-state docs and create an active/historical docs index.
- [ ] 02-02: Archive or mark stale docs, preserving history without leaving misleading operator guidance.

### Phase 3: Plane-Only Provider Cutover

**Goal**: Remove Linear as an active provider path when inventory confirms Plane covers
current usage, while preserving explicit migration/compatibility handling for old data.
**Depends on**: Phase 1, Phase 2
**Requirements**: [PLN-01, PLN-02, PLN-03, PLN-04]
**Success Criteria** (what must be TRUE):

  1. Linear webhook, gateway, env requirements, docs, and active runtime wiring are removed or converted to a documented migration-only seam.
  2. Plane-focused tests cover intake, approval, report, auto-merge labels, scheduler-created cards, and card-run history.
  3. Database legacy fields have a documented compatibility/removal strategy and tests for existing rows if retained.
  4. `corepack pnpm verify` and eval regression pass after the cutover.

**Plans**: 5/5 plans complete

Plans:

- [x] 03-01-PLAN.md
- [x] 03-02-PLAN.md
- [x] 03-03-PLAN.md
- [x] 03-04-PLAN.md
- [x] 03-05-PLAN.md

- [x] 03-01: Add characterization tests for current Plane behavior and legacy data handling.
- [x] 03-02: Cut provider registry, env validation, and graph enablement to Plane-only defaults.
- [x] 03-03: Cut queue, worker, and scheduler provider resolution with old BullMQ compatibility checkpoint.
- [x] 03-04: Gate legacy webhook behavior and update Plane-only env examples.
- [x] 03-05: Handle schema compatibility, dashboards, docs, migration notes, and final verification.

### Phase 4: Operational Flow Reorganization

**Goal**: Re-express the active product flows as owned, testable workflows with clear
entry points and no duplicated conceptual sources of truth.
**Depends on**: Phase 3
**Requirements**: [FLOW-01, FLOW-02, FLOW-03, FLOW-04]
**Success Criteria** (what must be TRUE):

  1. Main delivery flow is documented and covered from Plane intake through final report.
  2. Research-to-landing continuation has an explicit trigger, ownership, artifacts, and failure behavior.
  3. Scheduler, Mission Control, eval harness, registry, skills, and artifact store have active docs or deliberate archive status.
  4. Agent keys, skill registry, model aliases, labels, and workflow labels have a named canonical source.

**Plans**: 2/2 plans complete

Plans:

- [x] 04-01-PLAN.md — Consolidate flow documentation and align it with tests and code entry points.
- [x] 04-02-PLAN.md — Normalize workflow/agent/label/source-of-truth naming across docs and code.

### Phase 5: Orchestrator Hub Refactor

**Goal**: Split high-risk orchestrator hubs and duplicated route utilities into smaller
modules without changing behavior.
**Depends on**: Phase 4
**Requirements**: [REF-01, REF-02, VER-01]
**Success Criteria** (what must be TRUE):

  1. Shared auth/render/date/HTML helpers replace duplicated route-local implementations where appropriate.
  2. Webhook handling is separated into Plane parsing, label transition detection, run enqueue/resume, and cancellation concerns.
  3. Admin/Mission Control rendering is split into focused helpers or modules with tests around output-critical behavior.
  4. Characterization tests fail before refactor when seams are broken and pass after refactor.

**Plans**: 3/3 plans complete

Plans:

- [x] 05-01-PLAN.md
- [x] 05-02-PLAN.md
- [x] 05-03-PLAN.md

- [x] 05-01: Extract shared route/auth/render helpers with tests.
- [x] 05-02: Refactor `routes/webhooks.ts` into Plane intake and run transition seams.
- [x] 05-03: Refactor `routes/admin.ts`/Mission Control rendering into smaller units.

### Phase 6: Worker and Eval Hub Refactor

**Goal**: Split worker execution, codegen, research, and eval modules by responsibility
while preserving validation, self-correction, and eval behavior.
**Depends on**: Phase 5
**Requirements**: [REF-03, REF-04, REF-05, REF-06, VER-01]
**Success Criteria** (what must be TRUE):

  1. `runJob.ts` delegates research, media generation, codegen, validation/self-correction, commit/push, and reporting through focused seams.
  2. `codegen.ts` separates prompt construction, JSON extraction/repair, file selection, apply logic, and fix candidate logic.
  3. Eval harness is split into scenario loading, scoring, report rendering, and CLI orchestration without changing reports.
  4. Firecrawl/Playwright/Instagram/Apify research paths share policy, sanitization, and output helpers where safe.

**Plans**: 4 plans

Plans:
**Wave 1**

- [ ] 06-01: Refactor `runJob.ts` around execution seams and characterization tests.

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 06-02: Refactor `codegen.ts` around prompt, JSON, file, apply, and fix modules.

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 06-03: Refactor eval harness around scenario loading, scenario running, report, trend, and harness helpers.

**Wave 4** *(blocked on Wave 3 completion)*

- [ ] 06-04: Refactor data-collector research output helpers and run the full phase gate.

**Cross-cutting constraints:**

- VER-01/D-02: characterization tests exist and fail before helper extraction, then pass after moves.

### Phase 7: Final Verification and Governance Closeout

**Goal**: Prove the cleanup did not regress behavior, document remaining debt, and leave
the project with a stable governance loop for future work.
**Depends on**: Phase 6
**Requirements**: [VER-02, VER-03, VER-04]
**Success Criteria** (what must be TRUE):

  1. `corepack pnpm verify` passes on the final state.
  2. Worker eval regression remains 14/14 with score 100 or any delta is explicitly justified and accepted.
  3. Final docs name remaining debt, removed legacy, accepted gaps, and next recommended phases.
  4. Milestone audit can be run without relying on this conversation for context.

**Plans**: 2 plans

Plans:

- [ ] 07-01: Run full verification, fix regressions, and update final governance docs.
- [ ] 07-02: Produce milestone closeout with remaining debt and next-phase recommendations.

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Bootstrap and Architectural Inventory | 2/2 | Complete | 2026-07-02 |
| 2. Living Documentation and Historical Archive | 2/2 | Complete | 2026-07-02 |
| 3. Plane-Only Provider Cutover | 5/5 | Complete    | 2026-07-02 |
| 4. Operational Flow Reorganization | 2/2 | Complete    | 2026-07-02 |
| 5. Orchestrator Hub Refactor | 3/3 | Complete    | 2026-07-02 |
| 6. Worker and Eval Hub Refactor | 0/4 | Not started | - |
| 7. Final Verification and Governance Closeout | 0/2 | Not started | - |

## Autonomous Execution Notes

- Preferred start: `$gsd-autonomous --from 1 --to 2` for the first run, then
  continue in ranges after reviewing inventory and docs.

- Full run after confidence: `$gsd-autonomous --from 1`.
- Use `--interactive` if a phase surfaces destructive decisions: schema deletion,
  permanent doc archive deletion, or removal of compatibility aliases.

- Any phase that removes legacy behavior must write tests before removal and include
  rollback or migration notes in its plan.
