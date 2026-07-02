# Phase 04: Operational Flow Reorganization - Research

**Researched:** 2026-07-02
**Domain:** Plane-first operational flow documentation, source-of-truth mapping, and local test coverage
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
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

### Deferred Ideas (OUT OF SCOPE)
## Deferred Ideas

- Full Mission Control UI rewrite remains out of scope.
- Large route/module refactors belong to Phases 5 and 6.
- Removing `coder-agent` entirely requires external reference audit and probably a separate compatibility plan.
- Deleting legacy Linear schema/package/route support still requires separate destructive confirmation.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FLOW-01 | Main delivery flow must be documented and tested as Plane -> run -> PR/report. | Plane intake, run identity, queue, graph, worker, PR/report, and Plane comment paths are mapped below with focused tests. [VERIFIED: .planning/REQUIREMENTS.md; codebase grep] |
| FLOW-02 | Research-to-landing continuation must be documented and tested as a composed workflow with clear trigger and ownership. | `workflows.ts`, `worker.ts`, data collector, landing agent, artifacts, Mission Control, and worker skill injection are mapped with existing tests and one docs gap. [VERIFIED: .planning/REQUIREMENTS.md; codebase grep] |
| FLOW-03 | Scheduler, Mission Control, eval harness, registry, skills, and artifact store must have clear ownership and active runbooks. | Mission Control, eval harness, agent skills, and artifacts have runbooks; scheduler lacks a dedicated active runbook and should be filled in Phase 4. [VERIFIED: docs/runbooks/README.md; codebase grep] |
| FLOW-04 | Workflow labels, agent keys, skills, and model aliases must have one named source of truth. | Current owners are distributed: labels in `workflows.ts`/`webhooks.ts`/env/migration docs, agent keys in `agents.ts`, skills in `agent-skills/registry.json`, model aliases in `packages/llm` plus `roleModels.ts`. [VERIFIED: codebase grep] |
</phase_requirements>

## Summary

Phase 4 is a current-state alignment phase, not a production refactor phase. The code already has Plane-first behavior after Phase 3: `/webhooks/plane` creates provider-aware runs, approval labels resume paused runs, BullMQ moves plan/resume jobs, the LangGraph pipeline dispatches worker jobs, and the report node posts final status back to the card provider. [VERIFIED: apps/orchestrator-api/src/routes/webhooks.ts; apps/orchestrator-api/src/queue.ts; packages/graph/src/build.ts; packages/graph/src/nodes/report.ts]

Research-to-landing is already implemented as a composed two-run workflow: `workflow:landing-page` selects `data-collector-agent` for the first run, the completed research artifact triggers a continuation run using `landing-page-agent`, and the second run receives the promoted `Landing Page Brief` before the full research pack. [VERIFIED: apps/orchestrator-api/src/workflows.ts; apps/orchestrator-api/src/worker.ts; docs/runbooks/research-to-landing-workflow.md]

The planning focus should be documentation ownership, exact source-of-truth links, and focused characterization tests where docs make behavior claims. Do not centralize all labels/keys into a new abstraction during this phase; the existing owners are intentionally spread across runtime constants, env variables, registry JSON, and runbooks. [VERIFIED: .planning/phases/04-operational-flow-reorganization/04-CONTEXT.md; codebase grep]

**Primary recommendation:** Keep the roadmap split into two plans: `04-01` for current flow documentation plus coverage alignment, and `04-02` for naming/source-of-truth normalization across docs and small tests. [VERIFIED: .planning/ROADMAP.md; codebase grep]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|--------------|----------------|-----------|
| Plane intake and approval transitions | API / Backend | Database / Storage | Webhook signature validation, label transition detection, run creation/resume, and cancellation live in `routes/webhooks.ts`, `runs.ts`, and BullMQ enqueueing. [VERIFIED: apps/orchestrator-api/src/routes/webhooks.ts] |
| Main delivery execution | API / Backend | Worker runtime | Orchestrator owns graph state and queue dispatch; worker-code owns sandboxed code generation, validation, commit/push, and callback. [VERIFIED: packages/graph/src/build.ts; apps/worker-code/src/executor/runJob.ts] |
| Research-to-landing continuation | API / Backend | Worker runtime, Artifact Store | Orchestrator detects completed research and creates the landing run; worker generates research packs and landing code; artifacts persist the research contract. [VERIFIED: apps/orchestrator-api/src/worker.ts; apps/worker-code/src/executor/runJob.ts; apps/orchestrator-api/src/artifacts.ts] |
| Scheduler | API / Backend | Redis/BullMQ, Database | Schedules persist in Postgres, reconcile into BullMQ schedulers, then create Plane cards/runs. [VERIFIED: apps/orchestrator-api/src/schedules.ts; apps/orchestrator-api/src/scheduleQueue.ts; apps/orchestrator-api/src/scheduleWorker.ts] |
| Mission Control | API / Backend | Browser / Client | It is server-rendered Hono admin HTML/API with read-only scenario and mission state; no client app owns behavior. [VERIFIED: apps/orchestrator-api/src/routes/admin.ts; docs/runbooks/mission-control.md] |
| Eval harness | Worker runtime / CLI | Local filesystem | The eval CLI loads fixtures, creates temp repos, writes `.eval-runs`, and never calls Plane/GitHub/LLM in normal eval fixtures. [VERIFIED: apps/worker-code/src/eval/runEval.ts; docs/runbooks/eval-harness.md] |
| Agent keys and skill registry | API / Backend | Worker runtime | Agent catalog keys are seeded by orchestrator; worker loads repo-local `agent-skills/registry.json` for prompt injection. [VERIFIED: apps/orchestrator-api/src/agents.ts; apps/worker-code/src/executor/agentSkills.ts] |
| Model aliases | LLM package / Gateway boundary | Graph roles | Alias type/pricing live in `packages/llm`; role-to-alias defaults live in `packages/graph/src/roleModels.ts`. [VERIFIED: packages/llm/src/index.ts; packages/graph/src/roleModels.ts] |
| Artifact store | Database / Storage | API / Backend | Artifact kinds/schema and REST access live in orchestrator, while worker result payloads supply `research`, `summary`, `validation`, etc. [VERIFIED: apps/orchestrator-api/src/db/schema.ts; apps/orchestrator-api/src/routes/artifacts.ts] |

## Project Constraints (from AGENTS.md)

- `AGENTS.md` is only a pointer; all actionable project rules are in `CLAUDE.md`. [VERIFIED: AGENTS.md]
- Use Conventional Commit branch/message style. [VERIFIED: CLAUDE.md]
- Plane workspace `attodev`, project `Agent Platform` (`AGP`) is the primary provider; Linear is optional/legacy only when the original card is Linear. [VERIFIED: CLAUDE.md]
- Prefix project commands with `rtk`, including chained commands. [VERIFIED: CLAUDE.md]
- Keep `corepack pnpm verify` green before claiming production implementation complete. [VERIFIED: .planning/PROJECT.md; CLAUDE.md]
- Preserve unrelated dirty/untracked changes. [VERIFIED: .planning/PROJECT.md; user instruction]
- Do not rewrite LangGraph, BullMQ, Hono, or the monorepo structure unless a phase proves it is necessary. [VERIFIED: .planning/PROJECT.md]
- Every behavior-changing refactor needs a fail-first or characterization test before implementation. [VERIFIED: .planning/PROJECT.md]
- Documentation changes must distinguish living docs from historical archives. [VERIFIED: .planning/PROJECT.md]

## Standard Stack

### Core

| Library / Tool | Version | Purpose | Why Standard |
|----------------|---------|---------|--------------|
| TypeScript | `^5.7.3` | Monorepo implementation language and typecheck target. | Existing packages use TypeScript ESM and `tsc` builds. [VERIFIED: package.json; apps/*/package.json; packages/*/package.json] |
| Hono | `^4.7.2` | Orchestrator and worker HTTP routing. | Existing API routes, webhooks, admin, schedules, artifacts, and worker jobs are Hono apps. [VERIFIED: apps/orchestrator-api/package.json; apps/worker-code/package.json] |
| BullMQ | `^5.34.0` | Agent and schedule queues. | Existing `agent-runs` and `agent-schedules` queues use BullMQ. [VERIFIED: apps/orchestrator-api/package.json; apps/orchestrator-api/src/queue.ts; apps/orchestrator-api/src/scheduleQueue.ts] |
| LangGraph | `^0.2.74` | Agent state machine. | Existing delivery pipeline is a LangGraph graph with Postgres checkpointing. [VERIFIED: packages/graph/package.json; packages/graph/src/build.ts] |
| Drizzle ORM | `^0.38.4` | Postgres schema and data access. | Existing run, schedule, agent, artifact, approval, and lesson tables are Drizzle schema/data functions. [VERIFIED: apps/orchestrator-api/package.json; apps/orchestrator-api/src/db/schema.ts] |
| Vitest | `^3.2.0` | Unit and characterization tests. | Existing test suite is `**/*.test.ts` under `vitest.config.ts`. [VERIFIED: package.json; vitest.config.ts] |
| Biome | `^1.9.4` | Lint/format gate. | `corepack pnpm verify` starts with `biome check .`; generated eval/cache paths are ignored. [VERIFIED: package.json; biome.json] |

### Supporting

| Library / Tool | Version | Purpose | When to Use |
|----------------|---------|---------|-------------|
| `@agent-platform/llm` model aliases | workspace package | Stable model alias contract: `cheap_fast`, `research`, `strong_coder`, `heavy_coder`, `critic`. | Use docs to point at this file instead of copying model/provider routing details. [VERIFIED: packages/llm/src/index.ts] |
| `agent-skills/registry.json` | version `1` | Agent-to-skill mapping for worker prompt injection. | Use as source of truth for skill sets and compatibility between `coder-agent` and `software-delivery-pipeline`. [VERIFIED: agent-skills/registry.json; apps/worker-code/src/executor/agentSkills.ts] |
| `.env.example` files | current repo state | Runtime label IDs, provider flags, artifact directories, and generated repo settings. | Use docs to point at these for env names/defaults; do not duplicate secrets or mutable deployment values. [VERIFIED: apps/orchestrator-api/.env.example; apps/worker-code/.env.example] |
| `.eval-runs` output | generated by eval CLI | Eval reports, latest baseline, history, and per-scenario artifacts. | Use for eval verification evidence; do not hand-edit as source. [VERIFIED: apps/worker-code/src/eval/runEval.ts; docs/runbooks/eval-harness.md] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Existing Hono admin/runbook documentation | Build a new UI or frontend app | Out of scope; Mission Control is intentionally read-only and Phase 5 owns route/render refactors. [VERIFIED: 04-CONTEXT.md; docs/runbooks/mission-control.md] |
| Existing distributed constants | New central constants package for every label/key | Higher blast radius and likely Phase 5/6 refactor work; Phase 4 should name owners and only make focused support edits. [VERIFIED: codebase grep] |
| Existing Vitest characterization tests | New external end-to-end Plane run | Context explicitly says avoid new external run unless local tests already support it. [VERIFIED: 04-CONTEXT.md] |

**Installation:**
```bash
# No package installs are recommended for Phase 4.
```

**Version verification:** Versions above were read from package manifests in this session. [VERIFIED: package.json; apps/orchestrator-api/package.json; apps/worker-code/package.json; packages/graph/package.json; packages/llm/package.json]

## Package Legitimacy Audit

No external packages should be installed in this phase. Package legitimacy gate is not applicable. [VERIFIED: 04-CONTEXT.md; package manifests]

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| none | n/a | n/a | n/a | n/a | n/a | No new package install |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Implementation Targets

| Capability | Edit Targets | Test Targets | Notes |
|------------|--------------|--------------|-------|
| Main Plane delivery flow | `docs/CURRENT.md`, `docs/ARCHITECTURE.md`, `docs/decisions/FLOW-agent-workflow.md`, `docs/runbooks/webhook-tailscale.md` | `apps/orchestrator-api/src/routes/webhooks.test.ts`, `apps/orchestrator-api/src/runs.test.ts`, `apps/orchestrator-api/src/queue.test.ts`, `apps/orchestrator-api/src/worker.test.ts`, `packages/graph/src/nodes/report.test.ts`, `packages/graph/src/nodes/merging.test.ts` | Keep claims anchored to code entry points; do not re-enable Linear. [VERIFIED: codebase grep] |
| Research-to-landing | `docs/runbooks/research-to-landing-workflow.md`, `docs/runbooks/data-collector-agent.md`, `docs/runbooks/landing-page-agent.md`, `docs/runbooks/mission-control.md` | `apps/orchestrator-api/src/workflows.test.ts`, `apps/orchestrator-api/src/worker.test.ts`, `apps/orchestrator-api/src/missionScenarios.test.ts`, `apps/orchestrator-api/src/missionTimeline.test.ts`, `apps/worker-code/src/executor/agentSkills.test.ts`, `packages/graph/src/nodes/coder.test.ts` | Existing tests already cover trigger, continuation, context formatting, timeline, and skill injection. [VERIFIED: codebase grep] |
| Scheduler ownership | Add or update `docs/runbooks/scheduler.md`; update `docs/runbooks/README.md`, `docs/CURRENT.md` | `apps/orchestrator-api/src/scheduleWorker.test.ts`, `apps/orchestrator-api/src/routes/schedules.test.ts` | There is no dedicated active scheduler runbook in `docs/runbooks/README.md`; this is the clearest FLOW-03 docs gap. [VERIFIED: docs/runbooks/README.md; codebase grep] |
| Mission Control ownership | `docs/runbooks/mission-control.md`, `docs/CURRENT.md`, possibly `docs/runbooks/README.md` | `apps/orchestrator-api/src/routes/admin.test.ts`, `apps/orchestrator-api/src/missionScenarios.test.ts`, `apps/orchestrator-api/src/missionTimeline.test.ts` | Document as read-only inspection; operator controls remain deferred. [VERIFIED: docs/runbooks/mission-control.md; apps/orchestrator-api/src/routes/admin.ts] |
| Eval harness ownership | `docs/runbooks/eval-harness.md`, `docs/CURRENT.md` | `apps/worker-code/src/eval/runEval.test.ts`, `apps/worker-code/src/eval/scoring.test.ts`, `apps/worker-code/src/eval/workerDryRun.test.ts`, `apps/worker-code/src/eval/roleQuality.test.ts` | Current runbook already documents 14 fixtures and `.eval-runs`; Phase 4 can add ownership/status language. [VERIFIED: docs/runbooks/eval-harness.md; apps/worker-code/evals/fixtures] |
| Agent keys and skills | `docs/runbooks/agent-skills.md`, `docs/CURRENT.md`, `docs/decisions/FLOW-agent-workflow.md`, maybe `agent-skills/registry.json` only if tests require alignment | `apps/orchestrator-api/src/agents.test.ts`, `apps/worker-code/src/executor/agentSkills.test.ts`, `apps/worker-code/src/executor/codegen.test.ts` | Keep `coder-agent` compatibility; do not remove registry keys. [VERIFIED: 04-CONTEXT.md; agent-skills/registry.json] |
| Model aliases | `docs/decisions/FLOW-agent-workflow.md`, `docs/CURRENT.md`, maybe `docs/runbooks/omniroute-access.md` | `packages/llm/src/cost.test.ts`, `packages/graph/src/roleModels.test.ts`, `packages/graph/src/nodes/planner.test.ts`, `packages/graph/src/nodes/review.test.ts` | Docs should point to `packages/llm/src/index.ts` and `packages/graph/src/roleModels.ts`. [VERIFIED: packages/llm/src/index.ts; packages/graph/src/roleModels.ts] |
| Artifact store | `docs/runbooks/research-to-landing-workflow.md`, `docs/runbooks/mission-control.md`, `docs/CURRENT.md` | `apps/orchestrator-api/src/artifacts.test.ts`, `apps/orchestrator-api/src/routes/artifacts.test.ts`, `apps/orchestrator-api/src/routes/admin.test.ts`, `apps/orchestrator-api/src/missionTimeline.test.ts` | `research` is a schema-backed artifact kind; unique `(run_id, kind)` means duplicate saves can fail non-fatally in worker. [VERIFIED: apps/orchestrator-api/src/db/schema.ts; apps/orchestrator-api/src/worker.ts] |

## Architecture Patterns

### System Architecture Diagram

```text
Plane work item
  | label transition: ai-ready / approved / removal
  v
Hono webhook route (/webhooks/plane)
  | verify HMAC, detect label transition, dedupe active card runs
  | create/resume/cancel run rows
  v
Postgres runs + approvals + run_steps + artifacts
  |
  v
BullMQ agent-runs queue
  | plan job -> graph planning -> approval interrupt
  | resume job -> graph coding/review/pr/merge/deploy/report
  v
LangGraph delivery pipeline
  | planner uses research alias
  | coder dispatches worker job
  | critic reviews diff
  | pr/merging/report update GitHub and Plane
  v
worker-code runner
  | data-collector-agent -> Firecrawl/Playwright research -> research artifact
  | landing/software agents -> codegen, validation, commit/push
  v
Result callback to orchestrator
  | save artifacts, update run status, maybe create continuation
  +-- if workflow == research_landing_page and research exists
       -> create landing-page-agent run with research context
```

### Recommended Project Structure

```text
docs/
├── README.md                         # documentation map
├── CURRENT.md                        # current-state ownership summary
├── ARCHITECTURE.md                   # detailed topology and flow
├── decisions/FLOW-agent-workflow.md  # detailed flow narrative
└── runbooks/
    ├── README.md                     # active runbook index
    ├── webhook-tailscale.md          # active Plane webhook exposure
    ├── research-to-landing-workflow.md
    ├── mission-control.md
    ├── eval-harness.md
    ├── agent-skills.md
    └── scheduler.md                  # recommended Phase 4 gap fill
```

### Pattern 1: Documentation Points To Code Owners

**What:** Docs should name a concept and point to the file that owns the mutable value. [VERIFIED: 04-CONTEXT.md]
**When to use:** Workflow labels, agent keys, Plane labels, model aliases, artifact paths, registry mappings. [VERIFIED: codebase grep]
**Example:**
```markdown
Source of truth:
- Workflow label: `apps/orchestrator-api/src/workflows.ts`
- Agent key mapping: `apps/orchestrator-api/src/agents.ts`
- Skill bundle: `agent-skills/registry.json`
- Model aliases: `packages/llm/src/index.ts`
```

### Pattern 2: Behavior Claim Gets A Focused Test Anchor

**What:** Each operational claim in current docs should have a matching local test command. [VERIFIED: .planning/PROJECT.md; vitest.config.ts]
**When to use:** Plane intake, approval, continuation, scheduler, Mission Control, eval harness, skill registry, and artifact claims. [VERIFIED: codebase grep]
**Example:**
```bash
rtk corepack pnpm vitest run apps/orchestrator-api/src/workflows.test.ts apps/orchestrator-api/src/worker.test.ts
```

### Pattern 3: Compatibility Alias Is Documented, Not Removed

**What:** `coder-agent` remains the compatibility key while `software-delivery-pipeline` is the clearer identity for docs and future evolution. [VERIFIED: apps/orchestrator-api/src/agents.ts; agent-skills/registry.json]
**When to use:** Any doc or registry update touching agent keys. [VERIFIED: 04-CONTEXT.md]
**Example:**
```text
Default label-less runs resolve through `AGENT_KEY` / `coder-agent`; docs may describe this as the software delivery pipeline, but the key remains compatible.
```

### Anti-Patterns to Avoid

- **Duplicating mutable label IDs in multiple current docs:** Put live IDs in `.env.example` or the Plane migration runbook; docs should link rather than copy when possible. [VERIFIED: apps/orchestrator-api/.env.example; docs/runbooks/plane-migration-2026-06-20.md]
- **Re-enabling Linear while documenting current flows:** Phase 3 made Plane the only active provider for new work; Linear is compatibility/rollback only. [VERIFIED: 03-05-SUMMARY.md; apps/orchestrator-api/src/env.ts]
- **Replacing Mission Control UI:** Mission Control is read-only; actions like replay/approve/cancel are explicitly future work. [VERIFIED: docs/runbooks/mission-control.md; apps/orchestrator-api/src/routes/admin.ts]
- **Removing `coder-agent`:** Context requires compatibility until an external reference audit proves removal is safe. [VERIFIED: 04-CONTEXT.md]
- **Creating a new workflow engine:** Current composed workflow logic is narrow and implemented in `workflows.ts` plus `worker.ts`; arbitrary workflows are out of scope. [VERIFIED: docs/runbooks/research-to-landing-workflow.md; apps/orchestrator-api/src/workflows.ts]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Label transition detection | New ad hoc webhook diffing | `labelJustAdded` plus provider-specific label extraction | It handles name/id matching and missing previous-label payloads. [VERIFIED: apps/orchestrator-api/src/cardWebhook.ts; apps/orchestrator-api/src/routes/webhooks.ts] |
| Plan/resume orchestration | Manual async job tracking | Existing BullMQ `agent-runs` queue and `resolvePlanJobCardRef` | It preserves provider-aware compatibility and old job fallback. [VERIFIED: apps/orchestrator-api/src/queue.ts] |
| Research continuation | New workflow service | `workflowFromLabels`, `shouldStartResearchToLandingContinuation`, `maybeStartResearchToLandingWorkflow` | Existing tests cover label trigger, research requirement, continuation enqueue, and context formatting. [VERIFIED: apps/orchestrator-api/src/workflows.ts; apps/orchestrator-api/src/worker.test.ts] |
| Agent skill loading | Dynamic package downloads or external skills | Repo-local `agent-skills/registry.json` and `buildSkillInstructions` | Current project explicitly prefers local reviewed skills and safe fallback. [VERIFIED: docs/runbooks/agent-skills.md; apps/worker-code/src/executor/agentSkills.ts] |
| Model routing | Hard-coded provider model names in docs | `ModelAlias` and `DEFAULT_ROLE_MODEL_ALIASES` | Gateway aliases are the contract; real provider routing belongs outside docs. [VERIFIED: packages/llm/src/index.ts; packages/graph/src/roleModels.ts] |
| Eval reports | Custom one-off report format | Existing `runEval.ts` output in `.eval-runs` | It already writes structured JSON, Markdown, latest baseline, and history. [VERIFIED: apps/worker-code/src/eval/runEval.ts] |
| Artifact storage | Filesystem-only run evidence | Existing `artifacts` table and REST route | Mission Control and continuation docs already depend on artifact metadata/content. [VERIFIED: apps/orchestrator-api/src/artifacts.ts; apps/orchestrator-api/src/routes/artifacts.ts] |

**Key insight:** Phase 4 should make existing operational contracts visible; hand-rolled replacement abstractions would compete with Phase 5/6 refactor boundaries. [VERIFIED: .planning/ROADMAP.md; 04-CONTEXT.md]

## Runtime State Inventory

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | `runs.workflow`, `runs.agent_id`, `runs.card_provider/card_id/card_identifier`, `runs.schedule_id`, `artifacts.kind`, `schedules`, `agents`, and retained `linear_issue_*` columns store operational identity. [VERIFIED: apps/orchestrator-api/src/db/schema.ts] | Code/docs only unless a plan renames values; do not migrate or delete runtime rows in Phase 4. |
| Live service config | Plane label IDs live in env and Plane workspace; Tailscale Funnel should expose only `/webhooks/plane`; BullMQ scheduler jobs live in Redis and reconcile from DB at worker startup. [VERIFIED: apps/orchestrator-api/src/env.ts; docs/runbooks/webhook-tailscale.md; apps/orchestrator-api/src/scheduleWorker.ts] | Document ownership; do not patch live services unless a manual runbook step is explicitly requested. |
| OS-registered state | Agent registry proxy is documented under `infra/systemd/agent-registry-proxy.*`; Tailscale Funnel path state is configured on LXC 201 outside git. [VERIFIED: docs/runbooks/agent-skills.md; docs/runbooks/webhook-tailscale.md] | No code migration; docs should warn these are operator-managed runtime states. |
| Secrets/env vars | `PLANE_*LABEL_ID`, `PLANE_WEBHOOK_SECRET`, `CARD_EXTRA_PROVIDERS`, `AGENT_KEY`, `RUNNER_ARTIFACTS_DIR`, Firecrawl/Playwright/Apify/Higgsfield env vars, and generated repo settings influence Phase 4 flows. [VERIFIED: apps/orchestrator-api/src/env.ts; apps/worker-code/src/env.ts] | Docs should point to env files and secrets runbook; do not copy secret values. |
| Build artifacts | `.eval-runs`, worker `RUNNER_ARTIFACTS_DIR`, dist builds, and generated Higgsfield media paths are runtime/build outputs. [VERIFIED: docs/runbooks/eval-harness.md; apps/worker-code/.env.example; apps/worker-code/src/executor/runJob.ts] | No cleanup; mention outputs as evidence locations only. |

**Nothing found in category:** None. Each category has relevant runtime state because this phase normalizes operational flow documentation and naming. [VERIFIED: codebase grep]

## Common Pitfalls

### Pitfall 1: Treating Docs As Source Of Truth For Mutable Runtime Values
**What goes wrong:** Plane label IDs, env names, model aliases, or skill bundles drift between docs and code. [VERIFIED: codebase grep]
**Why it happens:** Current docs repeat some values for operator convenience, while code has separate owners. [VERIFIED: docs/runbooks/plane-migration-2026-06-20.md; packages/llm/src/index.ts; agent-skills/registry.json]
**How to avoid:** Write docs as source-of-truth maps with links to owner files. [VERIFIED: 04-CONTEXT.md]
**Warning signs:** Same label/key appears in three active docs with no owner file named. [VERIFIED: codebase grep]

### Pitfall 2: Accidentally Reopening Linear As Active Intake
**What goes wrong:** Docs or tests present Linear as active provider path again. [VERIFIED: 03-05-SUMMARY.md]
**Why it happens:** Legacy Linear route/columns/packages remain for compatibility and can be mistaken for current flow. [VERIFIED: apps/orchestrator-api/src/routes/webhooks.ts; apps/orchestrator-api/src/db/schema.ts]
**How to avoid:** Use "legacy/migration-only Linear" wording and keep `/webhooks/linear` rollback-only. [VERIFIED: docs/CURRENT.md; docs/runbooks/webhook-tailscale.md]
**Warning signs:** New docs instruct normal operators to set `CARD_EXTRA_PROVIDERS=linear` or expose `/webhooks/linear`. [VERIFIED: apps/orchestrator-api/src/env.ts]

### Pitfall 3: Over-Testing With Live E2E When Local Characterization Exists
**What goes wrong:** Planning requires real Plane/GitHub runs for docs changes, causing slow or flaky verification. [VERIFIED: 04-CONTEXT.md]
**Why it happens:** The phrase "operational flow" sounds like live validation, but local tests already cover most behavior. [VERIFIED: test inventory]
**How to avoid:** Use focused Vitest commands and reserve manual E2E as optional operator evidence. [VERIFIED: docs/runbooks/mission-control.md]
**Warning signs:** A plan asks to create real Plane cards for every doc update. [VERIFIED: 04-CONTEXT.md]

### Pitfall 4: Flattening `coder-agent` Into A Rename
**What goes wrong:** Removing or renaming `coder-agent` breaks default `AGENT_KEY`, existing labels, tests, or stored runs. [VERIFIED: apps/orchestrator-api/src/env.ts; apps/orchestrator-api/src/agents.ts]
**Why it happens:** The clearer `software-delivery-pipeline` identity exists alongside the compatibility key. [VERIFIED: agent-skills/registry.json]
**How to avoid:** Document `software-delivery-pipeline` as the conceptual identity and `coder-agent` as compatibility key. [VERIFIED: docs/runbooks/agent-skills.md]
**Warning signs:** Registry or docs remove `coder-agent` without an external reference audit. [VERIFIED: 04-CONTEXT.md]

### Pitfall 5: Missing The Scheduler Runbook Gap
**What goes wrong:** FLOW-03 is marked complete while scheduler has code/tests but no active operator runbook. [VERIFIED: docs/runbooks/README.md; apps/orchestrator-api/src/scheduleWorker.ts]
**Why it happens:** Scheduler is documented in architecture and code comments but not indexed as an active runbook. [VERIFIED: docs/ARCHITECTURE.md; docs/runbooks/README.md]
**How to avoid:** Add `docs/runbooks/scheduler.md` or an equivalent current runbook section, then link it from `docs/runbooks/README.md` and `docs/CURRENT.md`. [VERIFIED: docs/runbooks/README.md]
**Warning signs:** Current docs mention scheduler only as a component, not as an operator task. [VERIFIED: docs/CURRENT.md; docs/ARCHITECTURE.md]

## Code Examples

Verified patterns from local sources:

### Workflow Label Owner
```typescript
// Source: apps/orchestrator-api/src/workflows.ts
export const RESEARCH_TO_LANDING_WORKFLOW = 'research_landing_page';
export const RESEARCH_TO_LANDING_LABEL = 'workflow:landing-page';
```

### Agent Key Owner
```typescript
// Source: apps/orchestrator-api/src/agents.ts
export const LANDING_PAGE_AGENT_KEY = 'landing-page-agent';
export const DATA_COLLECTOR_AGENT_KEY = 'data-collector-agent';
export const SOFTWARE_DELIVERY_PIPELINE_KEY = 'software-delivery-pipeline';
```

### Model Alias Owner
```typescript
// Source: packages/llm/src/index.ts
export type ModelAlias = 'cheap_fast' | 'research' | 'strong_coder' | 'heavy_coder' | 'critic';
```

### Focused Verification Command
```bash
# Source: vitest.config.ts and package.json
rtk corepack pnpm vitest run apps/orchestrator-api/src/workflows.test.ts apps/orchestrator-api/src/worker.test.ts
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Linear-first operational framing | Plane-first active intake, Linear legacy/migration-only | Phase 3 completed 2026-07-02 | Phase 4 docs must not present Linear as normal operation. [VERIFIED: 03-05-SUMMARY.md; docs/CURRENT.md] |
| Single `coder-agent` conceptual identity | `coder-agent` compatibility key plus `software-delivery-pipeline` conceptual identity | Current code before Phase 4 | Docs can improve terminology without runtime rename. [VERIFIED: apps/orchestrator-api/src/agents.ts; agent-skills/registry.json] |
| One-step agent delivery only | Composed `research_landing_page` workflow with collector run then landing run | Current code before Phase 4 | Docs/tests must show trigger, artifact contract, continuation, and failure behavior. [VERIFIED: apps/orchestrator-api/src/workflows.ts; apps/orchestrator-api/src/worker.ts] |
| Eval as informal test helper | Deterministic eval harness with 14 fixtures and regression gate | Current docs/code before Phase 4 | Keep eval harness as active verification surface. [VERIFIED: docs/runbooks/eval-harness.md; apps/worker-code/evals/fixtures] |

**Deprecated/outdated:**
- Normal Linear webhook exposure is outdated; `/webhooks/linear` is compatibility-only and disabled unless explicit legacy config is set. [VERIFIED: apps/orchestrator-api/src/routes/webhooks.ts; docs/runbooks/webhook-tailscale.md]
- Treating `docs/superpowers/**` as current operator guidance is outdated; it is historical unless current docs link it as active evidence. [VERIFIED: docs/HISTORICAL.md]

## Assumptions Log

All substantive claims in this research were verified against local project files during this session. No `[ASSUMED]` claims are required. [VERIFIED: codebase grep]

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| none | n/a | n/a | n/a |

## Resolved Planning Decisions

All planning questions from the research pass are resolved by the Phase 4 plans.

1. **Scheduler gets a dedicated active runbook.**
   - Decision: Create `docs/runbooks/scheduler.md` and link it from `docs/runbooks/README.md` plus `docs/CURRENT.md`.
   - Rationale: Scheduler has code/tests and architecture mentions, but no active runbook in `docs/runbooks/README.md`. [VERIFIED: docs/runbooks/README.md; apps/orchestrator-api/src/scheduleWorker.ts]
   - Planned evidence: `04-01-PLAN.md` requires scheduler docs to name `apps/orchestrator-api/src/routes/schedules.ts`, `apps/orchestrator-api/src/schedules.ts`, `apps/orchestrator-api/src/scheduleQueue.ts`, `apps/orchestrator-api/src/scheduleWorker.ts`, `apps/orchestrator-api/src/routes/schedules.test.ts`, and `apps/orchestrator-api/src/scheduleWorker.test.ts`.

2. **Plane label IDs remain owned by migration and env owner docs.**
   - Decision: Keep the detailed ID map in `docs/runbooks/plane-migration-2026-06-20.md`; current docs name label meanings and point to env/migration docs instead of duplicating mutable IDs.
   - Rationale: IDs are deployment-owned runtime data, while env variables own runtime configuration. [VERIFIED: docs/runbooks/plane-migration-2026-06-20.md; apps/orchestrator-api/src/env.ts]
   - Planned evidence: `04-02-PLAN.md` requires static checks for `docs/runbooks/plane-migration-2026-06-20.md`, `.env.example` owner links, and `docs/runbooks/secrets.md`.

3. **Verification uses focused Vitest plus static owner checks.**
   - Decision: Use existing focused Vitest coverage for runtime behavior and direct static checks for ownership references in current docs.
   - Rationale: Most behavior already has focused tests; this phase also needs proof that Mission Control, eval harness, artifact store, Plane label owner, agent-key owner, runner/artifact path owner, and env/secrets owner are named in the docs. [VERIFIED: test inventory; 04-CONTEXT.md]
   - Planned evidence: `04-01-PLAN.md` and `04-02-PLAN.md` require direct `rtk rg -q` checks for `routes/admin.ts`, `runEval.ts`, `artifacts.ts`, `routes/artifacts.ts`, `apps/orchestrator-api/src/agents.ts`, `docs/runbooks/plane-migration-2026-06-20.md`, `.env.example`, `RUNNER_ARTIFACTS_DIR`, and `docs/runbooks/secrets.md`.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| `rtk` | Project command wrapper | yes | 0.42.4 | none needed |
| Node.js | TypeScript/Vitest tooling | yes | v22.22.3 | none needed |
| Corepack | pnpm invocation | yes | 0.34.6 | none needed |
| pnpm | Monorepo scripts | yes | 11.5.2 | none needed |
| git | diff/status/commit | yes | 2.39.5 | none needed |
| ripgrep | code research | yes | 15.1.0 | `grep` fallback if unavailable |

**Missing dependencies with no fallback:**
- None found. [VERIFIED: local version commands]

**Missing dependencies with fallback:**
- None found. [VERIFIED: local version commands]

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest `^3.2.0` [VERIFIED: package.json] |
| Config file | `vitest.config.ts` [VERIFIED: vitest.config.ts] |
| Quick run command | `rtk corepack pnpm vitest run apps/orchestrator-api/src/workflows.test.ts apps/orchestrator-api/src/worker.test.ts apps/orchestrator-api/src/routes/webhooks.test.ts` |
| Full suite command | `rtk corepack pnpm verify` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| FLOW-01 | Plane intake creates/resumes/cancels runs and delivery flow reaches PR/report surfaces | unit/characterization | `rtk corepack pnpm vitest run apps/orchestrator-api/src/routes/webhooks.test.ts apps/orchestrator-api/src/runs.test.ts apps/orchestrator-api/src/queue.test.ts apps/orchestrator-api/src/worker.test.ts packages/graph/src/nodes/report.test.ts packages/graph/src/nodes/merging.test.ts` | yes [VERIFIED: test inventory] |
| FLOW-02 | `workflow:landing-page` starts collector, saves research, starts landing continuation, and formats context | unit/characterization | `rtk corepack pnpm vitest run apps/orchestrator-api/src/workflows.test.ts apps/orchestrator-api/src/worker.test.ts apps/orchestrator-api/src/missionScenarios.test.ts apps/orchestrator-api/src/missionTimeline.test.ts packages/graph/src/nodes/coder.test.ts apps/worker-code/src/executor/agentSkills.test.ts` | yes [VERIFIED: test inventory] |
| FLOW-03 | Scheduler, Mission Control, eval harness, registry/skills, and artifacts have owned surfaces | unit/docs verification | `rtk corepack pnpm vitest run apps/orchestrator-api/src/scheduleWorker.test.ts apps/orchestrator-api/src/routes/schedules.test.ts apps/orchestrator-api/src/routes/admin.test.ts apps/orchestrator-api/src/artifacts.test.ts apps/orchestrator-api/src/routes/artifacts.test.ts apps/worker-code/src/eval/runEval.test.ts apps/worker-code/src/eval/roleQuality.test.ts apps/worker-code/src/executor/agentSkills.test.ts` | yes [VERIFIED: test inventory] |
| FLOW-04 | Workflow labels, agent keys, skills, and model aliases have named source owners | unit/static docs verification | `rtk corepack pnpm vitest run apps/orchestrator-api/src/agents.test.ts apps/orchestrator-api/src/workflows.test.ts apps/worker-code/src/executor/agentSkills.test.ts apps/worker-code/src/executor/codegen.test.ts packages/graph/src/roleModels.test.ts packages/llm/src/cost.test.ts` | yes [VERIFIED: test inventory] |

### Sampling Rate

- **Per task commit:** Run the focused command for the touched surface, plus `rtk corepack pnpm exec biome check <changed-docs> --no-errors-on-unmatched` for docs-only edits. [VERIFIED: package.json; docs/runbooks/mission-control.md]
- **Per wave merge:** `rtk corepack pnpm verify:loop` if code/tests changed; docs-only can use focused Vitest plus Biome check. [VERIFIED: package.json]
- **Phase gate:** `rtk corepack pnpm verify` before claiming Phase 4 complete. [VERIFIED: .planning/PROJECT.md; package.json]

### Wave 0 Gaps

- [ ] `docs/runbooks/scheduler.md` - covers FLOW-03 scheduler ownership/runbook gap. [VERIFIED: docs/runbooks/README.md]
- [ ] Static docs verification step in plan - grep current docs for required owner links and current-vs-historical terminology. [VERIFIED: 04-CONTEXT.md]
- Test framework install: none needed. [VERIFIED: package.json; vitest.config.ts]

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | yes | Admin/schedules/worker job routes use bearer token checks against `RUNNER_AUTH_TOKEN`; Phase 4 should not broaden access. [VERIFIED: apps/orchestrator-api/src/routes/admin.ts; apps/orchestrator-api/src/routes/schedules.ts; apps/worker-code/src/routes/jobs.ts] |
| V3 Session Management | no | There is no browser session model in this phase; admin access is bearer-token protected. [VERIFIED: apps/orchestrator-api/src/routes/admin.ts] |
| V4 Access Control | yes | Admin routes require bearer auth; public Funnel should expose only `/webhooks/plane`. [VERIFIED: apps/orchestrator-api/src/routes/admin.ts; docs/runbooks/webhook-tailscale.md] |
| V5 Input Validation | yes | Zod validates env/job/agent payloads; cron validation protects schedules; webhook handlers validate signature and label transitions. [VERIFIED: apps/worker-code/src/types.ts; apps/orchestrator-api/src/routes/schedules.ts; apps/orchestrator-api/src/routes/webhooks.ts] |
| V6 Cryptography | yes | Plane and Linear webhook HMAC verification uses `createHmac` plus `timingSafeEqual`; do not replace or hand-roll. [VERIFIED: apps/orchestrator-api/src/routes/webhooks.ts] |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Public webhook spoofing | Spoofing/Tampering | HMAC signature validation and production requirement for `PLANE_WEBHOOK_SECRET`. [VERIFIED: apps/orchestrator-api/src/routes/webhooks.ts; apps/orchestrator-api/src/env.ts] |
| Accidental public exposure of admin/approval routes | Elevation of Privilege | Tailscale Funnel scoped only to `/webhooks/plane`; bearer auth on admin/schedule routes. [VERIFIED: docs/runbooks/webhook-tailscale.md; apps/orchestrator-api/src/routes/admin.ts] |
| Secret leakage in docs or research artifacts | Information Disclosure | Docs should point to env/secrets runbook and avoid copying secret values. [VERIFIED: docs/runbooks/secrets.md; apps/orchestrator-api/src/env.ts] |
| Unsafe scraping scope in research-to-landing | Information Disclosure/Tampering | Data collector docs and worker env enforce public/explicit URL policy and provider limits. [VERIFIED: docs/runbooks/data-collector-agent.md; apps/worker-code/src/env.ts] |
| Unauthorized skill/package execution | Elevation of Privilege | Use repo-local reviewed skills and no package installs in Phase 4. [VERIFIED: docs/runbooks/agent-skills.md; agent-skills/registry.json] |

## Sources

### Primary (HIGH confidence)

- `.planning/PROJECT.md` - milestone constraints and non-negotiables.
- `.planning/REQUIREMENTS.md` - FLOW-01 through FLOW-04.
- `.planning/ROADMAP.md` - Phase 4 scope and two-plan split.
- `.planning/phases/04-operational-flow-reorganization/04-CONTEXT.md` - locked decisions and deferred ideas.
- `.planning/phases/03-plane-only-provider-cutover/03-05-SUMMARY.md` - Phase 3 provider cutover status and verification.
- `docs/README.md`, `docs/CURRENT.md`, `docs/HISTORICAL.md`, `docs/ARCHITECTURE.md` - documentation control layer and current flow.
- `docs/runbooks/*.md` - active runbook inventory and current gaps.
- `apps/orchestrator-api/src/**` - Plane intake, runs, queues, scheduler, Mission Control, artifacts, agents, env.
- `apps/worker-code/src/**` - worker jobs, run execution, skill injection, eval harness, env.
- `packages/graph/src/**`, `packages/llm/src/**` - graph topology, roles, reports, model aliases.
- `agent-skills/registry.json` and `agent-skills/**/SKILL.md` - local skill registry and contracts.

### Secondary (MEDIUM confidence)

- None used; no web or external documentation lookup was needed for this codebase-only research.

### Tertiary (LOW confidence)

- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - verified from package manifests and local config.
- Architecture: HIGH - verified from source files and tests.
- Pitfalls: HIGH - derived from locked context plus code/test/doc evidence.

**Research date:** 2026-07-02
**Valid until:** 2026-08-01, or earlier if Phase 5/6 refactors move route/worker/eval ownership.
