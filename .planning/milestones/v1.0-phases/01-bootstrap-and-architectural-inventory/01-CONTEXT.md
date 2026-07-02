# Phase 1: Bootstrap and Architectural Inventory - Context

**Gathered:** 2026-07-02
**Status:** Ready for planning
**Mode:** Autonomous smart discuss using prior user decisions

<domain>
## Phase Boundary

Produce a factual current-state inventory for `agent-platform`: documentation
state, active operational flows, Plane/Linear provider dependencies, environment
and schema concerns, test/eval surface, large modules, duplicated helpers, and
cleanup risks. This phase does not remove runtime behavior; it creates the
baseline and go/no-go gates for aggressive cleanup.

</domain>

<decisions>
## Implementation Decisions

### Cleanup Posture
- Use aggressive cleanup language and rank stale/duplicated pieces directly.
- Do not delete runtime support until inventory classifies usage and tests exist.
- Treat Plane as the desired active provider and Linear as removal candidate.
- Keep every risky removal tied to rollback or migration notes.

### Documentation Control
- Separate living operator docs from historical planning records.
- Keep `docs/superpowers` as historical evidence, not current operator guidance.
- Prefer indexes and explicit status over bulk deletion in the first pass.
- Make future phases runnable from `.planning`, independent of this conversation.

### Provider Migration
- Phase 1 may classify Linear references, but Phase 3 owns removal.
- Schema fields, dashboard SQL, env examples, tests, and package dependencies all
  need separate treatment.
- Existing production rows may still depend on `linear_issue_*` columns, so DB
  removal is blocked until migration evidence exists.
- Compatibility aliases such as `coder-agent` remain until external references
  are proven absent.

### the agent's Discretion
The agent may choose audit format, file grouping, and risk labels as long as the
inventory is concrete enough to drive subsequent refactors without rereading the
entire repository.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `CLAUDE.md` is the canonical project instruction file and requires `rtk`.
- `.planning/ROADMAP.md` and `.planning/REQUIREMENTS.md` already define the
  milestone requirements and phase boundaries.
- `rtk corepack pnpm verify` is the strongest existing verification gate.

### Established Patterns
- TypeScript monorepo with `apps/*` and `packages/*`.
- Orchestrator uses Hono routes, Drizzle schema, BullMQ, LangGraph state nodes,
  and provider gateways behind `@agent-platform/cards`.
- Worker uses focused executor modules, but the main job orchestration still
  sits in `runJob.ts`.

### Integration Points
- Plane card intake: `apps/orchestrator-api/src/routes/webhooks.ts`.
- Card provider registry: `packages/cards`, `packages/plane`, `packages/linear`,
  and `apps/orchestrator-api/src/cards.ts`.
- Run persistence: `apps/orchestrator-api/src/runs.ts` and
  `apps/orchestrator-api/src/db/schema.ts`.
- Worker execution and eval: `apps/worker-code/src/executor/*` and
  `apps/worker-code/src/eval/*`.

</code_context>

<specifics>
## Specific Ideas

- Prioritize removing AI slop by making sources of truth explicit.
- Keep Phase 1 mostly read-only except for planning artifacts.
- Use Phase 1 output to decide whether Linear can be removed in Phase 3.

</specifics>

<deferred>
## Deferred Ideas

- Runtime Linear removal is deferred to Phase 3.
- Large module refactors are deferred to Phases 5 and 6.
- Final verification/governance cleanup is deferred to Phase 7.

</deferred>

