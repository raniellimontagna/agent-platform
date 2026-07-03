# Roadmap: Agent Platform Retomada Arquitetural

## Overview

Milestone v1.1 finishes the Plane-only cutover by removing Linear destructively where
the audit proves it is safe, then hardens the operational surfaces that now matter
most: scheduler duplicate-fire protection, runner deploy bundle size, disk/cache
guardrails, health checks, and final E2E validation. This milestone intentionally
skips external research because it is internal cleanup against known v1.0 debt.

## v1.1 Linear Cleanup + Operational Hardening

## Milestones

| Milestone | Status | Scope | Archive |
|---|---|---|---|
| v1.0 milestone | Shipped 2026-07-02 | Phases 1-7, 20 plans | `.planning/milestones/v1.0-ROADMAP.md` |
| v1.1 Linear Cleanup + Operational Hardening | Active | Phases 8-11, Linear removal + ops hardening | — |

## Phases

**Phase Numbering:**

- Integer phases continue from v1.0.
- Decimal phases may be inserted only for urgent cleanup discovered during execution.

- [ ] **Phase 8: Linear Audit and Removal Plan** - Prove what can be deleted, migrated, or retained before destructive cleanup.
- [ ] **Phase 9: Destructive Linear Cleanup** - Remove active Linear runtime, package, env, docs, and schema surfaces behind tests and rollback notes.
- [ ] **Phase 10: Operational Hardening** - Harden scheduler concurrency, runner deploy bundles, disk/cache guardrails, and post-deploy health checks.
- [ ] **Phase 11: Final Verification and E2E Gate** - Run full verification, evals, audit, and fresh Plane-to-PR smoke flow.

## Phase Details

### Phase 8: Linear Audit and Removal Plan

**Goal**: Produce a deletion-ready Linear audit that names every remaining dependency,
production data concern, migration step, rollback path, and test gate before any
destructive removal.
**Depends on**: v1.0 milestone closeout and explicit user approval for Linear cleanup
**Requirements**: [LIN-01, LIN-02]
**Success Criteria** (what must be TRUE):

  1. Every remaining Linear reference in source, tests, docs, env examples, package files, schema, deployed config, and production rows is classified.
  2. Destructive cleanup has explicit go/no-go notes for `/webhooks/linear`, `packages/linear`, `@linear/sdk`, Linear env vars, and `linear_issue_*` fields.
  3. Migration and rollback notes cover old run identity, historical references, and schema/data recovery.
  4. The next phase can delete code with fail-first tests and without relying on conversation context.

**Plans**: 2 plans

Plans:

- [ ] 08-01: Audit Linear source, tests, docs, env, package, schema, deployed config, and production rows.
- [ ] 08-02: Write destructive cleanup plan with migration, rollback, and verification gates.

### Phase 9: Destructive Linear Cleanup

**Goal**: Remove Linear as active runtime code and operator guidance while preserving
historical clarity and any audited compatibility that must remain.
**Depends on**: Phase 8
**Requirements**: [LIN-03, LIN-04, LIN-05]
**Success Criteria** (what must be TRUE):

  1. Active Linear webhook/provider/package/SDK/env paths are removed or proven historical-only.
  2. Tests fail before removal where active Linear behavior is still reachable and pass after cleanup.
  3. Remaining identifiers use Plane/generic card terminology unless explicitly historical.
  4. Plane intake, approval, reporting, scheduler-created cards, auto-merge, and E2E run identity remain covered.

**Plans**: 3 plans

Plans:

- [ ] 09-01: Remove Linear runtime/package/env surfaces with characterization tests.
- [ ] 09-02: Migrate or remove Linear schema/data compatibility based on Phase 8 audit.
- [ ] 09-03: Clean docs/tests/fixtures and run Plane-focused regression gates.

### Phase 10: Operational Hardening

**Goal**: Reduce operational fragility found during E2E validation by hardening
scheduler concurrency, runner deploy bundles, disk/cache pressure, and health checks.
**Depends on**: Phase 9
**Requirements**: [OPS-01, OPS-02, OPS-03, OPS-04]
**Success Criteria** (what must be TRUE):

  1. Scheduler duplicate-fire is prevented by a deterministic DB and/or queue guard with concurrency tests.
  2. Runner deploy no longer sends large generated directories such as `.mcp` or `.eval-runs`.
  3. Gateway and runner disk/cache cleanup guidance is documented and safe to run after deploys.
  4. Post-deploy checks validate OmniRoute, LiteLLM, orchestrator, runner, and worker-code readiness.

**Plans**: 3 plans

Plans:

- [ ] 10-01: Add scheduler duplicate-fire guard and concurrency tests.
- [ ] 10-02: Optimize runner deploy bundle exclusions and add static deploy tests.
- [ ] 10-03: Add disk/cache guardrails and post-deploy health verification runbook/tests.

### Phase 11: Final Verification and E2E Gate

**Goal**: Prove v1.1 removed Linear safely and hardened operations without regressing
the Plane-first delivery flow.
**Depends on**: Phase 10
**Requirements**: [VFY-01, VFY-02, VFY-03, VFY-04]
**Success Criteria** (what must be TRUE):

  1. `rtk corepack pnpm verify` passes on the final v1.1 state.
  2. Eval and regression eval remain green with no score regression or documented acceptance.
  3. Fresh Plane -> Orchestrator -> Runner -> PR smoke flow completes after deploy.
  4. Milestone audit records removed Linear surfaces, operational evidence, rollback notes, and remaining debt.

**Plans**: 2 plans

Plans:

- [ ] 11-01: Run full verification, eval/regression parse, and production health checks.
- [ ] 11-02: Run final E2E smoke, write milestone audit, and prepare closeout.

## Completed Milestone

<details>
<summary>v1.0 milestone - shipped 2026-07-02</summary>

| Phase | Name | Plans | Status | Completed |
|---|---|---:|---|---|
| 1 | Bootstrap and Architectural Inventory | 2/2 | Complete | 2026-07-02 |
| 2 | Living Documentation and Historical Archive | 2/2 | Complete | 2026-07-02 |
| 3 | Plane-Only Provider Cutover | 5/5 | Complete | 2026-07-02 |
| 4 | Operational Flow Reorganization | 2/2 | Complete | 2026-07-02 |
| 5 | Orchestrator Hub Refactor | 3/3 | Complete | 2026-07-02 |
| 6 | Worker and Eval Hub Refactor | 4/4 | Complete | 2026-07-02 |
| 7 | Final Verification and Governance Closeout | 2/2 | Complete | 2026-07-02 |

Milestone artifacts:

- `.planning/milestones/v1.0-ROADMAP.md`
- `.planning/milestones/v1.0-REQUIREMENTS.md`
- `.planning/milestones/v1.0-MILESTONE-AUDIT.md`
- `.planning/MILESTONES.md`

Closeout status:

- Requirements: 24/24 satisfied.
- Phases: 7/7 verified.
- Final gate: `rtk corepack pnpm verify` passed.
- Eval regression: 14/14 scenarios, score 100, score delta 0.
- Audit status: `tech_debt`; no blocking gaps.

</details>

## Current State

Milestone v1.1 is active. Start the next phase with:

```bash
$gsd-discuss-phase 8
```

## Backlog

Cleanup candidates carried beyond v1.1:

- Mission Control operator controls for replay, approve, retry, cancel, and deploy actions.
- Eval harness expansion for role/workflow coverage and stronger report attribution.
- Automated stale-doc detection for removed env vars, provider paths, card labels, and historical-current guidance drift.

## Progress

**Execution Order:**
Phases execute in numeric order: 8 -> 9 -> 10 -> 11

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 8. Linear Audit and Removal Plan | 0/2 | Pending | — |
| 9. Destructive Linear Cleanup | 0/3 | Pending | — |
| 10. Operational Hardening | 0/3 | Pending | — |
| 11. Final Verification and E2E Gate | 0/2 | Pending | — |

## Autonomous Execution Notes

- Preferred autonomous start after this roadmap is approved:
  `$gsd-autonomous --from 8 --auto`
- Because Phase 9 is destructive, Phase 8 must produce rollback/migration notes before deletion.
- Every behavior-changing removal or hardening change must start with fail-first or characterization tests.
- Final completion requires a fresh deployed Plane -> Orchestrator -> Runner -> PR smoke run, not only local unit tests.
