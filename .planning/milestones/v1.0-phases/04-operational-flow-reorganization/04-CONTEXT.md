# Phase 4: Operational Flow Reorganization - Context

**Gathered:** 2026-07-02
**Status:** Ready for planning
**Mode:** Autonomous smart-discuss defaults accepted by `--auto`

<domain>
## Phase Boundary

Phase 4 reorganizes the active operational flows so maintainers can understand and verify the Plane-first product loop without relying on scattered historical docs or implicit code knowledge. It should consolidate current flow documentation, name canonical sources of truth, and add or align tests where documentation makes behavior claims.

This phase should not perform the large code hub refactors reserved for Phases 5 and 6. It may make small doc-supporting or test-supporting code edits only when needed to expose an existing source of truth or preserve compatibility aliases.
</domain>

<decisions>
## Implementation Decisions

### Main Delivery Flow

- Document the current active flow as Plane intake -> orchestrator run creation -> BullMQ worker execution -> GitHub PR/merge/report -> Plane comment/status update.
- Treat Plane as the only active provider for new work; Linear appears only as historical or rollback/migration compatibility.
- Anchor flow claims to concrete tests and entry points: `routes/webhooks.ts`, `runs.ts`, `queue.ts`, `worker.ts`, `apps/worker-code/src/routes/jobs.ts`, `apps/worker-code/src/executor/runJob.ts`, and relevant test files.
- Do not create a new product UI or replace Mission Control in this phase; document the current Mission Control role and defer UI redesign.

### Research-To-Landing Continuation

- Document research-to-landing as a composed workflow with explicit trigger labels/agent keys, input requirements, output artifacts, and failure/rollback behavior.
- Keep the workflow compatible with the existing `coder-agent` key while identifying clearer specialized identities such as `landing-page-agent` and `software-delivery-pipeline`.
- Verify behavior through existing tests or focused additions around continuation/enqueueing and skill registry mapping; avoid a new end-to-end external run unless already supported by local tests.
- Treat research pack/artifact shape as an operational contract: public evidence, generated assets, run artifacts, and final Plane report are the user-visible outputs.

### Operational Surface Ownership

- Give scheduler, Mission Control, eval harness, registry, skills, and artifact store an explicit active/legacy/deferred status in current docs.
- Each active surface should have one current runbook or canonical doc link from `docs/README.md` or `docs/CURRENT.md`.
- Historical docs stay indexed under `docs/HISTORICAL.md`; do not rewrite old ADRs or disposable smoke-test docs as current guidance.
- If a surface lacks enough code/test coverage, record a concrete gap and either add focused characterization tests or defer to a named later phase.

### Naming And Sources Of Truth

- Name canonical sources for workflow labels, Plane labels, agent keys, skill registry entries, model aliases, and runner/artifact paths.
- Keep `coder-agent` as a compatibility alias unless this phase proves no external references remain. Do not remove labels or registry keys without a targeted reference audit.
- Prefer docs that point to code/config as source of truth instead of duplicating mutable values. Examples: model aliases in `packages/llm`, agent skills in `agent-skills/registry.json`, Plane migration labels in `docs/runbooks/plane-migration-2026-06-20.md`, runtime env in `.env.example` files.
- Use consistent current terminology: "Plane-first", "active Plane intake", "legacy/migration-only Linear", "software delivery pipeline", and "specialized landing/research agents".

### the agent's Discretion

- The agent may decide whether to split Phase 4 into exactly the two roadmap plans or add finer-grained plan files if verification risk warrants it.
- The agent may choose focused test additions where they provide better evidence than pure documentation edits.
- The agent may update index/navigation docs as needed to make current-vs-historical status unambiguous.
</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets

- `docs/README.md`, `docs/CURRENT.md`, and `docs/HISTORICAL.md` are the current documentation control layer from Phase 2.
- `docs/decisions/FLOW-agent-workflow.md` contains the historical/flow baseline and should be reconciled with Plane-first current docs.
- `docs/runbooks/webhook-tailscale.md`, `docs/runbooks/research-to-landing-workflow.md`, `docs/runbooks/eval-harness.md`, `docs/runbooks/mission-control.md`, `docs/runbooks/agent-skills.md`, and `docs/runbooks/landing-page-agent.md` are the likely active runbook anchors.
- `agent-skills/registry.json` is the canonical skill mapping file; `docs/runbooks/agent-skills.md` already documents `coder-agent` compatibility and `software-delivery-pipeline`.
- `packages/llm/src/index.ts` defines model aliases: `cheap_fast`, `research`, `strong_coder`, `heavy_coder`, and `critic`.

### Established Patterns

- GSD phases use plan summaries with verification evidence and explicit deferred items rather than broad undocumented rewrites.
- Phase 3 retained compatibility seams while removing active Linear behavior; Phase 4 should follow the same current-vs-legacy discipline.
- Tests are preferred for behavior claims. Existing relevant coverage includes webhook, scheduler, runs, Plane migration, graph report/merge, env/provider, worker eval, and skill registry tests.
- Docs should avoid duplicating secrets or live IDs except where the migration runbook already owns Plane label IDs.

### Integration Points

- Plane intake: `apps/orchestrator-api/src/routes/webhooks.ts`
- Run persistence: `apps/orchestrator-api/src/runs.ts`
- Async execution: `apps/orchestrator-api/src/queue.ts`, `apps/orchestrator-api/src/worker.ts`
- Scheduler: `apps/orchestrator-api/src/scheduleWorker.ts`
- Mission Control/admin: `apps/orchestrator-api/src/routes/admin.ts`
- Worker API: `apps/worker-code/src/routes/jobs.ts`
- Worker execution: `apps/worker-code/src/executor/runJob.ts`, `apps/worker-code/src/executor/codegen.ts`
- Eval harness: `apps/worker-code/src/eval/runEval.ts`
- Artifacts: orchestrator `artifacts` table migrations and worker `RUNNER_ARTIFACTS_DIR`
</code_context>

<specifics>
## Specific Requirements

- FLOW-01: Main delivery flow must be documented and tested as Plane -> run -> PR/report.
- FLOW-02: Research-to-landing continuation must be documented and tested as a composed workflow with clear trigger and ownership.
- FLOW-03: Scheduler, Mission Control, eval harness, registry, skills, and artifact store must have clear ownership and active runbooks.
- FLOW-04: Workflow labels, agent keys, skills, and model aliases must have one named source of truth.
- Preserve Phase 3 Plane-only active provider decisions and do not re-enable Linear.
- Do not delete historical docs; re-index or label them if needed.
</specifics>

<deferred>
## Deferred Ideas

- Full Mission Control UI rewrite remains out of scope.
- Large route/module refactors belong to Phases 5 and 6.
- Removing `coder-agent` entirely requires external reference audit and probably a separate compatibility plan.
- Deleting legacy Linear schema/package/route support still requires separate destructive confirmation.
</deferred>
