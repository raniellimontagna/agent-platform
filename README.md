# agent-platform

Orquestrador de agentes self-hosted. Issues do Linear com label `ai-ready` disparam um fluxo autônomo: leitura de contexto → plano → aprovação humana → branch → código → testes → PR.

## Stack

| Camada | Tecnologia |
|---|---|
| API / Orquestrador | TypeScript + Node LTS + Hono + LangGraph JS/TS |
| Banco / Fila | Postgres + Redis + BullMQ |
| LLM Gateway | LiteLLM (aliases: `cheap_fast`, `strong_coder`, `critic`, `research`) |
| Infra | Proxmox — 4 VMs na subnet `<agent-subnet>` (vmbr1) |
| Observabilidade | Grafana + Prometheus + Loki |
| Acesso externo | Tailscale |

## Arquitetura

```
Linear (ai-ready) → Orchestrator API → agent-runners (sandbox)
                                     ↓
                              LiteLLM Gateway
                                     ↓
                          Verboo / Claude / OpenAI
```

Fluxo completo: [`docs/decisions/FLOW-agent-workflow.md`](docs/decisions/FLOW-agent-workflow.md)

## VMs

| CTID/VMID | Hostname | IP | Tipo | Papel |
|---|---|---|---|---|
| 200 | agent-gateway | `<agent-gateway-ip>` | LXC | LiteLLM + Caddy |
| 201 | agent-orchestrator | `<agent-orchestrator-ip>` | LXC | API + LangGraph + Postgres + Redis |
| 202 | agent-runners | `<agent-runners-ip>` | VM | Execução isolada de código |
| 203 | agent-observability | `<agent-observability-ip>` | LXC | Grafana + Prometheus + Loki |

Rede `<agent-subnet>` isolada da LAN doméstica via `vmbr1` (bridge interna Proxmox com NAT).

## Setup rápido

```bash
# No host Proxmox
git clone https://github.com/raniellimontagna/agent-platform
cd agent-platform

# 1. Editar IPs/IDs conforme seu ambiente
nano infra/proxmox/config.sh

# 2. Criar bridge vmbr1 e configurar NAT
bash infra/proxmox/setup-network.sh

# 3. Provisionar as 4 VMs
bash infra/proxmox/provision-all.sh
```

Guia completo: [`docs/runbooks/proxmox-setup.md`](docs/runbooks/proxmox-setup.md)

## Estrutura

```
agent-platform/
  apps/
    orchestrator-api/     # API Hono + LangGraph
    worker-code/          # Executor de código (sandbox)
    worker-reviewer/      # Revisor de diff
    dashboard/            # UI de controle
  packages/
    agents/               # Agentes LangGraph
    graph/                # State machines
    llm/                  # Cliente LiteLLM
    linear/               # Integração Linear
    github/               # Integração GitHub
    memory/               # Memória dos agentes
    tools/                # Ferramentas disponíveis
    policy/               # Políticas de aprovação/custo
    shared/               # Tipos e utilitários
  infra/
    proxmox/              # Scripts de provisionamento
    compose/              # Docker Compose por VM
  docs/
    decisions/            # ADRs + fluxos
    runbooks/             # Guias operacionais
```

## ADRs

- [ADR-0001](docs/decisions/ADR-0001-stack-typescript-hono-drizzle.md) — Stack TypeScript/Hono/Drizzle
- [ADR-0002](docs/decisions/ADR-0002-infra-proxmox-4-vms.md) — Infra Proxmox 4 VMs
- [ADR-0003](docs/decisions/ADR-0003-llm-gateway-litellm-model-aliases.md) — LiteLLM + model aliases
- [ADR-0004](docs/decisions/ADR-0004-security-tailscale-env-human-approval.md) — Segurança + aprovação humana
- [ADR-0005](docs/decisions/ADR-0005-linear-github-agent-workflow.md) — Workflow Linear + GitHub
