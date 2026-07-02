# Phase 07 Milestone Audit - VER-04 Closeout

**Status:** complete for VER-04 on 2026-07-02
**Scope:** final verification and governance closeout for the v1 cleanup milestone
**Primary evidence:** `.planning/phases/07-final-verification-and-governance-closeout/07-FINAL-GATE-EVIDENCE.md`

This audit is the self-contained closeout record for the cleanup milestone. It
does not introduce runtime behavior. It consumes Plan 07-01's final gate proof
for VER-02 and VER-03, then records the source-backed removed legacy behavior,
accepted gaps, remaining debt, and next cleanup candidates required by VER-04.

## Milestone Scope

| Area | Closeout position | Source evidence |
|---|---|---|
| Provider governance | Plane is the primary provider for new work; Linear remains legacy/migration-only compatibility. | `CLAUDE.md`; `docs/CURRENT.md`; `.planning/phases/03-plane-only-provider-cutover/03-VERIFICATION.md` |
| Runtime behavior | Phase 07 is verification/docs closeout only; provider defaults, Plane labels, workflow labels, model aliases, routes, webhooks, deploy config, package files, database schema, migrations, and Linear compatibility behavior stay unchanged. | `.planning/phases/07-final-verification-and-governance-closeout/07-CONTEXT.md`; `.planning/phases/07-final-verification-and-governance-closeout/07-02-PLAN.md` |
| Final verification | The full `rtk corepack pnpm verify` gate passed before this closeout. | `.planning/phases/07-final-verification-and-governance-closeout/07-FINAL-GATE-EVIDENCE.md`; `.planning/phases/07-final-verification-and-governance-closeout/07-01-SUMMARY.md` |
| Eval regression | Latest parsed eval evidence is 14/14, score 100, score delta 0, and no regressed scenarios. | `.planning/phases/07-final-verification-and-governance-closeout/07-FINAL-GATE-EVIDENCE.md`; `.eval-runs/latest-report.json`; `docs/runbooks/eval-harness.md` |
| Governance record | Current docs and historical docs remain separate; this audit is the closeout record, not a new operator runbook. | `docs/README.md`; `docs/CURRENT.md`; `docs/HISTORICAL.md`; `.planning/phases/04-operational-flow-reorganization/04-VERIFICATION.md` |

## Final Verification Evidence

| Requirement | Result | Evidence |
|---|---|---|
| VER-02 | PASS. Plan 07-01 ran `rtk corepack pnpm verify`; lint, build, tests, eval, and regression eval all passed. | `.planning/phases/07-final-verification-and-governance-closeout/07-FINAL-GATE-EVIDENCE.md`; `.planning/phases/07-final-verification-and-governance-closeout/07-01-SUMMARY.md` |
| VER-03 | PASS. Eval remained 14/14 with score 100, score delta 0, and zero regressed scenarios. | `.planning/phases/07-final-verification-and-governance-closeout/07-FINAL-GATE-EVIDENCE.md`; `.eval-runs/latest-report.json`; `docs/runbooks/eval-harness.md` |
| VER-04 | PASS after this plan. This audit and linked docs name removed legacy, accepted gaps, remaining debt, and next cleanup candidates with source evidence. | `.planning/phases/07-final-verification-and-governance-closeout/07-02-PLAN.md`; this file; `docs/CURRENT.md`; `docs/HISTORICAL.md` |

## Requirement Disposition

| Requirement | Disposition | Notes | Source evidence |
|---|---|---|---|
| VER-02 | Complete | Final full gate passed on the closeout state before VER-04 docs were finalized. | `.planning/REQUIREMENTS.md`; `.planning/phases/07-final-verification-and-governance-closeout/07-FINAL-GATE-EVIDENCE.md` |
| VER-03 | Complete | The durable planning evidence and latest ignored eval artifact agree on 14/14, score 100, delta 0. | `.planning/REQUIREMENTS.md`; `.planning/phases/07-final-verification-and-governance-closeout/07-FINAL-GATE-EVIDENCE.md`; `.eval-runs/latest-report.json` |
| VER-04 | Complete | The closeout artifact is source-backed and records remaining debt, accepted gaps, and next cleanup candidates. | `.planning/REQUIREMENTS.md`; `.planning/ROADMAP.md`; `.planning/phases/07-final-verification-and-governance-closeout/07-02-PLAN.md`; this file |

## removed legacy behavior

| Removed legacy behavior | Closeout status | Source evidence |
|---|---|---|
| Linear is no longer an active default provider for new work. | Removed from active operation; Plane is primary, and Linear primary is rejected by provider/env behavior recorded in Phase 3. | `.planning/phases/03-plane-only-provider-cutover/03-VERIFICATION.md`; `.planning/phases/03-plane-only-provider-cutover/03-05-SUMMARY.md`; `docs/CURRENT.md` |
| Linear webhook intake is no longer public/default active intake. | `/webhooks/plane` is active; `/webhooks/linear` is legacy compatibility only and disabled unless explicit legacy config is present. | `.planning/phases/03-plane-only-provider-cutover/03-VERIFICATION.md`; `.planning/phases/05-orchestrator-hub-refactor/05-VERIFICATION.md`; `docs/CURRENT.md` |
| Scheduler-created work no longer relies on Linear scheduled labels. | New scheduled work creates Plane cards and uses Plane card identity; Linear scheduled labels are legacy compatibility only. | `.planning/phases/03-plane-only-provider-cutover/03-VERIFICATION.md`; `docs/runbooks/scheduler.md`; `docs/CURRENT.md` |
| Operator-facing identity no longer treats Linear issue identifiers as primary. | Generic `card_*` identity and `card_provider` are authoritative for new rows; dashboards can fall back to legacy Linear fields for old data. | `.planning/phases/03-plane-only-provider-cutover/03-05-SUMMARY.md`; `.planning/phases/03-plane-only-provider-cutover/03-VERIFICATION.md` |
| Linear-first historical docs no longer compete with current operation. | Current docs route to Plane-first guidance; historical Linear-first records are retained for audit/context. | `.planning/phases/04-operational-flow-reorganization/04-VERIFICATION.md`; `.planning/phases/04-operational-flow-reorganization/04-02-SUMMARY.md`; `docs/README.md`; `docs/HISTORICAL.md` |
| Large route and worker hubs no longer carry the same undocumented ownership burden. | Orchestrator and worker/eval/research seams were split behind characterization tests without behavior changes. | `.planning/phases/05-orchestrator-hub-refactor/05-VERIFICATION.md`; `.planning/phases/05-orchestrator-hub-refactor/05-03-SUMMARY.md`; `.planning/phases/06-worker-and-eval-hub-refactor/06-VERIFICATION.md`; `.planning/phases/06-worker-and-eval-hub-refactor/06-04-SUMMARY.md` |

## accepted gaps

| accepted gaps | Disposition | Why accepted now | Source evidence |
|---|---|---|---|
| Linear compatibility remains in code and schema. | Accepted compatibility gap. | Old rows and rollback/migration compatibility remain readable; destructive cleanup requires separate confirmation. | `.planning/phases/03-plane-only-provider-cutover/03-VERIFICATION.md`; `.planning/phases/03-plane-only-provider-cutover/03-05-SUMMARY.md`; `docs/CURRENT.md` |
| `linear_issue_*` columns remain. | Accepted destructive cleanup gap. | Phase 07 explicitly must not remove or rename these columns. | `.planning/phases/07-final-verification-and-governance-closeout/07-CONTEXT.md`; `.planning/phases/03-plane-only-provider-cutover/03-05-SUMMARY.md`; `docs/CURRENT.md` |
| Mission Control remains read-only. | Accepted operator-surface gap. | The current verified slice intentionally excludes launch, replay, approval, retry, cancel, and deploy controls. | `.planning/phases/05-orchestrator-hub-refactor/05-VERIFICATION.md`; `.planning/phases/05-orchestrator-hub-refactor/05-03-SUMMARY.md`; `docs/runbooks/mission-control.md` |
| Scheduler cross-process duplicate fire prevention is still deferred. | Accepted runtime-hardening gap. | Current scheduler tests and docs cover existing behavior; stronger locking/uniqueness is future hardening. | `.planning/phases/04-operational-flow-reorganization/04-01-SUMMARY.md`; `docs/runbooks/scheduler.md` |
| Markdown semantic coverage depends on static checks. | Accepted documentation-checking gap. | Biome can report zero matching Markdown files, so Phase 07 uses `rtk rg` source/term checks for closeout evidence. | `.planning/phases/04-operational-flow-reorganization/04-01-SUMMARY.md`; `.planning/phases/04-operational-flow-reorganization/04-02-SUMMARY.md`; `.planning/phases/07-final-verification-and-governance-closeout/07-VALIDATION.md` |
| `.eval-runs/` artifacts remain ignored. | Accepted evidence-retention gap. | Eval artifacts refresh on disk but are intentionally ignored; durable closeout evidence is committed in planning files. | `.planning/phases/07-final-verification-and-governance-closeout/07-FINAL-GATE-EVIDENCE.md`; `.planning/phases/07-final-verification-and-governance-closeout/07-01-SUMMARY.md`; `.eval-runs/latest-report.json` |
| Live external Plane/Tailscale/Linear state is not rechecked by Phase 07. | Accepted scope gap. | Phase 07 uses recorded Phase 3 evidence and avoids live deploy/provider mutation unless a final regression requires it. | `.planning/phases/07-final-verification-and-governance-closeout/07-RESEARCH.md`; `.planning/phases/07-final-verification-and-governance-closeout/07-CONTEXT.md`; `.planning/phases/03-plane-only-provider-cutover/03-VERIFICATION.md` |

## remaining debt

| remaining debt | Category | Required next step | Source evidence |
|---|---|---|---|
| Destructive cleanup of Linear compatibility surfaces. | Provider/schema cleanup | Separately confirm and test removal before dropping or renaming `linear_issue_*`, deleting `/webhooks/linear`, removing `packages/linear`, or removing `@linear/sdk`. | `.planning/phases/03-plane-only-provider-cutover/03-VERIFICATION.md`; `.planning/phases/03-plane-only-provider-cutover/03-05-SUMMARY.md`; `.planning/phases/07-final-verification-and-governance-closeout/07-CONTEXT.md`; `docs/CURRENT.md` |
| Requirements hygiene for older governance/documentation checkboxes. | Governance metadata | Reconcile still-unchecked GOV/DOC requirement rows against completed Phase 1/2 summaries in a separate metadata cleanup. | `.planning/REQUIREMENTS.md`; `.planning/ROADMAP.md`; `.planning/STATE.md` |
| Mission Control operator controls. | Admin/operator UX | Add explicit, bearer-protected, tested controls for replay, approve, retry, cancel, and schedule actions only in a dedicated UI/control slice. | `docs/runbooks/mission-control.md`; `.planning/phases/05-orchestrator-hub-refactor/05-VERIFICATION.md`; `.planning/phases/05-orchestrator-hub-refactor/05-03-SUMMARY.md` |
| Scheduler duplicate-fire hardening. | Runtime reliability | Add a DB-level lock, uniqueness guard, or equivalent cross-process protection with tests. | `docs/runbooks/scheduler.md`; `.planning/phases/04-operational-flow-reorganization/04-01-SUMMARY.md` |
| Eval harness role coverage and reporting. | Verification hardening | Add planner quality checks, role-linked checks, workflow `workflow:landing-page` scenarios, and better role-attribution in regression reports. | `docs/runbooks/eval-harness.md`; `.planning/phases/06-worker-and-eval-hub-refactor/06-VERIFICATION.md`; `.eval-runs/latest-report.json` |
| Automated stale-doc detection. | Documentation governance | Build a doc scanner for removed env vars, provider paths, card labels, and stale historical-current guidance. | `.planning/REQUIREMENTS.md`; `.planning/phases/07-final-verification-and-governance-closeout/07-RESEARCH.md`; `docs/HISTORICAL.md` |

## next cleanup candidates

| next cleanup candidate | Why it is next | Required guardrail | Source evidence |
|---|---|---|---|
| Linear destructive cleanup plan. | Active operation is Plane-first, but compatibility code/schema remains. | Must be explicit, separately confirmed, TDD-backed, and include rollback/migration notes before destructive cleanup. | `.planning/phases/03-plane-only-provider-cutover/03-VERIFICATION.md`; `.planning/phases/03-plane-only-provider-cutover/03-05-SUMMARY.md`; `docs/CURRENT.md` |
| Requirements and roadmap metadata reconciliation. | Some v1 governance/docs requirements remain unchecked despite completed phases and summaries. | Treat as metadata cleanup only unless source summaries reveal a real behavior/docs gap. | `.planning/REQUIREMENTS.md`; `.planning/ROADMAP.md`; `.planning/STATE.md` |
| Mission Control action slice. | The read-only surface is verified; operators still lack explicit action controls. | Add auth, CSRF/safety review as applicable, focused route/UI tests, and no implicit live side effects. | `docs/runbooks/mission-control.md`; `.planning/phases/05-orchestrator-hub-refactor/05-VERIFICATION.md` |
| Scheduler runtime hardening. | A low-probability duplicate-fire race remains documented. | Add concurrency tests and DB/queue ownership proof before changing scheduler behavior. | `docs/runbooks/scheduler.md`; `.planning/phases/04-operational-flow-reorganization/04-VERIFICATION.md` |
| Eval harness expansion. | Final eval is green; next value is broader deterministic coverage, not gate repair. | Preserve no-live-LLM/GitHub/Plane/Linear harness contract and keep regression delta checks. | `docs/runbooks/eval-harness.md`; `.planning/phases/06-worker-and-eval-hub-refactor/06-VERIFICATION.md`; `.planning/phases/07-final-verification-and-governance-closeout/07-FINAL-GATE-EVIDENCE.md` |
| Stale-doc scanner. | Future cleanup can prevent old Linear/provider guidance from reappearing as current docs. | Use source-owner maps in `docs/README.md` and `docs/CURRENT.md`; do not rewrite historical evidence as current guidance. | `docs/README.md`; `docs/CURRENT.md`; `docs/HISTORICAL.md`; `.planning/REQUIREMENTS.md` |

## Scope-Fence Attestation

- No provider defaults, Plane labels, workflow labels, model aliases, route/API
  behavior, webhook behavior, deployment config, package files, database schema,
  migrations, runtime code, or Linear compatibility behavior are intentionally
  changed by Plan 07-02.
- Linear remains legacy/migration-only. This audit creates no Linear sync work
  and does not remove or rename `linear_issue_*` columns.
- Final docs must point to source owners and evidence instead of copying live
  secrets, mutable label IDs, or private deployment values.
- The docs-only scope is verified by the Plan 07-02 static diff gate against
  package/schema/route/provider/deploy/model/label files.

## Evidence Appendix

| Evidence file | Used for |
|---|---|
| `.planning/phases/07-final-verification-and-governance-closeout/07-FINAL-GATE-EVIDENCE.md` | VER-02 final full gate and VER-03 parsed eval proof. |
| `.planning/phases/07-final-verification-and-governance-closeout/07-01-SUMMARY.md` | Plan 07-01 decisions, generated eval artifact policy, and scope preservation. |
| `.eval-runs/latest-report.json` | Latest eval fields: 14/14, score 100, score delta 0, no regressed scenarios. |
| `.planning/phases/03-plane-only-provider-cutover/03-VERIFICATION.md` | Plane-only active provider proof, Linear legacy compatibility, non-destructive schema posture. |
| `.planning/phases/03-plane-only-provider-cutover/03-05-SUMMARY.md` | Plane default run identity, production row audit, retained Linear columns, destructive cleanup constraint. |
| `.planning/phases/04-operational-flow-reorganization/04-VERIFICATION.md` | Current docs/runbooks/source-owner verification and historical/current separation. |
| `.planning/phases/04-operational-flow-reorganization/04-01-SUMMARY.md` | Scheduler and Mission Control accepted/deferred operational gaps. |
| `.planning/phases/04-operational-flow-reorganization/04-02-SUMMARY.md` | Canonical source-owner maps and historical docs separation. |
| `.planning/phases/05-orchestrator-hub-refactor/05-VERIFICATION.md` | Orchestrator route/webhook/admin seam proof and Mission Control read-only status. |
| `.planning/phases/05-orchestrator-hub-refactor/05-03-SUMMARY.md` | Mission Control data/render seams, read-only control boundary, full Phase 5 gate. |
| `.planning/phases/06-worker-and-eval-hub-refactor/06-VERIFICATION.md` | Worker, codegen, eval, and research seam proof plus final Phase 6 gate. |
| `.planning/phases/06-worker-and-eval-hub-refactor/06-04-SUMMARY.md` | Research output helper closeout and scope-fence evidence for provider/secret behavior. |
| `docs/README.md` | Current/historical documentation routing and source-owner map. |
| `docs/CURRENT.md` | Current Plane-primary/Linear-legacy operating state and provider cutover constraints. |
| `docs/HISTORICAL.md` | Historical evidence index and warning that old Linear-first docs are not current guidance. |
| `docs/runbooks/scheduler.md` | Accepted scheduler duplicate-fire and Mission Control schedule-control gaps. |
| `docs/runbooks/mission-control.md` | Read-only Mission Control scope and deferred operator controls. |
| `docs/runbooks/eval-harness.md` | Eval artifact ownership, regression commands, current catalog, and next eval hardening candidates. |
| `docs/runbooks/secrets.md` | Secret ownership pattern and Plane-primary/Linear-legacy env posture without copying live secret values. |
