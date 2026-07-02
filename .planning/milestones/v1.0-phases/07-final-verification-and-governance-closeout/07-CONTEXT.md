# Phase 7: Final Verification and Governance Closeout - Context

**Gathered:** 2026-07-02
**Status:** Ready for planning
**Mode:** Final closeout phase - autonomous smart-discuss defaults applied

<domain>
## Phase Boundary

Phase 7 proves the milestone's cleanup work did not regress behavior and leaves
the repository with a usable governance record for future work. It is a final
verification and documentation phase, not a new product/refactor phase.

The phase owns final full-suite verification, eval regression confirmation,
remaining debt/gap documentation, next recommended cleanup candidates, and a
milestone audit artifact that can stand without this conversation. It must not
introduce new provider behavior, database schema changes, deploy changes,
route/API behavior, worker execution semantics, eval scoring changes, or new
runtime dependencies.

</domain>

<decisions>
## Implementation Decisions

### Closeout Posture

- **D-01:** Treat Phase 7 as verification and governance closeout. New behavior
  is out of scope unless required to fix a regression found by final gates.
- **D-02:** Run `rtk corepack pnpm verify` as the final regression gate and
  record the exact outcome. This must include lint, build, tests, eval, and
  regression eval.
- **D-03:** Eval regression must remain 14/14 with score 100 and score delta 0.
  If not, stop and diagnose before writing closeout docs.
- **D-04:** Final docs must name removed legacy behavior, accepted gaps,
  remaining debt, and next cleanup candidates with source-backed evidence from
  phase summaries and verification reports.
- **D-05:** The milestone audit must be self-contained enough for a future agent
  or human to understand what changed, what was verified, what remains deferred,
  and where to continue.

### Scope Fences

- **D-06:** Do not remove or rename remaining legacy Linear schema columns in
  this phase. Phase 3 already records that destructive cleanup requires a
  separate confirmation.
- **D-07:** Do not modify Plane labels, provider defaults, webhook behavior,
  Tailscale Funnel settings, live deploy config, route/API surfaces, package
  dependencies, model aliases, workflow labels, or database schema unless a
  final verification failure proves a regression requiring a targeted fix.
- **D-08:** Keep final documentation grounded in existing artifacts:
  `.planning/*`, phase summaries, verification reports, `docs/CURRENT.md`, and
  runbooks. Do not rely on this chat transcript as source material.
- **D-09:** If final verification finds a regression, use a narrow fix plan and
  preserve TDD/verification evidence before completing the milestone.

### Expected Plan Shape

- **07-01:** Run final verification, diagnose/fix any regression, and update
  final governance docs where they need current verification evidence.
- **07-02:** Produce milestone closeout/audit with remaining debt, accepted
  gaps, and next-phase recommendations, then run any final metadata gates.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Planning And Verification

- `.planning/ROADMAP.md` - Phase 7 scope, success criteria, and milestone
  progress.
- `.planning/REQUIREMENTS.md` - VER-02, VER-03, VER-04 plus v2/future
  requirements.
- `.planning/STATE.md` - current milestone state and accumulated decisions.
- `.planning/phases/03-plane-only-provider-cutover/03-VERIFICATION.md` -
  provider cutover evidence and deferred destructive cleanup.
- `.planning/phases/04-operational-flow-reorganization/04-VERIFICATION.md` -
  operational flow ownership evidence.
- `.planning/phases/05-orchestrator-hub-refactor/05-VERIFICATION.md` -
  orchestrator hub refactor evidence.
- `.planning/phases/06-worker-and-eval-hub-refactor/06-VERIFICATION.md` -
  worker/codegen/eval/research refactor evidence and final Phase 6 gate.
- All `*-SUMMARY.md` files in phases 03 through 06.

### Current Docs And Runbooks

- `docs/README.md`
- `docs/CURRENT.md`
- `docs/ARCHITECTURE.md`
- `docs/HISTORICAL.md`
- `docs/runbooks/eval-harness.md`
- `docs/runbooks/data-collector-agent.md`
- `docs/runbooks/landing-page-agent.md`
- `docs/runbooks/agent-skills.md`
- `docs/runbooks/secrets.md`

</canonical_refs>

<verification_contract>
## Verification Contract

- `rtk corepack pnpm verify` must pass on the final state.
- Eval and regression eval must report 14/14 scenarios, score 100, and no score
  regression.
- Package/schema guard must remain clean unless a dedicated fix requires a
  documented exception.
- Final closeout artifacts must explicitly cover VER-02, VER-03, and VER-04.
- Any remaining debt must be categorized as accepted, deferred, or recommended
  next-phase work.

</verification_contract>
