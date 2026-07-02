# Runbooks

Use this index by operator task. Some older files are validation records rather
than repeatable runbooks; those are marked historical in `../HISTORICAL.md`.

## Operate Plane-First Flows

- [webhook-tailscale](webhook-tailscale.md) — expose and validate Plane webhook
  paths through Tailscale Funnel.
- [research-to-landing-workflow](research-to-landing-workflow.md) — launch and
  validate the composed research-to-landing workflow from Plane.
- [mission-control](mission-control.md) — inspect supported E2E scenarios and
  recent mission state.
- [landing-page-agent](landing-page-agent.md) — use the landing-page agent flow.
- [data-collector-agent](data-collector-agent.md) — use research/data collection
  flow.

## Source Owners

Use this map when a runbook needs a mutable label, key, model, env var, runner
path, or artifact path. Do not duplicate live IDs or secrets in task runbooks.

| Need | Owner |
|------|-------|
| Workflow label names and persisted workflow IDs | `apps/orchestrator-api/src/workflows.ts` |
| Plane label IDs and migration evidence | `docs/runbooks/plane-migration-2026-06-20.md`, `apps/orchestrator-api/.env.example` |
| Agent keys and software delivery pipeline role names | `apps/orchestrator-api/src/agents.ts` |
| Skill registry bundles | `agent-skills/registry.json`, `docs/runbooks/agent-skills.md` |
| Model aliases and role defaults | `packages/llm/src/index.ts`, `packages/graph/src/roleModels.ts` |
| Runner workdir/artifact env paths | `apps/worker-code/.env.example`, `RUNNER_ARTIFACTS_DIR` |
| Stored artifacts and artifact read routes | `apps/orchestrator-api/src/artifacts.ts`, `apps/orchestrator-api/src/routes/artifacts.ts` |
| Env and secret rotation | `docs/runbooks/secrets.md` |

## Verify And Debug

- [eval-harness](eval-harness.md) — run deterministic worker evals.
- [agent-skills](agent-skills.md) — inspect and maintain local agent skills.
- [sandbox-docker-e2e](sandbox-docker-e2e.md) — validate Docker sandbox behavior.
- [litellm-guardrails](litellm-guardrails.md) — inspect LLM gateway budgets and
  rate limits.

## Infrastructure

- [proxmox-estado-atual](proxmox-estado-atual.md) — current Proxmox state and
  gotchas.
- [proxmox-setup](proxmox-setup.md) — provision Proxmox VMs.
- [grafana-lan-access](grafana-lan-access.md) — access Grafana from LAN.
- [mcp-server](mcp-server.md) — operate the MCP facade.
- [mcp-proxmox](mcp-proxmox.md) — Proxmox MCP notes.
- [omniroute-access](omniroute-access.md) — OmniRoute access notes.
- [secrets](secrets.md) — env and secret inventory.

## Historical Or Narrow Validation Records

See [Historical Documentation Index](../HISTORICAL.md) before using dated E2E
records as current instructions.
