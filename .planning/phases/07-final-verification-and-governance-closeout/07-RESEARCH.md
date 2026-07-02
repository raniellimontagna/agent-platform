# Phase 07: Final Verification and Governance Closeout - Research

**Researched:** 2026-07-02
**Domain:** final verification, eval regression, documentation governance, milestone audit
**Confidence:** HIGH - internal evidence was cross-checked across project rules, phase context, requirements, roadmap/state, phase 03-06 summaries, phase 03-06 verification reports, docs/runbooks, package scripts, tool versions, and `.eval-runs/latest-report.json`. [VERIFIED: AGENTS.md; CLAUDE.md; .planning/ROADMAP.md; .planning/REQUIREMENTS.md; .planning/STATE.md; .planning/phases/07-final-verification-and-governance-closeout/07-CONTEXT.md; .planning/phases/03-plane-only-provider-cutover/03-VERIFICATION.md; .planning/phases/04-operational-flow-reorganization/04-VERIFICATION.md; .planning/phases/05-orchestrator-hub-refactor/05-VERIFICATION.md; .planning/phases/06-worker-and-eval-hub-refactor/06-VERIFICATION.md; package.json; .eval-runs/latest-report.json]

<user_constraints>
## User Constraints (from CONTEXT.md)

All constraints in this section are copied from `.planning/phases/07-final-verification-and-governance-closeout/07-CONTEXT.md`; the source file is the authoritative phase context for Phase 07. [VERIFIED: .planning/phases/07-final-verification-and-governance-closeout/07-CONTEXT.md]

### Locked Decisions

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

### the agent's Discretion

No separate `## the agent's Discretion` section exists in `07-CONTEXT.md`; use the expected plan shape and autonomous defaults in this research for safe planning. [VERIFIED: .planning/phases/07-final-verification-and-governance-closeout/07-CONTEXT.md]

### Deferred Ideas (OUT OF SCOPE)

No separate `## Deferred Ideas` section exists in `07-CONTEXT.md`; the out-of-scope items are the scope fences above, especially destructive Linear schema cleanup and live provider/deploy changes. [VERIFIED: .planning/phases/07-final-verification-and-governance-closeout/07-CONTEXT.md]
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| VER-02 | `corepack pnpm verify` passes at the end of each phase. [VERIFIED: .planning/REQUIREMENTS.md] | Phase 07 must run `rtk corepack pnpm verify` and record the exact final result; `package.json` defines this as lint, build, tests, eval, and regression eval. [VERIFIED: .planning/phases/07-final-verification-and-governance-closeout/07-CONTEXT.md; package.json] |
| VER-03 | Evals remain at 14/14 with no score regression after provider and flow cleanup. [VERIFIED: .planning/REQUIREMENTS.md] | Phase 07 must rerun eval regression and compare against the current latest report, which already records 14/14, score 100, and score delta 0 at `2026-07-02T19:01:25.405Z`. [VERIFIED: .eval-runs/latest-report.json] |
| VER-04 | Final milestone audit includes remaining debt, accepted gaps, and next cleanup candidates. [VERIFIED: .planning/REQUIREMENTS.md] | Phase 07 should create a self-contained closeout/audit artifact and update current docs with source-backed debt, accepted gaps, removed legacy, and next-phase recommendations. [VERIFIED: .planning/ROADMAP.md; .planning/phases/07-final-verification-and-governance-closeout/07-CONTEXT.md] |
</phase_requirements>

## Project Constraints (from AGENTS.md)

- `AGENTS.md` is only a pointer; `CLAUDE.md` is canonical for project rules. [VERIFIED: AGENTS.md]
- Commands should use `rtk` prefixes; `CLAUDE.md` states the project golden rule is to prefix commands with `rtk`, including chained commands. [VERIFIED: CLAUDE.md]
- Plane workspace `attodev`, project `Agent Platform` (`AGP`), is the primary card/work provider; Linear is optional/legacy and should not be used for new cards or milestone governance unless the original card came from Linear. [VERIFIED: CLAUDE.md]
- Branch and commit naming should follow Conventional Commits if later execution commits work. [VERIFIED: CLAUDE.md]
- This research turn must not commit because the user explicitly requested no commit. [VERIFIED: user request]
- No project-defined `.codex/skills/` or `.agents/skills/` directories exist in this workspace. [VERIFIED: `rtk ls .codex/skills`; `rtk ls .agents/skills`]
- The existing working tree has unrelated untracked paths; Phase 07 planning/execution must preserve them unless a later user explicitly scopes them in. [VERIFIED: `rtk git status --short`]

## Summary

Phase 07 is a verification-and-governance closeout, not a product/refactor phase. [VERIFIED: .planning/phases/07-final-verification-and-governance-closeout/07-CONTEXT.md] The planner should split work into one final verification/regression pass and one closeout/audit/docs pass, matching the context’s expected `07-01` and `07-02` shape. [VERIFIED: .planning/phases/07-final-verification-and-governance-closeout/07-CONTEXT.md]

The final proof must rerun `rtk corepack pnpm verify`; prior phase gates are evidence of historical health, not final state proof. [VERIFIED: .planning/phases/07-final-verification-and-governance-closeout/07-CONTEXT.md; package.json] The current latest eval report is already green with 14/14 scenarios, score 100, and score delta 0, so Phase 07 should use it as the baseline and require the final rerun to preserve those values. [VERIFIED: .eval-runs/latest-report.json]

Final docs should not re-open Linear or introduce live config changes. [VERIFIED: .planning/phases/07-final-verification-and-governance-closeout/07-CONTEXT.md; CLAUDE.md] The most important closeout content is a self-contained milestone audit covering removed legacy, accepted gaps, remaining debt, exact verification evidence, and next cleanup candidates. [VERIFIED: .planning/ROADMAP.md; .planning/phases/07-final-verification-and-governance-closeout/07-CONTEXT.md]

**Primary recommendation:** Use `rtk corepack pnpm verify` as the final gate, then write a source-backed `07-MILESTONE-AUDIT.md` plus targeted updates to `docs/CURRENT.md`, `docs/README.md`, `docs/HISTORICAL.md`, and any runbook sections that need accepted-gap or next-work notes. [VERIFIED: package.json; .planning/ROADMAP.md; docs/CURRENT.md; docs/README.md; docs/HISTORICAL.md]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Final repository verification | Tooling / CI-local | Source code packages | `package.json` owns `verify`, `verify:loop`, `eval`, and `eval:regression`; Phase 07 must record the command outcome rather than bypass package scripts. [VERIFIED: package.json; .planning/phases/07-final-verification-and-governance-closeout/07-CONTEXT.md] |
| Eval regression proof | Worker eval harness | `.eval-runs` artifacts | `apps/worker-code/src/eval/runEval.ts` owns eval reports, and `.eval-runs/latest-report.json` stores the current baseline. [VERIFIED: docs/runbooks/eval-harness.md; .eval-runs/latest-report.json] |
| Removed legacy documentation | Docs / planning | API/database compatibility seams | Plane-only active operation and Linear legacy compatibility are documented in current docs and Phase 03 reports; Phase 07 should summarize evidence, not alter compatibility seams. [VERIFIED: docs/CURRENT.md; .planning/phases/03-plane-only-provider-cutover/03-VERIFICATION.md] |
| Accepted gaps and debt | Docs / planning | Runtime owners named per gap | Existing runbooks already list deferred scheduler and Mission Control gaps; closeout should categorize them as accepted/deferred/recommended. [VERIFIED: docs/runbooks/scheduler.md; docs/runbooks/mission-control.md; .planning/phases/07-final-verification-and-governance-closeout/07-CONTEXT.md] |
| Milestone audit | Planning docs | Current docs index | The roadmap requires a self-contained final audit that does not depend on this conversation. [VERIFIED: .planning/ROADMAP.md; .planning/phases/07-final-verification-and-governance-closeout/07-CONTEXT.md] |

## Standard Stack

### Core

| Library / Tool | Version | Purpose | Why Standard |
|----------------|---------|---------|--------------|
| Node.js | 22.22.3 available; project engine is `>=22`. [VERIFIED: `rtk node --version`; package.json] | Runtime for TypeScript tooling and monorepo commands. [VERIFIED: package.json] | Existing package engine and local runtime align. [VERIFIED: package.json; `rtk node --version`] |
| pnpm via Corepack | pnpm 11.5.2; Corepack 0.34.6. [VERIFIED: `rtk corepack pnpm --version`; `rtk corepack --version`; package.json] | Package manager and script runner. [VERIFIED: package.json] | `packageManager` pins pnpm 11.5.2 and scripts call `corepack pnpm`. [VERIFIED: package.json] |
| Vitest | 3.2.6 available; package range is `^3.2.0`. [VERIFIED: `rtk corepack pnpm exec vitest --version`; package.json] | Unit/characterization/eval-adjacent test runner. [VERIFIED: vitest.config.ts; package.json] | Existing tests are Vitest `.test.ts` files and prior phase reports use Vitest evidence. [VERIFIED: vitest.config.ts; .planning/phases/06-worker-and-eval-hub-refactor/06-VERIFICATION.md] |
| Biome | 1.9.4. [VERIFIED: `rtk corepack pnpm exec biome --version`; package.json] | Lint/format gate in `pnpm lint`. [VERIFIED: package.json] | `verify` starts with `corepack pnpm lint`, which runs `biome check .`. [VERIFIED: package.json] |
| TypeScript | 5.9.3 available; package range is `^5.7.3`. [VERIFIED: `rtk corepack pnpm exec tsc --version`; package.json] | Package build/typecheck. [VERIFIED: package.json; apps/*/package.json; packages/*/package.json] | Recursive package builds run `tsc`. [VERIFIED: package.json; apps/*/package.json; packages/*/package.json] |
| RTK | 0.42.4. [VERIFIED: `rtk --version`] | Token-filtering command prefix required by project rules. [VERIFIED: CLAUDE.md] | Project instructions require `rtk` prefixes. [VERIFIED: CLAUDE.md] |

### Supporting

| Library / Tool | Version | Purpose | When to Use |
|----------------|---------|---------|-------------|
| Git | 2.39.5. [VERIFIED: `rtk git --version`] | Inspect status/diffs and later commits if execution requires them. [VERIFIED: `rtk git --version`; CLAUDE.md] | Use only with `rtk`; do not commit in this research turn. [VERIFIED: CLAUDE.md; user request] |
| `.eval-runs` report artifacts | Latest report generated `2026-07-02T19:01:25.405Z`. [VERIFIED: .eval-runs/latest-report.json] | Eval regression baseline and evidence record. [VERIFIED: docs/runbooks/eval-harness.md; .eval-runs/latest-report.json] | Use after final eval/regression rerun to record 14/14, score 100, and delta 0. [VERIFIED: .planning/phases/07-final-verification-and-governance-closeout/07-CONTEXT.md] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `rtk corepack pnpm verify` | Separate `lint`, `build`, `test`, `eval`, and `eval:regression` commands | The separate commands help diagnose failures, but the final requirement specifically demands the full `verify` command outcome. [VERIFIED: .planning/phases/07-final-verification-and-governance-closeout/07-CONTEXT.md; package.json] |
| `.planning/phases/07.../07-MILESTONE-AUDIT.md` | Only update `docs/CURRENT.md` | A dedicated audit artifact better satisfies the self-contained audit requirement while docs can link or summarize it. [VERIFIED: .planning/ROADMAP.md; .planning/phases/07-final-verification-and-governance-closeout/07-CONTEXT.md] |

**Installation:**
```bash
# No installation is required for Phase 07 research or planning.
```

**Version verification:** Versions above were checked locally with `rtk node --version`, `rtk corepack pnpm --version`, `rtk corepack pnpm exec vitest --version`, `rtk corepack pnpm exec biome --version`, and `rtk corepack pnpm exec tsc --version`. [VERIFIED: local commands listed]

## Package Legitimacy Audit

Phase 07 should not install external packages. [VERIFIED: .planning/phases/07-final-verification-and-governance-closeout/07-CONTEXT.md] Package legitimacy gate is not applicable unless a later regression fix unexpectedly requires a new dependency, which would violate the default scope fence and need explicit justification. [VERIFIED: .planning/phases/07-final-verification-and-governance-closeout/07-CONTEXT.md]

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| none | n/a | n/a | n/a | n/a | n/a | No package install planned. [VERIFIED: .planning/phases/07-final-verification-and-governance-closeout/07-CONTEXT.md] |

**Packages removed due to [SLOP] verdict:** none. [VERIFIED: no package install planned]
**Packages flagged as suspicious [SUS]:** none. [VERIFIED: no package install planned]

## Architecture Patterns

### System Architecture Diagram

```text
Phase 03-06 evidence + current docs + package scripts
  -> 07-01 final verification
       -> run `rtk corepack pnpm verify`
       -> if pass: record lint/build/test/eval/regression outcome
       -> if fail: diagnose targeted regression, fix narrowly, rerun exact gate
  -> 07-02 governance closeout
       -> summarize removed legacy, accepted gaps, remaining debt, next cleanup candidates
       -> create self-contained milestone audit
       -> update docs indexes/current state without changing runtime behavior
  -> Phase 07 verification artifact
       -> prove VER-02, VER-03, VER-04 without relying on chat history
```

This flow follows the Phase 07 context: verification runs before closeout docs if eval regression is not green. [VERIFIED: .planning/phases/07-final-verification-and-governance-closeout/07-CONTEXT.md]

### Recommended Project Structure

```text
.planning/phases/07-final-verification-and-governance-closeout/
├── 07-RESEARCH.md          # this research artifact [VERIFIED: requested output path]
├── 07-01-PLAN.md           # final verification plan, not created by research [VERIFIED: .planning/ROADMAP.md]
├── 07-02-PLAN.md           # closeout/audit plan, not created by research [VERIFIED: .planning/ROADMAP.md]
├── 07-MILESTONE-AUDIT.md   # recommended closeout artifact for VER-04 [VERIFIED: .planning/ROADMAP.md; 07-CONTEXT.md]
└── 07-VERIFICATION.md      # expected verifier output after execution [VERIFIED: existing phase verification pattern]
```

### Pattern 1: Full Gate First, Docs Second

**What:** Run `rtk corepack pnpm verify` and record the exact output summary before marking closeout docs as final. [VERIFIED: .planning/phases/07-final-verification-and-governance-closeout/07-CONTEXT.md; package.json]

**When to use:** Always for Phase 07; if eval regression is not 14/14 score 100 delta 0, stop and diagnose before docs closeout. [VERIFIED: .planning/phases/07-final-verification-and-governance-closeout/07-CONTEXT.md]

**Example:**
```bash
rtk corepack pnpm verify
```

### Pattern 2: Parse Eval Evidence, Do Not Eyeball It

**What:** After the final gate, parse `.eval-runs/latest-report.json` to record `generatedAt`, `passed`, `total`, `passedCount`, `score`, `scoreDelta`, and `regressed`. [VERIFIED: .eval-runs/latest-report.json; docs/runbooks/eval-harness.md]

**When to use:** Use after `verify` or `eval:regression` because eval artifacts are the durable evidence for VER-03. [VERIFIED: docs/runbooks/eval-harness.md; .planning/REQUIREMENTS.md]

**Example:**
```bash
rtk node -e "const r=require('./.eval-runs/latest-report.json'); console.log({generatedAt:r.generatedAt,passed:r.passed,total:r.total,passedCount:r.passedCount,score:r.score,scoreDelta:r.trend?.scoreDelta,regressed:r.trend?.regressed})"
```

### Pattern 3: Source-Backed Governance Tables

**What:** Closeout docs should list each removed legacy behavior, accepted gap, remaining debt item, and next cleanup candidate with a source file or phase report reference. [VERIFIED: .planning/phases/07-final-verification-and-governance-closeout/07-CONTEXT.md]

**When to use:** Use in `07-MILESTONE-AUDIT.md` and any docs update that claims milestone completion or remaining work. [VERIFIED: .planning/ROADMAP.md; .planning/phases/07-final-verification-and-governance-closeout/07-CONTEXT.md]

**Example:**
```markdown
| Category | Item | Status | Evidence |
|----------|------|--------|----------|
| Removed legacy | Linear active provider defaults removed; Linear retained only for explicit compatibility. | Accepted legacy seam remains. | `.planning/phases/03-plane-only-provider-cutover/03-VERIFICATION.md` |
```

### Anti-Patterns to Avoid

- **Treating prior phase gates as the final gate:** Phase 03, Phase 05, and Phase 06 already passed `verify`, but Phase 07 still needs a fresh final run. [VERIFIED: .planning/phases/03-plane-only-provider-cutover/03-VERIFICATION.md; .planning/phases/05-orchestrator-hub-refactor/05-VERIFICATION.md; .planning/phases/06-worker-and-eval-hub-refactor/06-VERIFICATION.md; 07-CONTEXT.md]
- **Reopening Linear governance:** Plane is primary and Linear is legacy/migration-only; do not propose Linear sync tasks. [VERIFIED: CLAUDE.md; docs/CURRENT.md; .planning/phases/03-plane-only-provider-cutover/03-VERIFICATION.md]
- **Editing runtime behavior during closeout:** Scope fences forbid provider defaults, webhook behavior, route/API surfaces, packages, model aliases, workflow labels, deploy config, and schema changes unless needed for a verified regression fix. [VERIFIED: .planning/phases/07-final-verification-and-governance-closeout/07-CONTEXT.md]
- **Using Biome as proof for Markdown docs:** Prior docs-only phases observed Biome can report zero matching Markdown files, so docs claims need static `rtk rg` checks and source-backed review. [VERIFIED: .planning/phases/04-operational-flow-reorganization/04-01-SUMMARY.md; .planning/phases/04-operational-flow-reorganization/04-02-SUMMARY.md]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Final regression suite | A custom command subset | `rtk corepack pnpm verify` | The script already chains lint, build, tests, eval, and eval regression. [VERIFIED: package.json] |
| Eval regression proof | Manual scenario counting from console text | `.eval-runs/latest-report.json` plus `rtk corepack pnpm eval:regression` | The report stores pass count, score, delta, and regression list. [VERIFIED: docs/runbooks/eval-harness.md; .eval-runs/latest-report.json] |
| Debt inventory | Freeform memory from conversation | Phase summaries, verification reports, `docs/CURRENT.md`, runbooks, and `.planning/STATE.md` | Phase 07 context forbids relying on the chat transcript as source material. [VERIFIED: .planning/phases/07-final-verification-and-governance-closeout/07-CONTEXT.md] |
| Linear destructive cleanup | Dropping columns/routes/packages in Phase 07 | Document as deferred/destructive cleanup candidate | Phase 07 scope fences forbid removing or renaming remaining Linear schema columns. [VERIFIED: .planning/phases/07-final-verification-and-governance-closeout/07-CONTEXT.md] |
| Governance loop | New ticket sync to Linear | Plane/GSD planning artifacts and docs indexes | Project rules identify Plane as primary and Linear as legacy/removed for new governance. [VERIFIED: CLAUDE.md; user request] |

**Key insight:** Phase 07 is about proving and documenting the system state, not inventing new runtime mechanisms. [VERIFIED: .planning/phases/07-final-verification-and-governance-closeout/07-CONTEXT.md]

## Docs Likely Needing Updates

| File | Needed Phase 07 Update | Evidence |
|------|------------------------|----------|
| `docs/CURRENT.md` | Add final verification status, closeout date, accepted gaps, and next cleanup direction after the final gate. [VERIFIED: docs/CURRENT.md; .planning/ROADMAP.md] | Current file names Phase 7 as the current cleanup direction but does not yet include final Phase 07 outcome. [VERIFIED: `rtk rg -n "Phase 7|remaining debt|accepted gaps|next cleanup" docs/CURRENT.md`] |
| `docs/README.md` | Link the final milestone audit or explain where the cleanup milestone closeout lives. [VERIFIED: docs/README.md; 07-CONTEXT.md] | Current map points to current/historical docs but has no Phase 07 closeout/audit link. [VERIFIED: docs/README.md; `rtk rg -n "milestone audit|closeout" docs`] |
| `docs/HISTORICAL.md` | Add the cleanup milestone/audit as a historical planning/governance record after completion. [VERIFIED: docs/HISTORICAL.md; 07-CONTEXT.md] | Historical index explains retained evidence records; final closeout should become part of that evidence chain. [VERIFIED: docs/HISTORICAL.md] |
| `docs/ARCHITECTURE.md` | Add or verify a short note separating historical product phase numbering from the GSD cleanup milestone; avoid confusing "Fases 0-7 completas" with cleanup Phase 07. [VERIFIED: docs/ARCHITECTURE.md; .planning/ROADMAP.md] | Architecture uses older product phase labels, while `.planning/ROADMAP.md` uses cleanup phases 1-7. [VERIFIED: docs/ARCHITECTURE.md; .planning/ROADMAP.md] |
| `docs/runbooks/scheduler.md` | Keep cross-process duplicate-fire prevention as accepted/deferred runtime hardening debt. [VERIFIED: docs/runbooks/scheduler.md] | Runbook already lists the gap under `Deferred Gaps`. [VERIFIED: docs/runbooks/scheduler.md] |
| `docs/runbooks/mission-control.md` | Keep read-only Mission Control and missing operator controls as accepted/deferred UI/control debt. [VERIFIED: docs/runbooks/mission-control.md] | Runbook states launch, replay, approval, retry, cancel controls are deferred. [VERIFIED: docs/runbooks/mission-control.md] |
| `docs/runbooks/eval-harness.md` | Consider adding final Phase 07 verified report timestamp and next eval hardening candidates. [VERIFIED: docs/runbooks/eval-harness.md; .eval-runs/latest-report.json] | Runbook already lists next eval evolutions; final closeout can point to them as recommended next work. [VERIFIED: docs/runbooks/eval-harness.md] |
| `.planning/STATE.md` | Update current phase/progress after execution, not during research. [VERIFIED: .planning/STATE.md] | State currently says Phase 06 complete and Phase 07 next. [VERIFIED: .planning/STATE.md] |

## Existing Source Evidence for Milestone Audit

| Evidence | What It Proves | Use In Closeout |
|----------|----------------|-----------------|
| `.planning/phases/03-plane-only-provider-cutover/03-VERIFICATION.md` | Plane-only provider cutover passed 10/10 must-haves, active Linear defaults/exposure were removed or gated, and full verify/eval passed after cutover. [VERIFIED: 03-VERIFICATION.md] | Removed legacy, retained compatibility seams, provider cutover proof. |
| `.planning/phases/03-plane-only-provider-cutover/03-04-CHECKPOINT.md` | Live env/Funnel/Linear webhook exposure was initially active, then resolved after approval so live Funnel exposed only `/webhooks/plane` and Linear webhook was disabled. [VERIFIED: 03-04-CHECKPOINT.md] | Live provider exposure evidence and rollback/audit note. |
| `.planning/phases/03-plane-only-provider-cutover/03-05-SUMMARY.md` | Production row audit found 130/130 rows had generic identity, no legacy-only rows, and legacy columns were retained pending destructive confirmation. [VERIFIED: 03-05-SUMMARY.md] | Remaining debt: legacy Linear columns/packages/routes retained. |
| `.planning/phases/04-operational-flow-reorganization/04-VERIFICATION.md` | Operational flow docs, source-owner maps, active runbooks, and historical docs separation passed 8/8 must-haves. [VERIFIED: 04-VERIFICATION.md] | Governance loop and docs control layer evidence. |
| `.planning/phases/05-orchestrator-hub-refactor/05-VERIFICATION.md` | Orchestrator auth/render/webhook/admin seams passed 10/10 must-haves with full verify and eval regression. [VERIFIED: 05-VERIFICATION.md] | Behavior-preserving orchestrator refactor proof. |
| `.planning/phases/06-worker-and-eval-hub-refactor/06-VERIFICATION.md` | Worker runner, codegen, eval, and research seams passed 14/14 must-haves with full verify and eval regression. [VERIFIED: 06-VERIFICATION.md] | Behavior-preserving worker/eval refactor proof and latest phase gate. |
| `.eval-runs/latest-report.json` | Latest eval baseline is 14/14, score 100, score delta 0, no regressions. [VERIFIED: .eval-runs/latest-report.json] | VER-03 baseline and final comparison. |
| `docs/CURRENT.md`, `docs/README.md`, `docs/HISTORICAL.md` | Living docs control layer and current/historical separation exist. [VERIFIED: docs/CURRENT.md; docs/README.md; docs/HISTORICAL.md] | Governance loop and docs update targets. |

## Common Pitfalls

### Pitfall 1: Passing Eval But Not Full Verify

**What goes wrong:** The planner records `eval:regression` success but misses lint, build, or unit tests. [VERIFIED: package.json]

**Why it happens:** `eval:regression` is only the last part of `verify`; it does not replace `lint`, recursive build, full tests, or normal eval. [VERIFIED: package.json]

**How to avoid:** Require `rtk corepack pnpm verify` as the release proof and use `eval:regression` only as a focused debug/rerun. [VERIFIED: package.json; 07-CONTEXT.md]

**Warning signs:** A closeout artifact says "14/14 eval" but does not include a final `verify` timestamp/result. [VERIFIED: 07-CONTEXT.md]

### Pitfall 2: Treating Legacy Linear References As Active Work

**What goes wrong:** Closeout proposes Linear sync, Linear webhook work, or dropping Linear columns. [VERIFIED: CLAUDE.md; 07-CONTEXT.md]

**Why it happens:** Linear package, route, and legacy columns intentionally remain for compatibility/migration. [VERIFIED: docs/CURRENT.md; 03-VERIFICATION.md]

**How to avoid:** Document Linear as removed from active operation but retained as a compatibility/deferred destructive cleanup seam. [VERIFIED: docs/CURRENT.md; 03-05-SUMMARY.md]

**Warning signs:** A Phase 07 task modifies `packages/linear`, `/webhooks/linear`, `CARD_EXTRA_PROVIDERS`, `linear_issue_*`, or provider env examples without a final gate failure requiring it. [VERIFIED: 07-CONTEXT.md]

### Pitfall 3: Premature Closeout Docs

**What goes wrong:** Docs claim the milestone is complete before final verification has passed. [VERIFIED: 07-CONTEXT.md]

**Why it happens:** Prior phase reports are green and can look sufficient. [VERIFIED: 03-VERIFICATION.md; 05-VERIFICATION.md; 06-VERIFICATION.md]

**How to avoid:** Write final closeout docs after `07-01` records the fresh full gate, or clearly label drafts as pending verification. [VERIFIED: 07-CONTEXT.md]

**Warning signs:** `docs/CURRENT.md` has a final completion claim but `07-VERIFICATION.md` or `07-01-SUMMARY.md` is missing. [VERIFIED: existing phase verification pattern; 07-CONTEXT.md]

### Pitfall 4: Letting Markdown Checks Be Too Weak

**What goes wrong:** Docs are changed but only Biome runs, even though prior docs checks reported zero matching Markdown files. [VERIFIED: 04-01-SUMMARY.md; 04-02-SUMMARY.md]

**Why it happens:** Biome configuration does not provide strong Markdown semantic validation in this repo. [VERIFIED: 04-01-SUMMARY.md; 04-02-SUMMARY.md]

**How to avoid:** Add static `rtk rg` checks for required closeout phrases, source artifact paths, and requirement IDs in closeout docs. [VERIFIED: 04-VALIDATION.md; 07-CONTEXT.md]

**Warning signs:** A docs-only task has no static owner/evidence check. [VERIFIED: 04-VALIDATION.md]

## Code Examples

Verified patterns from internal sources:

### Final Gate

```bash
rtk corepack pnpm verify
```

Source: `package.json` defines `verify` as `corepack pnpm lint && corepack pnpm verify:loop && corepack pnpm eval:regression`. [VERIFIED: package.json]

### Focused Eval Regression Rerun

```bash
rtk corepack pnpm eval:regression
```

Source: `package.json` defines `eval:regression` as worker eval with `--fail-on-regression`. [VERIFIED: package.json]

### Eval Evidence Summary

```bash
rtk node -e "const r=require('./.eval-runs/latest-report.json'); console.log({generatedAt:r.generatedAt,passed:r.passed,total:r.total,passedCount:r.passedCount,score:r.score,scoreDelta:r.trend?.scoreDelta,regressed:r.trend?.regressed})"
```

Source: `.eval-runs/latest-report.json` stores these fields. [VERIFIED: .eval-runs/latest-report.json]

### Closeout Static Check

```bash
rtk rg -n "VER-02|VER-03|VER-04|removed legacy|accepted gaps|remaining debt|next cleanup" \
  .planning/phases/07-final-verification-and-governance-closeout docs/CURRENT.md docs/README.md docs/HISTORICAL.md
```

Source: Phase 07 context requires the final artifacts to cover VER-02, VER-03, VER-04, removed legacy, accepted gaps, remaining debt, and next cleanup candidates. [VERIFIED: 07-CONTEXT.md]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Linear-first active provider framing | Plane-first active provider; Linear legacy/migration-only | Phase 03, completed 2026-07-02 | Closeout must not propose Linear sync or reactivation. [VERIFIED: 03-VERIFICATION.md; CLAUDE.md] |
| Large orchestrator route/admin/webhook hubs | Shared auth/render helpers and focused webhook/Mission Control seams | Phase 05, completed 2026-07-02 | Final docs can cite behavior-preserving refactor proof instead of planning more orchestrator split work in Phase 07. [VERIFIED: 05-VERIFICATION.md] |
| Large worker/codegen/eval/research hubs | Worker-local runner, codegen, eval, and research helper seams | Phase 06, completed 2026-07-02 | Final verification must prove these refactors remain green in the full gate. [VERIFIED: 06-VERIFICATION.md] |
| Historical docs mixed with current guidance | `docs/README.md`, `docs/CURRENT.md`, and `docs/HISTORICAL.md` separate current and historical records | Phase 02/04, verified by Phase 04 | Closeout should add milestone audit to the evidence chain without making historical docs current guidance. [VERIFIED: docs/README.md; docs/CURRENT.md; docs/HISTORICAL.md; 04-VERIFICATION.md] |

**Deprecated/outdated:**
- Linear as normal active intake is outdated; `/webhooks/linear` is compatibility-only and disabled unless explicit legacy config is present. [VERIFIED: docs/CURRENT.md; docs/runbooks/webhook-tailscale.md; 03-VERIFICATION.md]
- Running unprefixed project commands is outdated for this repo; use `rtk`. [VERIFIED: CLAUDE.md]
- Treating `docs/superpowers/**` as living guidance is outdated; use it as historical evidence only. [VERIFIED: docs/HISTORICAL.md]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Live external Plane/Tailscale/Linear state could have drifted after the Phase 03 checkpoint. [ASSUMED] | Open Questions; Sources | If Phase 07 docs make current live-state claims beyond recorded Phase 03 evidence, they could be stale without a fresh live check. |

## Open Questions (RESOLVED)

1. **RESOLVED: Should Phase 07 create a dedicated audit artifact or only update docs?**
   What we know: Phase context requires a self-contained milestone audit and roadmap success criteria require final docs to name debt, removed legacy, accepted gaps, and next phases. [VERIFIED: 07-CONTEXT.md; .planning/ROADMAP.md]
   What's unclear: The exact filename is not locked. [VERIFIED: 07-CONTEXT.md]
   Resolution: Create `.planning/phases/07-final-verification-and-governance-closeout/07-MILESTONE-AUDIT.md` and link/summarize it from current/historical docs as needed. [VERIFIED: existing phase artifact pattern; 07-CONTEXT.md]

2. **RESOLVED: Should live Plane/Tailscale/Linear exposure be rechecked in Phase 07?**
   What we know: Phase 03 checkpoint resolved live Linear exposure on 2026-07-02, and Phase 07 scope fences forbid live deploy/provider changes unless a final regression requires them. [VERIFIED: 03-04-CHECKPOINT.md; 07-CONTEXT.md]
   What's unclear: Live external state could drift after the checkpoint. [ASSUMED]
   Resolution: Treat Phase 03 checkpoint as source evidence and do not require live external mutation/checks for Phase 07 unless final docs explicitly claim current live state beyond the recorded checkpoint. [VERIFIED: 03-04-CHECKPOINT.md; 07-CONTEXT.md]

3. **RESOLVED: What if final `verify` fails?**
   What we know: Context says stop and diagnose before writing closeout docs if eval regression is not 14/14 score 100 delta 0. [VERIFIED: 07-CONTEXT.md]
   What's unclear: The failing surface cannot be known until the command runs. [VERIFIED: no final command run in research]
   Resolution: Use focused reruns from `package.json` and existing validation maps, fix only the proven regression, then rerun `rtk corepack pnpm verify`; if no narrow fix is justified, record a blocker and do not complete closeout docs. [VERIFIED: package.json; 05-VALIDATION.md; 06-VALIDATION.md]

4. **RESOLVED: Should remaining Linear columns be removed if final verification is green?**
   What we know: Phase 07 explicitly forbids removing or renaming remaining legacy Linear schema columns. [VERIFIED: 07-CONTEXT.md]
   What's unclear: No open decision is needed for Phase 07. [VERIFIED: 07-CONTEXT.md]
   Resolution: Do not remove columns in Phase 07; document them as a future destructive cleanup candidate requiring separate confirmation. [VERIFIED: 03-05-SUMMARY.md; 07-CONTEXT.md]

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| RTK | All project/git/test/build commands | yes | 0.42.4 [VERIFIED: `rtk --version`] | none needed |
| Node.js | pnpm scripts and TypeScript tooling | yes | 22.22.3 [VERIFIED: `rtk node --version`] | none needed |
| Corepack | pnpm package-manager activation | yes | 0.34.6 [VERIFIED: `rtk corepack --version`] | none needed |
| pnpm | monorepo scripts | yes | 11.5.2 [VERIFIED: `rtk corepack pnpm --version`] | none needed |
| Vitest | test suite | yes | 3.2.6 [VERIFIED: `rtk corepack pnpm exec vitest --version`] | none needed |
| Biome | lint gate | yes | 1.9.4 [VERIFIED: `rtk corepack pnpm exec biome --version`] | none needed |
| TypeScript compiler | build/typecheck | yes | 5.9.3 [VERIFIED: `rtk corepack pnpm exec tsc --version`] | none needed |
| Git | status/diff evidence and later execution commits | yes | 2.39.5 [VERIFIED: `rtk git --version`] | none needed |

**Missing dependencies with no fallback:** none found for Phase 07 local verification/documentation work. [VERIFIED: local commands above]

**Missing dependencies with fallback:** none found. [VERIFIED: local commands above]

**Environment note:** RTK reports "untrusted project filters" and does not apply project filters; prior phase gates still passed with the same warning, so record it as non-blocking unless a command actually fails. [VERIFIED: local command outputs; 03-05-SUMMARY.md; 04-02-SUMMARY.md; 05-03-SUMMARY.md]

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 3.2.6. [VERIFIED: `rtk corepack pnpm exec vitest --version`] |
| Config file | `vitest.config.ts`; includes `**/*.test.ts` and excludes `node_modules`, `dist`, and `.worktrees`. [VERIFIED: vitest.config.ts] |
| Quick run command | `rtk corepack pnpm verify:loop` for build + tests + eval without the final regression comparison. [VERIFIED: package.json] |
| Full suite command | `rtk corepack pnpm verify`. [VERIFIED: package.json; 07-CONTEXT.md] |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| VER-02 | Final full repository verification passes. [VERIFIED: .planning/REQUIREMENTS.md] | full suite | `rtk corepack pnpm verify` | yes: `package.json` [VERIFIED: package.json] |
| VER-03 | Eval regression is 14/14, score 100, score delta 0. [VERIFIED: .planning/REQUIREMENTS.md; 07-CONTEXT.md] | eval regression | `rtk corepack pnpm eval:regression` and parse `.eval-runs/latest-report.json` | yes: `package.json`, `.eval-runs/latest-report.json` [VERIFIED: package.json; .eval-runs/latest-report.json] |
| VER-04 | Closeout docs include remaining debt, accepted gaps, and next cleanup candidates with source evidence. [VERIFIED: .planning/REQUIREMENTS.md; 07-CONTEXT.md] | static/docs audit | `rtk rg -n "VER-02|VER-03|VER-04|removed legacy|accepted gaps|remaining debt|next cleanup" .planning/phases/07-final-verification-and-governance-closeout docs/CURRENT.md docs/README.md docs/HISTORICAL.md` | missing before execution: `07-MILESTONE-AUDIT.md`; docs exist. [VERIFIED: `rtk rg --files .planning/phases/07-final-verification-and-governance-closeout`; docs/README.md; docs/CURRENT.md; docs/HISTORICAL.md] |

### Sampling Rate

- **Per task commit:** Run the focused command tied to the changed surface; docs-only tasks must include static `rtk rg` checks for required evidence terms. [VERIFIED: 04-VALIDATION.md; 07-CONTEXT.md]
- **Per wave merge:** Run `rtk corepack pnpm verify:loop` after fixes that touch source/test behavior; run docs static checks after docs-only updates. [VERIFIED: package.json; 04-VALIDATION.md]
- **Phase gate:** Run `rtk corepack pnpm verify` and record the exact lint/build/test/eval/regression result. [VERIFIED: package.json; 07-CONTEXT.md]

### Wave 0 Gaps

- [ ] `.planning/phases/07-final-verification-and-governance-closeout/07-MILESTONE-AUDIT.md` - create during execution to cover VER-04. [VERIFIED: 07-CONTEXT.md; .planning/ROADMAP.md]
- [ ] Static docs audit command - planner should add an explicit static check because Markdown semantic coverage is not guaranteed by Biome. [VERIFIED: 04-01-SUMMARY.md; 04-02-SUMMARY.md]
- [ ] Final eval evidence parser command - planner should capture `.eval-runs/latest-report.json` fields after final verification. [VERIFIED: .eval-runs/latest-report.json; docs/runbooks/eval-harness.md]

## Security Domain

Security enforcement is enabled by default because `.planning/config.json` does not set `security_enforcement: false`. [VERIFIED: .planning/config.json]

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | yes | Do not modify `/admin`, runner auth, or token behavior in Phase 07; existing protected routes use bearer token patterns documented in runbooks. [VERIFIED: 07-CONTEXT.md; docs/runbooks/mission-control.md; docs/runbooks/secrets.md] |
| V3 Session Management | no new session work | Phase 07 has no browser/session implementation scope. [VERIFIED: 07-CONTEXT.md] |
| V4 Access Control | yes | Do not expose additional Funnel paths or Mission Control actions; public exposure remains `/webhooks/plane`, and Mission Control remains read-only. [VERIFIED: docs/runbooks/webhook-tailscale.md; docs/runbooks/mission-control.md; 07-CONTEXT.md] |
| V5 Input Validation | yes | Preserve existing tests and static checks; do not change route/API parsing unless fixing a verified regression. [VERIFIED: 07-CONTEXT.md; 05-VERIFICATION.md] |
| V6 Cryptography | yes | Do not alter Plane/legacy webhook HMAC behavior; Phase 05 already extracted and tested signature helpers. [VERIFIED: 05-VERIFICATION.md; 07-CONTEXT.md] |

### Known Threat Patterns for Phase 07

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| False closeout claim without fresh verification | Repudiation | Record exact `rtk corepack pnpm verify` outcome and eval report fields. [VERIFIED: 07-CONTEXT.md; package.json] |
| Accidentally re-enabling legacy Linear intake in docs/config | Spoofing / Tampering | Keep Linear described as legacy/migration-only and do not change provider/env/webhook settings. [VERIFIED: CLAUDE.md; docs/CURRENT.md; 07-CONTEXT.md] |
| Publishing secret values while updating docs | Information Disclosure | Link to `.env.example` and `docs/runbooks/secrets.md`; do not copy live secret values. [VERIFIED: docs/runbooks/secrets.md; docs/README.md] |
| Adding operator controls during governance closeout | Elevation of Privilege | Keep Mission Control read-only; operator controls remain deferred. [VERIFIED: docs/runbooks/mission-control.md; 07-CONTEXT.md] |

## Sources

### Primary (HIGH confidence)

- `AGENTS.md` and `CLAUDE.md` - project rules, RTK command convention, Plane/Linear provider policy. [VERIFIED: AGENTS.md; CLAUDE.md]
- `.planning/ROADMAP.md` - Phase 07 goal, success criteria, and plan shape. [VERIFIED: .planning/ROADMAP.md]
- `.planning/REQUIREMENTS.md` - VER-02, VER-03, VER-04 definitions. [VERIFIED: .planning/REQUIREMENTS.md]
- `.planning/STATE.md` - current milestone state and accumulated decisions. [VERIFIED: .planning/STATE.md]
- `.planning/phases/07-final-verification-and-governance-closeout/07-CONTEXT.md` - locked Phase 07 decisions, scope fences, verification contract. [VERIFIED: 07-CONTEXT.md]
- Phase 03-06 `*-VERIFICATION.md` and `*-SUMMARY.md` files - source evidence for removed legacy, refactor proofs, verification results, and accepted gaps. [VERIFIED: required context reads]
- `package.json`, `vitest.config.ts`, `.eval-runs/latest-report.json` - exact scripts, test config, and current eval baseline. [VERIFIED: package.json; vitest.config.ts; .eval-runs/latest-report.json]
- `docs/README.md`, `docs/CURRENT.md`, `docs/HISTORICAL.md`, `docs/ARCHITECTURE.md`, and relevant runbooks - docs control layer, current system, historical boundaries, operational gaps. [VERIFIED: required context reads]

### Secondary (MEDIUM confidence)

- Local command probes for tool versions and availability. [VERIFIED: `rtk --version`; `rtk node --version`; `rtk corepack pnpm --version`; `rtk corepack pnpm exec vitest --version`; `rtk corepack pnpm exec biome --version`; `rtk corepack pnpm exec tsc --version`; `rtk git --version`]

### Tertiary (LOW confidence)

- The possibility that live external Plane/Tailscale/Linear state drifted after the Phase 03 checkpoint was not rechecked during this research. [ASSUMED]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - package scripts and local tool versions were verified directly. [VERIFIED: package.json; local version commands]
- Architecture: HIGH - Phase 07 scope and tier ownership are locked by roadmap/context and cross-checked against existing docs. [VERIFIED: .planning/ROADMAP.md; 07-CONTEXT.md; docs/CURRENT.md]
- Pitfalls: HIGH - each pitfall is grounded in prior phase summaries/reports or project rules. [VERIFIED: phase 03-06 verification reports; CLAUDE.md]

**Research date:** 2026-07-02
**Valid until:** 2026-07-09 for command/eval baseline details because package/tooling and eval artifacts can change quickly; governance evidence remains useful until the next cleanup milestone changes docs or provider policy. [VERIFIED: current_date; package.json; .eval-runs/latest-report.json]
