# Requirements: Agent Platform Retomada Arquitetural

**Defined:** 2026-07-03
**Milestone:** v1.1 Linear Cleanup + Operational Hardening
**Core Value:** Recover control of `agent-platform` with a Plane-only, modular,
verifiable system that can keep evolving without accumulating accidental complexity.

## v1.1 Requirements

### Linear Cleanup

- [ ] **LIN-01**: Maintainer can review a source-backed audit of every remaining Linear dependency in source, tests, docs, env examples, package manifests, schema, production rows, and deployed configuration before deletion.
- [ ] **LIN-02**: Maintainer can see explicit migration and rollback notes for any destructive Linear removal, including old run rows and `linear_issue_*` schema fields.
- [ ] **LIN-03**: New runtime operation has no active Linear webhook, provider package, SDK dependency, env requirement, registry path, or graph/provider enablement path.
- [ ] **LIN-04**: Legacy Linear references that remain after cleanup are either removed, migrated to generic `card_*`/Plane terminology, or documented as historical-only with tests proving they are not active runtime paths.
- [ ] **LIN-05**: Plane intake, approval, reporting, scheduling, auto-merge, and E2E run identity remain covered by focused tests after Linear deletion.

### Operational Hardening

- [ ] **OPS-01**: Scheduler duplicate-fire is prevented by a deterministic guard at the database and/or queue layer and covered by concurrency tests.
- [ ] **OPS-02**: Runner deploy bundles exclude generated/heavy local artifacts such as `.mcp`, `.eval-runs`, build caches, and transient worktrees while still shipping required source and config.
- [ ] **OPS-03**: Gateway and runner deployments have documented disk/cache guardrails that prevent stale images or build cache from blocking future updates.
- [ ] **OPS-04**: Health checks and post-deploy verification commands prove gateway, OmniRoute, LiteLLM, orchestrator, runner, and worker-code are reachable after deploy.

### Verification

- [ ] **VFY-01**: `rtk corepack pnpm verify` passes after Linear cleanup and operational hardening.
- [ ] **VFY-02**: Worker eval and regression eval remain green with no score regression, or any accepted delta is documented.
- [ ] **VFY-03**: A fresh Plane -> Orchestrator -> Runner -> PR smoke flow completes after the milestone changes.
- [ ] **VFY-04**: Final milestone audit records removed Linear surfaces, remaining accepted debt, rollback notes, and operational evidence.

## v1.2 Requirements

### Future Product and Governance

- **MC-01**: Mission Control supports protected operator actions such as replay, approve, retry, cancel, and deploy.
- **EVAL-01**: Eval harness covers more role/workflow combinations with stronger report attribution.
- **DOC-01**: Automated stale-doc detection flags removed env vars, provider paths, card labels, and current-vs-historical guidance drift.
- **GRAPH-01**: Architecture visualization can be generated from code seams and planning artifacts.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Mission Control write/action UI | Valuable, but separate product slice; v1.1 focuses on removing Linear and hardening operations. |
| Full eval harness expansion | Deferred so v1.1 can keep verification focused on no-regression gates and one E2E smoke flow. |
| Replacing LangGraph, BullMQ, Hono, Docker Compose, or the monorepo tooling | Too broad and not required for this cleanup/hardening milestone. |
| New agent product capabilities | This milestone pays down legacy and reliability debt before adding features. |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| LIN-01 | Phase 8 | Pending |
| LIN-02 | Phase 8 | Pending |
| LIN-03 | Phase 9 | Pending |
| LIN-04 | Phase 9 | Pending |
| LIN-05 | Phase 9 | Pending |
| OPS-01 | Phase 10 | Pending |
| OPS-02 | Phase 10 | Pending |
| OPS-03 | Phase 10 | Pending |
| OPS-04 | Phase 10 | Pending |
| VFY-01 | Phase 11 | Pending |
| VFY-02 | Phase 11 | Pending |
| VFY-03 | Phase 11 | Pending |
| VFY-04 | Phase 11 | Pending |

**Coverage:**

- v1.1 requirements: 13 total
- Mapped to phases: 13
- Unmapped: 0

---
*Requirements defined: 2026-07-03*
*Last updated: 2026-07-03 after v1.1 milestone definition*
