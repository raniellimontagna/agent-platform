# Roadmap: Agent Platform Retomada Arquitetural

## Milestones

| Milestone | Status | Scope | Archive |
|---|---|---|---|
| v1.0 milestone | Shipped 2026-07-02 | Phases 1-7, 20 plans | `.planning/milestones/v1.0-ROADMAP.md` |

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

Milestone v1.0 is archived. Start the next milestone with:

```bash
$gsd-new-milestone
```

## Backlog

Next cleanup candidates carried from v1.0:

- Destructive Linear cleanup after explicit confirmation, production row audit, tests, and rollback/migration notes.
- Mission Control operator controls for replay, approve, retry, cancel, and deploy actions.
- Scheduler duplicate-fire hardening with DB or queue-level concurrency protection.
- Eval harness expansion for role/workflow coverage and stronger report attribution.
- Automated stale-doc detection for removed env vars, provider paths, card labels, and historical-current guidance drift.
