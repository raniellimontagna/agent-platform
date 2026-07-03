# Project: Agent Platform Retomada Arquitetural

**Initialized:** 2026-07-02
**Mode:** Brownfield cleanup, aggressive but test-gated
**Primary runtime:** Codex/GSD-compatible planning

## Core Value

Recover control of `agent-platform` by turning a grown, AI-assisted codebase into a
documented, Plane-first, modular, verifiable system that can keep evolving without
accumulating accidental complexity.

## Current Milestone: v1.1 Linear Cleanup + Operational Hardening

**Goal:** Finish the Plane-only cutover by removing Linear destructively where safe,
then harden the operational surfaces exercised by the full E2E flow.

**Target features:**
- Destructive Linear cleanup with production row audit, tests, migration notes, and rollback path.
- Scheduler duplicate-fire protection and runtime tests around recurring Plane work.
- Runner/gateway operational hardening for deploy bundles, cache, disk pressure, and health checks.
- Final verification with `rtk corepack pnpm verify`, eval/regression evidence, and a fresh Plane -> Orchestrator -> Runner -> PR smoke flow.

## Current State

The project is functional and heavily tested, but its documentation and structure have
grown through many AI-assisted cards. The current repo has broad documentation, many
historical specs/plans, and several large modules that mix orchestration, provider
compatibility, rendering, validation, and workflow concerns.

Important observed facts from the bootstrap audit:
- `README.md` and `docs/ARCHITECTURE.md` explain the macro system, but mix current
  state with card history.
- `docs/` contains 77 Markdown files, including 23 specs and 23 implementation plans
  under `docs/superpowers/`.
- Plane is the intended primary provider; Linear remains as legacy support and can be
  removed if inventory confirms no active dependency.
- Milestone v1.0 closed the Plane-first refactor with Linear left only as accepted
  destructive cleanup debt.
- Large hubs worth decomposing include `apps/worker-code/src/eval/runEval.ts`,
  `apps/worker-code/src/executor/codegen.ts`,
  `apps/worker-code/src/executor/firecrawlResearch.ts`,
  `apps/orchestrator-api/src/routes/admin.ts`,
  `apps/worker-code/src/executor/runJob.ts`,
  `apps/orchestrator-api/src/routes/webhooks.ts`, and
  `apps/orchestrator-api/src/runs.ts`.
- Visible duplication exists around auth middleware, HTML/date helpers, webhook
  signature handling, provider branching, route rendering, and legacy Plane/Linear
  terminology.

## Non-Negotiables

- Keep `rtk` prefix for commands when running project commands.
- Keep `corepack pnpm verify` green before claiming completion.
- Preserve unrelated user changes.
- Do not rewrite LangGraph, BullMQ, Hono, or the monorepo structure unless a phase
  proves it is necessary.
- Remove legacy aggressively only after inventory, tests, and rollback/migration
  path are explicit.
- Every behavior-changing refactor needs a fail-first or characterization test before
  implementation.
- Documentation changes must distinguish living docs from historical archives.

## Target Architecture

- Plane-only operational flow as the default and only active card provider.
- `software-delivery-pipeline` as the clear identity for the software agent flow;
  `coder-agent` may remain only as a compatibility alias if tests prove it is still
  required.
- Living docs explain current operation; historical plans/specs are archived and
  indexed separately.
- Workflow modules are split by responsibility: intake, approval, execution,
  validation, review, PR, report, and follow-up workflows.
- Worker modules separate code generation, research collection, media generation,
  validation, self-correction, commits, and reporting.
- Shared helpers live in package/module seams instead of being copied across routes.

## Key Decisions

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-07-02 | Run this as a complete GSD milestone. | The work spans docs, architecture, providers, tests, and refactors. |
| 2026-07-02 | Use an aggressive cleanup posture. | The user wants to recover control, reduce slop, and remove stale legacy. |
| 2026-07-02 | Linear can be removed if inventory confirms Plane covers current usage. | Linear is a major source of conceptual and code duplication. |
| 2026-07-02 | Start with inventory before destructive refactors. | It prevents deleting hidden dependencies and creates a factual baseline. |
| 2026-07-02 | Make the roadmap runnable by `gsd-autonomous`. | The phase may be long and should survive context resets. |
| 2026-07-02 | Install GSD Core globally for Codex and invoke it as `$gsd-autonomous`. | The Codex installer uses `$skill-name` syntax and stores runtime assets under `~/.codex/gsd-core`. |
| 2026-07-03 | Scope v1.1 to Linear destructive cleanup plus operational hardening. | The v1.0 audit left both as accepted debt, and the E2E/OmniRoute work exposed concrete deploy and disk hardening needs. |

## Open Questions For v1.1

- Are there any production rows or external integrations still depending on
  `linear_issue_*`, `/webhooks/linear`, `packages/linear`, or Linear env vars?
- Which Linear schema fields can be dropped immediately, and which need a compatibility
  migration or documented retention window?
- Should scheduler duplicate-fire protection live at the database uniqueness layer,
  queue/job-id layer, or both?
- Which generated directories must be excluded from runner deploy bundles without
  hiding required runtime artifacts?
