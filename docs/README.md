# Documentation Map

This directory has both living operator documentation and historical planning
records. Use this map first; do not treat every dated plan as current guidance.

## Current Docs

- [Current State](CURRENT.md) — current architecture, active flows, providers,
  verification gates, and ownership boundaries.
- [Architecture](ARCHITECTURE.md) — detailed topology and system flow.
- [Agent Workflow](decisions/FLOW-agent-workflow.md) — Plane-first agent flow.
- [Runbooks](runbooks/README.md) — operator tasks grouped by what you need to do.

## Historical Records

- [Historical Index](HISTORICAL.md) — dated plans, specs, migration records,
  and Linear-first context retained for auditability.
- [Superpowers Archive](superpowers/README.md) — implementation plans/specs
  created during earlier build phases.
- [ADR-0005](decisions/ADR-0005-linear-github-agent-workflow.md) — historical
  Linear-first workflow; Plane is current.

## Source Of Truth

| Topic | Canonical Owner |
|-------|-----------------|
| Project rules, commit style, RTK | `CLAUDE.md` |
| Agent-facing pointer | `AGENTS.md` |
| System overview | `README.md`, `docs/CURRENT.md` |
| Detailed topology | `docs/ARCHITECTURE.md` |
| Active Plane intake and webhook exposure | `docs/runbooks/webhook-tailscale.md`, `apps/orchestrator-api/src/routes/webhooks.ts` |
| Workflow labels and persisted workflow names | `apps/orchestrator-api/src/workflows.ts` |
| Plane label IDs and migration evidence | `docs/runbooks/plane-migration-2026-06-20.md`, `apps/orchestrator-api/.env.example` |
| Agent keys and software delivery pipeline roles | `apps/orchestrator-api/src/agents.ts` |
| Skill bundles and local reviewed skill metadata | `agent-skills/registry.json` |
| Skill loading behavior | `apps/worker-code/src/executor/agentSkills.ts` |
| Model aliases and role defaults | `packages/llm/src/index.ts`, `packages/graph/src/roleModels.ts` |
| Runner paths and generated runner artifacts | `apps/worker-code/.env.example`, `RUNNER_ARTIFACTS_DIR`, `apps/worker-code/src/executor/runJob.ts` |
| Stored run artifacts and artifact read API | `apps/orchestrator-api/src/artifacts.ts`, `apps/orchestrator-api/src/routes/artifacts.ts` |
| Env and secrets handling | `apps/orchestrator-api/.env.example`, `apps/worker-code/.env.example`, `docs/runbooks/secrets.md` |
| Research-to-landing workflow | `docs/runbooks/research-to-landing-workflow.md` |
| Eval verification | `docs/runbooks/eval-harness.md`, `apps/worker-code/src/eval/runEval.ts` |
| Agent skills runbook | `docs/runbooks/agent-skills.md` |
| Historical implementation plans | `docs/HISTORICAL.md`, `docs/superpowers/**` |

## Status Labels

- **Current:** safe to use as operator or maintainer guidance.
- **Legacy:** still relevant for compatibility or old data, but not the default.
- **Historical:** retained for audit/history; do not use as implementation
  guidance without checking current docs.
- **Migration record:** describes a one-time transition and its evidence.
