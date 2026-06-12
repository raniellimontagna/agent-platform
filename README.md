# agent-platform

Orquestrador de agentes self-hosted. Issues do Linear com label `ai-ready` disparam um fluxo autônomo: leitura de contexto → plano → aprovação humana → branch → código → **validação + auto-correção** → revisão → Draft PR.

O agente **aprende com as próprias falhas** (memória de lições por repo) e **se corrige dentro do run** quando a validação quebra, antes de abrir o PR. Governança embutida: kill switch, cost guard, políticas de aprovação. Observabilidade via Grafana (execuções, custo, qualidade, memória).

## Capacidades

- **Loop autônomo ponta a ponta** — webhook `ai-ready` → plano (LLM) → aprovação humana (label `approved`) → codegen com contexto → validação no sandbox → revisão (critic) → Draft PR → report consolidado no Linear.
- **Memory Layer (MAC-23)** — falhas (critic REPROVA / validação ❌) viram lições destiladas, guardadas por repo e reinjetadas no codegen de runs futuros.
- **Self-correction (MAC-54)** — valida antes de pushar; se falha, corrige e revalida até `AGENT_MAX_FIX_ATTEMPTS` (default 2).
- **Governança** — kill switch (Redis), cost guard (limite por run/24h), approval policies, retry + persistência de runs.
- **Observabilidade** — 3 dashboards Grafana: Execuções, Custo & Governança, Qualidade & Memória.

## Stack

| Camada | Tecnologia |
|---|---|
| API / Orquestrador | TypeScript + Node LTS + Hono + LangGraph JS/TS |
| Banco / Fila | Postgres + Redis + BullMQ |
| LLM Gateway | LiteLLM (aliases: `cheap_fast`, `research`, `strong_coder`, `heavy_coder`, `critic`) |
| Infra | Proxmox — 4 VMs na subnet `10.10.0.x` (vmbr1) |
| Observabilidade | Grafana + Prometheus + Loki |
| Acesso externo | Tailscale |

## Arquitetura

```
Linear (ai-ready) → Orchestrator API → agent-runners (sandbox)
                                     ↓
                              LiteLLM Gateway
                                     ↓
                       Verboo / OmniRoute combos
```

Visão completa (deploy + fluxo + mapa dos cards): [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
Fluxo detalhado do agente: [`docs/decisions/FLOW-agent-workflow.md`](docs/decisions/FLOW-agent-workflow.md)

## VMs

| CTID/VMID | Hostname | IP | Tipo | Papel |
|---|---|---|---|---|
| 200 | agent-gateway | `10.10.0.10` | LXC | LiteLLM + Caddy |
| 201 | agent-orchestrator | `10.10.0.11` | LXC | API + LangGraph + Postgres + Redis |
| 202 | agent-runners | `10.10.0.12` | VM | Execução isolada de código |
| 203 | agent-observability | `10.10.0.13` | LXC | Grafana + Prometheus + Loki |

Rede `10.10.0.x` isolada da LAN doméstica via `vmbr1` (bridge interna Proxmox com NAT).

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
- [ADR-0006](docs/decisions/ADR-0006-llm-via-omniroute-oauth.md) — LLM via OmniRoute (OAuth)

## Runbooks

- [proxmox-setup](docs/runbooks/proxmox-setup.md) — provisionamento das 4 VMs
- [proxmox-estado-atual](docs/runbooks/proxmox-estado-atual.md) — estado vivo da infra + gotchas
- [webhook-tailscale](docs/runbooks/webhook-tailscale.md) — webhook real do Linear via Tailscale Funnel
- [grafana-lan-access](docs/runbooks/grafana-lan-access.md) — acessar o Grafana pela LAN (sem ssh)
- [litellm-guardrails](docs/runbooks/litellm-guardrails.md) — budgets e rate limits do gateway
- [secrets](docs/runbooks/secrets.md) — inventário e rotação de secrets
