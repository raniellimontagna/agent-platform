# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 - milestone

**Shipped:** 2026-07-02
**Phases:** 7 | **Plans:** 20 | **Sessions:** 1 autonomous run

### What Was Built

- Plane-first current-state documentation, runbook routing, and historical docs separation.
- Plane-only active provider posture with Linear retained as legacy/migration-only compatibility.
- Orchestrator webhook/admin and worker/codegen/eval/research hubs split behind focused seams and characterization tests.
- Final gate evidence proving `rtk corepack pnpm verify`, 94 Vitest files, 589 tests, and eval/regression 14/14 with score 100 and score delta 0.
- Source-backed milestone closeout audit naming removed legacy, accepted gaps, remaining debt, and next cleanup candidates.

### What Worked

- Running the work as a full GSD milestone kept large cleanup work ordered across docs, provider cutover, refactors, and final governance.
- Fail-first characterization before refactors kept route/provider/schema/package behavior stable while seams were extracted.
- Final closeout separated durable evidence from ignored generated `.eval-runs/` artifacts.
- The docs control layer prevented historical Linear-first material from competing with current Plane-first operation.

### What Was Inefficient

- Early GOV/DOC requirement metadata stayed unchecked even after Phase 1/2 verification passed; milestone audit had to reconcile it later.
- Phase 06 surfaced formatting drift outside a narrower plan scope, requiring a follow-up formatting gate before the phase could close cleanly.
- The final lifecycle still required manual orchestration around untracked planning files and archive/cleanup confirmation boundaries.

### Patterns Established

- Use `docs/README.md`, `docs/CURRENT.md`, and `docs/HISTORICAL.md` as the current/historical documentation control layer.
- Keep Plane primary and Linear legacy/migration-only until a separately confirmed destructive cleanup phase removes compatibility surfaces.
- Preserve public facades while extracting focused seam modules behind characterization tests.
- Commit final gate evidence in planning artifacts instead of force-staging ignored generated eval reports.

### Key Lessons

1. Metadata closure should happen as soon as a phase verification proves a requirement, otherwise audit sees false debt later.
2. Destructive cleanup should remain explicit even in autonomous mode; compatibility removal needs a dedicated plan, tests, and rollback notes.
3. Large hub refactors are safer when the public facade stays stable and only internal seams move.
4. Final audits should distinguish blockers from accepted debt so milestone completion can proceed without hiding follow-up work.

### Cost Observations

- Model mix: inherited Codex/GSD agents throughout the milestone.
- Sessions: 1 resumed autonomous run for phases 3-7 plus lifecycle.
- Notable: The longest verification cost was the full `rtk corepack pnpm verify` gate, which was necessary and produced durable closeout evidence.

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|---|---:|---:|---|
| v1.0 | 1 | 7 | Established Plane-first cleanup, docs control layer, seam extraction, and final evidence loop. |

### Cumulative Quality

| Milestone | Tests | Coverage | Zero-Dep Additions |
|---|---:|---|---:|
| v1.0 | 589 Vitest tests plus 14/14 eval and 14/14 regression eval | Final verify green | 0 package installs in closeout |

### Top Lessons

1. Evidence needs a committed owner file when generated artifacts are intentionally ignored.
2. Compatibility debt should be named as debt, not removed opportunistically during unrelated closeout.
3. Current docs and historical docs need separate entry points in brownfield AI-assisted repos.
