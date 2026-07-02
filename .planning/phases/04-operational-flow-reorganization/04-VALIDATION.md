---
phase: 04
slug: operational-flow-reorganization
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-02
---

# Phase 04 - Validation Strategy

Per-phase validation contract for Operational Flow Reorganization. The goal is
to keep feedback close to each documentation and test-backed ownership change,
then prove every FLOW requirement with concrete Vitest and static evidence.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest `^3.2.0` |
| **Config file** | `vitest.config.ts` |
| **Quick flow command** | `rtk corepack pnpm vitest run apps/orchestrator-api/src/routes/webhooks.test.ts apps/orchestrator-api/src/worker.test.ts apps/orchestrator-api/src/workflows.test.ts apps/worker-code/src/executor/runJob.test.ts` |
| **Quick ownership command** | `rtk corepack pnpm vitest run apps/orchestrator-api/src/routes/admin.test.ts apps/orchestrator-api/src/artifacts.test.ts apps/orchestrator-api/src/routes/artifacts.test.ts apps/worker-code/src/eval/runEval.test.ts apps/worker-code/src/executor/agentSkills.test.ts` |
| **Static ownership command** | `rtk rg -q "<owner path>" <changed docs>` |
| **Full suite command** | `rtk corepack pnpm verify` |

---

## FLOW Goal Evidence Map

| Requirement | Goal Truth | Primary Evidence | Static Evidence |
|-------------|------------|------------------|-----------------|
| FLOW-01 | Main delivery flow is documented and tested as Plane -> run -> approval -> worker -> review -> PR -> report. | `rtk corepack pnpm vitest run apps/orchestrator-api/src/routes/webhooks.test.ts apps/orchestrator-api/src/runs.test.ts apps/orchestrator-api/src/queue.test.ts apps/orchestrator-api/src/worker.test.ts apps/worker-code/src/executor/runJob.test.ts packages/graph/src/nodes/report.test.ts packages/graph/src/nodes/merging.test.ts` | Docs must name `apps/orchestrator-api/src/routes/webhooks.ts`, `apps/orchestrator-api/src/runs.ts`, `apps/orchestrator-api/src/queue.ts`, `apps/orchestrator-api/src/worker.ts`, `apps/worker-code/src/routes/jobs.ts`, `apps/worker-code/src/executor/runJob.ts`, `apps/worker-code/src/executor/runJob.test.ts`, `packages/graph/src/nodes/report.ts`, and `packages/graph/src/nodes/merging.ts`. |
| FLOW-02 | Research-to-landing continuation is documented and tested as a separate composed workflow. | `rtk corepack pnpm vitest run apps/orchestrator-api/src/workflows.test.ts apps/orchestrator-api/src/worker.test.ts apps/orchestrator-api/src/missionScenarios.test.ts apps/orchestrator-api/src/missionTimeline.test.ts packages/graph/src/nodes/coder.test.ts apps/worker-code/src/executor/agentSkills.test.ts` | Docs must name `apps/orchestrator-api/src/workflows.ts`, `apps/orchestrator-api/src/worker.ts`, `apps/worker-code/src/executor/runJob.ts`, and the `workflow:landing-page` trigger. |
| FLOW-03 | Scheduler, Mission Control, eval harness, registry, skills, and artifact store have clear ownership and active runbooks. | `rtk corepack pnpm vitest run apps/orchestrator-api/src/scheduleWorker.test.ts apps/orchestrator-api/src/routes/schedules.test.ts apps/orchestrator-api/src/routes/admin.test.ts apps/orchestrator-api/src/artifacts.test.ts apps/orchestrator-api/src/routes/artifacts.test.ts apps/worker-code/src/eval/runEval.test.ts apps/worker-code/src/eval/roleQuality.test.ts apps/worker-code/src/executor/agentSkills.test.ts` | Docs must name `docs/runbooks/scheduler.md`, `apps/orchestrator-api/src/routes/admin.ts`, `apps/worker-code/src/eval/runEval.ts`, `apps/orchestrator-api/src/artifacts.ts`, `apps/orchestrator-api/src/routes/artifacts.ts`, and `agent-skills/registry.json`. |
| FLOW-04 | Workflow labels, agent keys, skills, model aliases, labels, and runner/artifact paths have one canonical source. | `rtk corepack pnpm vitest run apps/orchestrator-api/src/agents.test.ts apps/orchestrator-api/src/workflows.test.ts apps/worker-code/src/executor/agentSkills.test.ts packages/graph/src/roleModels.test.ts packages/llm/src/cost.test.ts` | Docs must name `apps/orchestrator-api/src/workflows.ts`, `docs/runbooks/plane-migration-2026-06-20.md`, `apps/orchestrator-api/src/agents.ts`, `agent-skills/registry.json`, `packages/llm/src/index.ts`, `packages/graph/src/roleModels.ts`, `apps/worker-code/.env.example`, `RUNNER_ARTIFACTS_DIR`, and `docs/runbooks/secrets.md`. |

---

## Per-Plan Verification Map

| Plan | Wave | Requirements | Evidence Contract | Required Static Checks |
|------|------|--------------|-------------------|------------------------|
| 04-01 | 1 | FLOW-01, FLOW-02, FLOW-03 | Focused flow, scheduler, Mission Control, artifact, eval, and skill tests plus Biome docs check. | Main flow docs reference `apps/worker-code/src/routes/jobs.ts`, `apps/worker-code/src/executor/runJob.ts`, and `apps/worker-code/src/executor/runJob.test.ts`; Mission Control docs reference `routes/admin.ts`; eval docs reference `runEval.ts`; artifact docs reference `artifacts.ts` and `routes/artifacts.ts`; scheduler docs reference `scheduleWorker.test.ts`. |
| 04-02 | 2 | FLOW-03, FLOW-04 | Focused source-owner tests, registry compatibility checks, Biome docs check, and final `rtk corepack pnpm verify`. | Current docs reference Plane label owner docs, `agents.ts`, `.env.example`, `RUNNER_ARTIFACTS_DIR`, `docs/runbooks/secrets.md`, `artifacts.ts`, and `routes/artifacts.ts`. |

---

## Nyquist Sampling Rules

- **After each docs task:** Run the task's Biome docs command and the static
  owner checks for the files touched by that task.
- **After each behavior or registry task:** Run the focused Vitest command
  listed in the task verify block.
- **No three consecutive tasks without automated feedback:** Plans 04-01 and
  04-02 each include automated verification on every task.
- **Static checks are first-class evidence:** FLOW-03 and FLOW-04 are not
  satisfied by Vitest alone because the phase goal is explicit ownership in
  living docs. The plan-level static checks prove the named owners are present.
- **Phase closeout:** Run `rtk corepack pnpm verify` before claiming Phase 4
  complete, after both plan summaries exist.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Production public exposure remains Plane-only | FLOW-01, FLOW-03 | Local repo cannot inspect live Tailscale Funnel or provider dashboards safely. | Operator checks deployed Funnel/provider settings against `docs/runbooks/webhook-tailscale.md`; no Phase 4 plan requires changing live exposure. |
| Live Plane label IDs match workspace state | FLOW-04 | Label IDs are deployment data owned outside local tests. | Operator compares current Plane workspace labels against `docs/runbooks/plane-migration-2026-06-20.md` and env owner docs when rotating labels. |
| Secrets are not copied into docs | FLOW-03, FLOW-04 | Local static checks can prove owner links, not absence from every external system. | Review changed docs for secret values; docs should point to `.env.example` files and `docs/runbooks/secrets.md`. |

---

## Validation Sign-Off

- [ ] `04-01-PLAN.md` validates with plan frontmatter and plan-structure checks.
- [ ] `04-02-PLAN.md` validates with plan frontmatter and plan-structure checks.
- [ ] `04-VALIDATION.md` exists and maps FLOW-01 through FLOW-04 to automated evidence.
- [ ] FLOW-03 static gates cover Mission Control, eval harness, artifact store, registry/skills, and scheduler surfaces.
- [ ] FLOW-04 static gates cover Plane label owner, agent-key owner, skill registry owner, model alias owner, runner/artifact path owner, and env/secrets owner.
- [ ] FLOW-01 static gates cover worker-code API route and runner ownership.
- [ ] No plan requires live external Plane/GitHub E2E execution for docs-only alignment.

**Approval:** pending
