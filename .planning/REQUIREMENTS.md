# Requirements: Agent Platform Retomada Arquitetural

**Defined:** 2026-07-02
**Core Value:** Recover control of `agent-platform` with Plane-first architecture,
living documentation, modular flows, removed legacy, and verification gates.

## v1 Requirements

### Governance

- [ ] **GOV-01**: Maintainer can read a single current-state map that names the real
  product flows, packages, entry points, infra assumptions, and ownership boundaries.

- [ ] **GOV-02**: Maintainer can distinguish living documentation from historical
  plans/specs without reading every file in `docs/`.

- [ ] **GOV-03**: Every phase in this milestone has explicit acceptance criteria,
  validation commands, and rollback/migration notes when destructive cleanup is planned.

### Documentation

- [ ] **DOC-01**: README describes current Plane-first operation without stale Linear
  framing or card-history overload.

- [ ] **DOC-02**: Architecture documentation describes current flows and module seams
  without mixing roadmap history into operational guidance.

- [ ] **DOC-03**: Runbooks are classified as active, historical, or deprecated.
- [ ] **DOC-04**: Historical `docs/superpowers` specs/plans are indexed or archived so
  they do not compete with living docs.

### Plane-Only Provider Model

- [x] **PLN-01**: Code inventory identifies every Linear dependency in source, tests,
  docs, env examples, database fields, and eval fixtures.

- [x] **PLN-02**: Plane is the only active card-provider path after migration/removal,
  unless a documented compatibility shim is proven necessary.

- [x] **PLN-03**: Webhook intake, approval, reporting, auto-merge, scheduler, and
  Mission Control behavior are covered by Plane-focused tests after Linear removal.

- [x] **PLN-04**: Legacy data/schema handling has an explicit migration, compatibility
  rule, or removal decision.

### Flow Clarity

- [ ] **FLOW-01**: Main delivery flow is documented and tested as Plane -> run ->
  approval -> worker -> review -> PR -> report.

- [ ] **FLOW-02**: Research-to-landing continuation is documented and tested as a
  separate flow with clear trigger and ownership.

- [ ] **FLOW-03**: Scheduler, Mission Control, eval harness, registry, skills, and
  artifact store have clear ownership and active runbooks.

- [ ] **FLOW-04**: Workflow labels, agent keys, skills, and model aliases have one
  canonical source of truth.

### Refactor

- [ ] **REF-01**: Shared route/auth/render helpers replace duplicated `requireAuth`,
  `escapeHtml`, `formatDate`, and similar local copies where appropriate.

- [ ] **REF-02**: Webhook handling is split into provider-neutral intake and
  Plane-specific parsing/transition logic.

- [ ] **REF-03**: Worker `runJob` responsibilities are separated into dispatch,
  research, media, codegen, validation/self-correction, commit/push, and reporting
  seams.

- [ ] **REF-04**: `codegen.ts` is split into prompt/JSON repair, file selection,
  apply, fix candidate selection, and agent-instruction concerns.

- [ ] **REF-05**: Eval harness files are split into scenario loading, scoring,
  reporting, and CLI orchestration.

- [ ] **REF-06**: Data collection research modules share policy/sanitization/output
  helpers instead of duplicating provider-specific plumbing.

### Verification

- [ ] **VER-01**: Characterization tests protect behavior before each risky refactor.
- [ ] **VER-02**: `corepack pnpm verify` passes at the end of each phase.
- [ ] **VER-03**: Evals remain at 14/14 with no score regression after provider and
  flow cleanup.

- [ ] **VER-04**: Final milestone audit includes remaining debt, accepted gaps, and
  next cleanup candidates.

## v2 Requirements

### Future Hardening

- **FUT-01**: Replace hand-written HTML admin screens with a small typed rendering
  system or proper frontend if Mission Control grows further.

- **FUT-02**: Add automated stale-doc detection for docs that mention removed env vars,
  provider paths, or card labels.

- **FUT-03**: Add graph-level architecture visualization generated from code seams.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Replacing LangGraph, BullMQ, Hono, or the monorepo tooling | Too broad for a cleanup milestone and not required to regain control. |
| Production infra reprovisioning | The goal is code/docs/flow control; infra changes need their own rollback plan. |
| New agent product features | This milestone pays down structure debt before adding capabilities. |
| Full UI rewrite of Mission Control | Can be a follow-up after route/render seams are cleaned. |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| GOV-01 | Phase 1 | Pending |
| GOV-02 | Phase 1, Phase 2 | Pending |
| GOV-03 | Phase 1 | Pending |
| DOC-01 | Phase 2 | Pending |
| DOC-02 | Phase 2 | Pending |
| DOC-03 | Phase 2 | Pending |
| DOC-04 | Phase 2 | Pending |
| PLN-01 | Phase 1 | Complete |
| PLN-02 | Phase 3 | Complete |
| PLN-03 | Phase 3 | Complete |
| PLN-04 | Phase 3 | Complete |
| FLOW-01 | Phase 4 | Pending |
| FLOW-02 | Phase 4 | Pending |
| FLOW-03 | Phase 4 | Pending |
| FLOW-04 | Phase 4 | Pending |
| REF-01 | Phase 5 | Pending |
| REF-02 | Phase 5 | Pending |
| REF-03 | Phase 6 | Pending |
| REF-04 | Phase 6 | Pending |
| REF-05 | Phase 6 | Pending |
| REF-06 | Phase 6 | Pending |
| VER-01 | Phase 5, Phase 6 | Pending |
| VER-02 | Phase 7 | Pending |
| VER-03 | Phase 7 | Pending |
| VER-04 | Phase 7 | Pending |

**Coverage:**

- v1 requirements: 24 total
- Mapped to phases: 24
- Unmapped: 0
