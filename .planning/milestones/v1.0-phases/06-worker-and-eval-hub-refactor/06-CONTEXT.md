# Phase 6: Worker and Eval Hub Refactor - Context

**Gathered:** 2026-07-02
**Status:** Ready for planning
**Mode:** Infrastructure phase - autonomous smart-discuss skipped

<domain>
## Phase Boundary

Phase 6 splits worker execution, codegen, research/data-collector, and eval
hubs into focused modules while preserving current behavior. This phase owns the
worker-side refactor debt explicitly deferred from Phase 5.

The phase covers `runJob.ts`, `codegen.ts`, worker eval harness files, and
research/data-collector helper duplication where safe. It must not change the
Plane-first provider model, orchestrator route contracts, database schema,
deployment configuration, workflow labels, agent keys, report payloads, eval
scoring semantics, or external provider behavior except through
behavior-preserving seams guarded by characterization tests.

</domain>

<decisions>
## Implementation Decisions

### Refactor Posture

- **D-01:** Treat Phase 6 as behavior-preserving refactor work. Worker job
  status transitions, callback payloads, validation/self-correction behavior,
  generated file application, Git commit/push behavior, artifact paths, final
  reports, eval scores, and research pack contents must remain stable.
- **D-02:** Add or tighten characterization tests before moving behavior. Every
  risky extraction should have a RED or fail-first guard where practical, then
  pass after the refactor.
- **D-03:** Prefer worker-local modules over new packages. Do not add runtime
  dependencies, replace LangGraph/BullMQ/Hono, introduce a browser framework,
  or redesign the execution pipeline.
- **D-04:** Use narrow commits by seam: run orchestration, codegen internals,
  eval harness, and research/data-collector helpers should remain separable in
  history.

### Worker Execution Hub

- **D-05:** Split `apps/worker-code/src/executor/runJob.ts` around existing
  responsibilities: job dispatch, research/artifact collection, media
  generation, codegen invocation, validation, self-correction, commit/push, and
  result/report callback.
- **D-06:** Keep `apps/worker-code/src/routes/jobs.ts` and orchestrator queue
  contracts stable. `/jobs` and `/jobs/sync` request/response behavior, run
  result shape, logs, and failure handling must not change.
- **D-07:** Preserve worktree, sandbox, validation, callback, and generated
  artifact behavior. If an extraction reveals an execution contract that is too
  broad, record a gap instead of rewriting the runner.

### Codegen Hub

- **D-08:** Split `apps/worker-code/src/executor/codegen.ts` around prompt
  construction, model response parsing, JSON extraction/repair, file selection,
  file apply/write logic, fix candidate selection, and agent instruction
  assembly.
- **D-09:** Preserve generated output semantics: accepted files, rejected paths,
  JSON repair behavior, command policy checks, validation fixes, and self-
  correction inputs must remain test-equivalent.
- **D-10:** Keep model/provider abstractions and role aliases owned by existing
  source files. Do not change model alias defaults or LLM routing in this phase.

### Eval Harness

- **D-11:** Split eval code around scenario loading, scoring, report rendering,
  runtime/CLI orchestration, and role quality checks without changing report
  shape or score thresholds.
- **D-12:** `rtk corepack pnpm verify` must remain green, including eval 14/14
  and regression eval 14/14 with no score regression.
- **D-13:** Preserve deterministic eval behavior. If snapshot/report text is
  updated only because modules moved, tests must prove semantic equivalence.

### Research And Data Collector

- **D-14:** Share policy, sanitization, URL/handle extraction, limitation
  formatting, command tracking, and output assembly helpers across Firecrawl,
  Playwright, Instagram Graph, and Apify paths where safe.
- **D-15:** Preserve data-collector public/authorized research boundaries:
  do not add login bypass, anti-blocking behavior, private scraping, new secret
  requirements, or provider calls not already represented by current code and
  runbooks.
- **D-16:** Preserve research pack section names and limitation wording where
  tests or docs treat them as operational contract.

### Scope Fences

- **D-17:** Do not modify orchestrator route behavior, Plane/Linear provider
  defaults, webhook semantics, database schema, dashboard SQL, live deploy
  config, Tailscale Funnel, or Plane labels in Phase 6.
- **D-18:** Do not remove `coder-agent` compatibility aliases, workflow labels,
  agent keys, skill registry entries, or model aliases without a dedicated
  external-reference audit.
- **D-19:** If a refactor requires changing product behavior or external
  provider behavior, stop and record the exact gap for Phase 7 or a follow-up
  milestone instead of expanding scope silently.

### the agent's Discretion

The planner may choose exact module names and plan granularity, but should keep
the roadmap's three-slice shape unless research proves a dependency requires a
different wave order. The implementation path should optimize for reversible,
test-first seams over maximal file movement.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Planning And Prior Phase Contracts

- `.planning/ROADMAP.md` - Phase 6 scope, success criteria, and planned slices.
- `.planning/REQUIREMENTS.md` - REF-03, REF-04, REF-05, REF-06, VER-01,
  VER-02, and VER-03 requirements.
- `.planning/STATE.md` - milestone state and prior decisions.
- `.planning/phases/04-operational-flow-reorganization/04-CONTEXT.md` -
  active worker/eval/data-collector ownership contracts.
- `.planning/phases/04-operational-flow-reorganization/04-VERIFICATION.md` -
  verified source-owner and flow anchors.
- `.planning/phases/05-orchestrator-hub-refactor/05-CONTEXT.md` - explicit
  deferral of worker/eval/codegen/data-collector refactors to this phase.
- `.planning/phases/05-orchestrator-hub-refactor/05-VERIFICATION.md` -
  verified route/helper seams that Phase 6 must not disturb.

### Current Docs And Runbooks

- `docs/CURRENT.md` - active operational surface/status map.
- `docs/ARCHITECTURE.md` - Plane-first topology and worker execution flow.
- `docs/decisions/FLOW-agent-workflow.md` - delivery pipeline stages.
- `docs/runbooks/landing-page-agent.md` - landing/codegen workflow contract.
- `docs/runbooks/data-collector-agent.md` - research/data-collector contract,
  provider boundaries, and research pack expectations.
- `docs/runbooks/eval-harness.md` - eval harness operation and verification.
- `docs/runbooks/agent-skills.md` - agent key and skill registry ownership.
- `docs/runbooks/secrets.md` - external provider secret boundaries.

### Worker Execution And Codegen

- `apps/worker-code/src/routes/jobs.ts` - worker HTTP API contract.
- `apps/worker-code/src/executor/runJob.ts` - current worker execution hub.
- `apps/worker-code/src/executor/runJob.test.ts` - runner behavior coverage.
- `apps/worker-code/src/executor/codegen.ts` - current codegen hub.
- `apps/worker-code/src/executor/codegen.test.ts` - codegen behavior coverage.
- `apps/worker-code/src/executor/validation.ts` - validation helper seam.
- `apps/worker-code/src/executor/git.ts` - Git operation helper seam.
- `apps/worker-code/src/executor/worktree.ts` - worktree helper seam.
- `apps/worker-code/src/executor/sandbox.ts` - sandbox helper seam.
- `apps/worker-code/src/executor/commandPolicy.ts` - command policy owner.
- `apps/worker-code/src/executor/agentSkills.ts` - skill instruction owner.
- `apps/worker-code/src/executor/context.ts` - executor context helpers.

### Research And Media Helpers

- `apps/worker-code/src/executor/firecrawlResearch.ts` - current
  data-collector hub and research pack formatter.
- `apps/worker-code/src/executor/firecrawlResearch.test.ts` - Firecrawl and
  research pack coverage.
- `apps/worker-code/src/executor/scrapingPolicy.ts` - URL policy owner.
- `apps/worker-code/src/executor/playwrightResearch.ts` - controlled
  Playwright research path.
- `apps/worker-code/src/executor/instagramGraphResearch.ts` - Instagram Graph
  Business Discovery path.
- `apps/worker-code/src/executor/apifyInstagramResearch.ts` - Apify Instagram
  provider path.
- `apps/worker-code/src/executor/higgsfieldTool.ts` - media generation helper.
- `apps/worker-code/src/executor/landingQuality.ts` - landing quality checks.

### Eval Harness

- `apps/worker-code/src/eval/runEval.ts` - current eval CLI/orchestration hub.
- `apps/worker-code/src/eval/runEval.test.ts` - eval CLI/report coverage.
- `apps/worker-code/src/eval/scoring.ts` - scoring logic owner.
- `apps/worker-code/src/eval/scoring.test.ts` - scoring coverage.
- `apps/worker-code/src/eval/types.ts` - eval scenario/report types.
- `apps/worker-code/src/eval/runtime.ts` - eval runtime helpers.
- `apps/worker-code/src/eval/workerDryRun.ts` - dry-run execution helper.
- `apps/worker-code/src/eval/roleQuality.ts` - role quality eval owner.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- Phase 5 created route/helper seams and verified that worker/eval internals
  were untouched and ready for Phase 6.
- `runJob.ts` already delegates some work to `codegen.ts`, `git.ts`,
  `worktree.ts`, `sandbox.ts`, `validation.ts`, `higgsfieldTool.ts`, and
  `firecrawlResearch.ts`; use those as existing boundary hints.
- `codegen.ts` already has focused coverage and nearby helpers for command
  policy, context, agent skills, and validation.
- Eval already has `scoring.ts`, `types.ts`, `runtime.ts`,
  `workerDryRun.ts`, and `roleQuality.ts`; the likely hub is `runEval.ts`.
- Research providers already have separate modules for Playwright, Instagram
  Graph, Apify Instagram, and scraping policy; `firecrawlResearch.ts` is the
  main aggregation/formatting hub.

### Established Patterns

- Tests are Vitest unit tests colocated with worker modules.
- Project commands should be run with `rtk`, and final phase closeout should
  include `rtk corepack pnpm verify`.
- Prior refactor phases used RED tests that fail on missing seam modules, then
  GREEN commits that move behavior with route/domain regression tests.
- Docs prefer current source-owner maps over duplicating mutable runtime values.

### Integration Points

- Orchestrator dispatches worker jobs through `apps/worker-code/src/routes/jobs.ts`;
  Phase 6 must preserve that API surface.
- Worker execution reports back to the orchestrator; Phase 6 must preserve
  callback shape and final report semantics.
- Data-collector research packs feed landing/codegen continuation; Phase 6 must
  preserve artifact contents expected by docs/tests.
- Eval and regression eval are part of `pnpm verify`; Phase 6 must preserve
  scores and report semantics through the split.

</code_context>

<specifics>
## Specific Ideas

- Recommended plan order:
  1. Refactor `runJob.ts` around execution seams and characterization tests.
  2. Refactor `codegen.ts` around prompt, JSON, file, apply, and fix modules.
  3. Refactor eval harness and data-collector helper duplication.
- Prefer moving pure helpers before stateful orchestration and keep old exported
  functions or compatibility wrappers when tests or imports depend on them.
- Keep final verification broad: focused worker/eval/research tests, typecheck,
  package diff check, and `rtk corepack pnpm verify`.

</specifics>

<deferred>
## Deferred Ideas

- Behavior changes to data collection providers, scraping policy, browser
  strategy, private/authorized Instagram access, or generated landing product
  behavior are out of scope.
- Replacing the eval framework, LLM routing, LangGraph/BullMQ/Hono, or monorepo
  structure is out of scope.
- Final milestone audit, remaining debt decisions, and destructive cleanup
  confirmations belong to Phase 7 or lifecycle gates.

</deferred>

---

*Phase: 06-Worker and Eval Hub Refactor*
*Context gathered: 2026-07-02*
