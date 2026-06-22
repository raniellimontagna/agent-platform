# agent-platform

Orquestrador de agentes self-hosted. Cards do Plane com label `ai-ready`
disparam um pipeline autônomo de entrega de software: leitura de contexto →
plano → aprovação humana → branch → código → **validação + auto-correção** →
revisão → Draft PR → auto-merge opt-in → report.

O agente **aprende com as próprias falhas** (memória de lições por repo, com **busca semântica**) e **se corrige dentro do run** quando a validação quebra, antes de abrir o PR. Governança embutida: kill switch, cost guard, políticas de aprovação. Observabilidade via Grafana (execuções, custo, qualidade, memória). Roda **vários runs em paralelo** com catálogos versionados de agentes e ferramentas.

## Capacidades

- **Loop autônomo ponta a ponta** — webhook `ai-ready` do provider primário → plano (LLM) → aprovação humana (label `approved`) → codegen com contexto → validação no sandbox → revisão (critic) → Draft PR → merge opt-in → report consolidado no provider de origem.
- **Pipeline com roles** — `coder-agent` permanece como chave compatível; o catálogo também expõe `software-delivery-pipeline` com roles `planner`, `coder`, `critic`, `pr` e `reporter` para deixar claro o papel de cada etapa sem dividir fisicamente o LangGraph.
- **Memory Layer (MAC-23/45)** — falhas (critic REPROVA / validação ❌) viram lições destiladas, guardadas por repo e reinjetadas no codegen de runs futuros. Recuperação por **relevância** (embeddings locais + pgvector, cosine), com fallback pra recência.
- **Self-correction (MAC-54)** — valida antes de pushar; se falha, corrige e revalida até `AGENT_MAX_FIX_ATTEMPTS` (default 2).
- **Loop de revisão (MAC-59)** — critic REPROVA / ressalva → o coder re-coda endereçando o parecer e re-revisa, até `AGENT_MAX_REVIEW_ROUNDS`.
- **Multi-Agent Execution (MAC-47)** — N runs em paralelo (`AGENT_MAX_CONCURRENCY`), coordenação à prova de race (índice único de issue ativa), observabilidade de concorrência.
- **Agent Registry (MAC-42) + Tool Registry (MAC-43)** — catálogos versionados (key/version) de pipelines/agentes (capabilities + roles) e ferramentas (risk + scopes), via REST + MCP; `agent_id` gravado por run.
- **Scheduler (MAC-38) + Worker Manager (MAC-39)** — agendamentos cron disparam runs (auto-aprovação sem motivo crítico); failover entre runners.
- **Artifact Store (MAC-44)** — plano/patch/review/validação/summary de cada run guardados de forma durável e consultável.
- **Governança** — kill switch (Redis), cost guard (limite por run/24h), approval policies, retry + persistência de runs.
- **Observabilidade** — dashboards Grafana (Execuções, Custo & Governança, Qualidade & Memória) + endpoints `/admin/*`.
- **MCP server (MAC-46)** — fachada stdio sobre a REST API: runs, lições, agentes, tools, concorrência, aprovações (read + ações), via Claude Code/qualquer cliente MCP.

## Stack

| Camada | Tecnologia |
|---|---|
| API / Orquestrador | TypeScript + Node LTS + Hono + LangGraph JS/TS |
| Banco / Fila | Postgres (+ **pgvector**) + Redis + BullMQ |
| Memória vetorial | Embeddings locais (Transformers.js, `all-MiniLM-L6-v2`, 384 dims, CPU) + pgvector |
| LLM Gateway | LiteLLM (aliases: `cheap_fast`, `research`, `strong_coder`, `heavy_coder`, `critic`) |
| Integração via MCP | `apps/mcp-server` (stdio, fachada da REST API) |
| Infra | Proxmox — 4 VMs na subnet `10.10.0.x` (vmbr1) |
| Observabilidade | Grafana + Prometheus + Loki |
| Acesso externo | Tailscale |

## Arquitetura

```
Plane (primary card provider) → Orchestrator API → agent-runners → GitHub PR/merge → Plane report
                                   ↓
                            LiteLLM Gateway
                                   ↓
                      Verboo / OmniRoute combos
```

Linear remains supported as an optional provider for legacy cards through `/webhooks/linear`.

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
    orchestrator-api/     # API Hono + LangGraph (+ registries, vector memory, scheduler)
    worker-code/          # Executor de código (sandbox + self-correction)
    mcp-server/           # Fachada MCP (stdio) sobre a REST API
  packages/
    cards/                # Abstração comum de providers de cards
    graph/                # State machines
    llm/                  # Cliente LiteLLM
    plane/                # Integração Plane (provider primário)
    linear/               # Integração Linear (legado opcional)
    github/               # Integração GitHub
    memory/               # Memória dos agentes
    policy/               # Políticas de aprovação/custo
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
- [ADR-0005](docs/decisions/ADR-0005-linear-github-agent-workflow.md) — Workflow Linear + GitHub (histórico; Plane-first hoje)
- [ADR-0006](docs/decisions/ADR-0006-llm-via-omniroute-oauth.md) — LLM via OmniRoute (OAuth)

## Runbooks

- [proxmox-setup](docs/runbooks/proxmox-setup.md) — provisionamento das 4 VMs
- [proxmox-estado-atual](docs/runbooks/proxmox-estado-atual.md) — estado vivo da infra + gotchas
- [webhook-tailscale](docs/runbooks/webhook-tailscale.md) — webhooks do Plane primário e Linear legado via Tailscale Funnel
- [grafana-lan-access](docs/runbooks/grafana-lan-access.md) — acessar o Grafana pela LAN (sem ssh)
- [litellm-guardrails](docs/runbooks/litellm-guardrails.md) — budgets e rate limits do gateway
- [secrets](docs/runbooks/secrets.md) — inventário e rotação de secrets
