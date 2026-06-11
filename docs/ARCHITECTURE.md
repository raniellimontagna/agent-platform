# Arquitetura — visão completa

Mapa único do sistema: o que está no ar, o fluxo ponta a ponta, e como cada
card do Linear (projeto **Orquestrador de Agentes com LangGraph**, time `MAC`)
se encaixa na estrutura. Serve para validar o todo antes de seguir.

> Estado em 2026-06-11. Legenda: ✅ feito · 🏗 no ar/parcial · ⏳ pendente.

---

## 1. Topologia de deploy (infra)

```mermaid
flowchart TB
  subgraph LAN["LAN 192.168.0.x — vmbr0 (doméstica)"]
    PIHOLE["Pi-hole DNS<br/>.14"]
  end

  subgraph AGENT["agent-platform 10.10.0.x — vmbr1 (isolada, NAT via host)"]
    GW["agent-gateway · .10 · LXC 200<br/>LiteLLM :4000 · Caddy · OmniRoute :20128 · Postgres"]
    ORCH["agent-orchestrator · .11 · LXC 201<br/>API Hono :3000 · LangGraph · Postgres · Redis/BullMQ"]
    RUN["agent-runners · .12 · VM 202<br/>worker-code :8080 · git worktrees · sandbox"]
    OBS["agent-observability · .13 · LXC 203<br/>Grafana :3000 · Prometheus · Loki · Promtail"]
  end

  LINEAR["Linear (cloud)"]
  GH["GitHub"]
  SUBS["Claude Max / ChatGPT<br/>(assinaturas via OAuth)"]

  LINEAR -->|"webhook (label ai-ready)"| ORCH
  ORCH -->|"job HTTP"| RUN
  ORCH -->|"aliases LLM"| GW
  RUN -->|"aliases LLM"| GW
  GW -->|"OAuth"| SUBS
  ORCH -->|"branch · PR · comentários"| GH
  ORCH -->|"status · comentários"| LINEAR
  ORCH -.métricas/logs.-> OBS
  RUN -.métricas/logs.-> OBS
  GW -.métricas/logs.-> OBS
```

**Estado da infra (Fase 1):** as 4 VMs provisionadas e no ar. Deploy: observability
✅ e runners ✅ rodando; gateway e orchestrator ⏳ aguardando secrets/OAuth.

---

## 2. Fluxo ponta a ponta (DoD do projeto)

```mermaid
flowchart TD
  A["Issue recebe label <b>ai-ready</b>"] -->|webhook| B["Webhook Linear<br/>MAC-19"]
  B --> C["Dispara fluxo ai-ready<br/>MAC-20"]
  C --> D["State Machine<br/>MAC-14"]
  D --> E["Planner Agent gera plano<br/>MAC-16"]
  E --> F["Reporter comenta plano no Linear<br/>MAC-21"]
  F --> G{"Human Approval Node<br/>MAC-22"}
  G -->|aprovado| H["Branch Manager cria branch<br/>MAC-25"]
  G -->|reprovado| Z["Encerra / aguarda"]
  H --> I["Worktree Manager<br/>MAC-27"]
  I --> J["Coder Agent altera código<br/>MAC-17"]
  J --> K["Sandbox Executor<br/>MAC-28"]
  K --> L["Test Runner<br/>MAC-29"]
  L --> M["Reviewer Agent revisa diff<br/>MAC-18"]
  M --> N["PR Creator abre Draft PR<br/>MAC-26"]
  N --> O["Reporter comenta resultado no Linear<br/>MAC-21"]
  O --> P["Merge e deploy MANUAIS (MVP)"]
```

Atravessando tudo: **Context Builder** (MAC-24), **Memory Layer** (MAC-23),
**Retry Engine** (MAC-33), **Workflow Persistence** (MAC-34) e o gateway de
modelos (Fase 2).

---

## 3. Componente → card → código

| Componente | Card(s) | Local no repo | Estado |
|---|---|---|---|
| Decisões/ADRs | MAC-6 | `docs/decisions/` | ✅ |
| Infra Proxmox (4 VMs, rede, deploy) | MAC-8/9/10/11 | `infra/proxmox/`, `infra/deploy/` | no ar; deploy parcial |
| LiteLLM Gateway | MAC-12 | `infra/compose/gateway/` | config pronta; ⏳ deploy |
| Provider LLM (OmniRoute/OAuth) | MAC-13¹ | `infra/compose/gateway/` + ADR-0006 | config pronta; ⏳ OAuth |
| Budgets / Rate limits | MAC-15 | LiteLLM config (a expandir) | ⏳ |
| API + Webhook Linear | MAC-19 | `apps/orchestrator-api/src/routes/webhooks.ts` | esqueleto ✅ |
| Fluxo ai-ready | MAC-20 | `apps/orchestrator-api` (enfileirar) | ⏳ stub |
| State Machine | MAC-14 | `packages/graph` + schema `runs/run_steps` | schema ✅; grafo ⏳ |
| Planner / Coder / Reviewer / Reporter | MAC-16/17/18/21 | `packages/agents` | ⏳ |
| Human Approval Node | MAC-22 | `packages/graph` + tabela `approvals` | schema ✅; nó ⏳ |
| Context Builder / Memory | MAC-24/23 | `packages/memory`, `packages/linear`, `packages/github` | ⏳ |
| Retry / Persistence | MAC-33/34 | `packages/graph` (checkpointer LangGraph) | ⏳ |
| Branch / PR / Worktree | MAC-25/26/27 | `packages/github`, `apps/worker-code/src/executor/worktree.ts` | worktree ✅; resto ⏳ |
| Sandbox Executor / Test Runner | MAC-28/29 | `apps/worker-code` | executor ✅; testes parcial |
| Observabilidade (painéis, registro) | MAC-35/36 | `infra/compose/observability/` | stack no ar; dashboards ⏳ |
| Segurança (vault, allowlist, kill switch) | MAC-30/31/32 | `packages/policy` | ⏳ |
| Runtime (queue, scheduler, workers, cost, approval) | MAC-37/38/39/40/41 | `apps/orchestrator-api`, `packages/policy` | ⏳ |
| Escala (registries, artifacts, vector, MCP, multiagente) | MAC-42..47 | `packages/*`, `apps/*` | ⏳ |

¹ MAC-13 era "Integrar Verboo" — **substituído por OmniRoute/OAuth** (ver §5).

---

## 4. Roadmap por fase

| Fase | Milestone | Cards | Alvo | Estado |
|---|---|---|---|---|
| 0 | Fundação e decisões | MAC-6 | 16/06 | ✅ |
| 1 | Infra Proxmox e rede | MAC-8/9/10/11 (+MAC-7¹) | 23/06 | 🏗 no ar; deploy parcial |
| 2 | Gateway LiteLLM e provedores | MAC-12/13/15 | 30/06 | 🏗 config pronta; deploy ⏳ |
| 3 | Orquestrador LangGraph | MAC-14/16/17/18/21/22/23/24/33/34 | 10/07 | ⏳ |
| 4 | Linear, GitHub e Code Runner | MAC-19/20/25/26/27/28/29 | 20/07 | 🏗 worker-code base ✅ |
| 5 | Segurança e Observabilidade | MAC-30/31/32/35/36 | 10/08 | 🏗 stack obs no ar |
| 6 | Runtime e Governança | MAC-37/38/39/40/41 | 24/08 | ⏳ |
| 7 | Produção e Escala | MAC-42/43/44/45/46/47 | 07/09 | ⏳ |

¹ MAC-7 e MAC-8 têm o mesmo título "Provisionar VM Gateway" (ver §5).

---

## 5. Divergências a validar (evitar surpresa)

1. **MAC-7 duplicado.** MAC-7 e MAC-8 são ambos "Provisionar VM Gateway". MAC-8 é
   o card detalhado que usamos; MAC-7 é stub. **Sugestão:** cancelar MAC-7.

2. **MAC-13 Verboo → OmniRoute.** O ADR-0006 trocou o backend de Verboo (API paga)
   por OmniRoute com OAuth das assinaturas. **Sugestão:** renomear MAC-13 para
   "Integrar OmniRoute (OAuth)" ou cancelar e abrir card novo.

3. **Fase 4 antecipada.** O `worker-code` (MAC-27/28/29) já tem base pronta na
   Fase 1, porque o deploy dos runners precisava de um app. Cards continuam na
   Fase 4 — só registrar que a base já existe.

4. **Postgres do orchestrator vs Memory Layer.** Schema `runs/run_steps/approvals`
   (MAC-14/22) já existe em `apps/orchestrator-api`. MAC-23 (Memory Layer) é
   camada separada; confirmar fronteira entre os dois.

---

Fluxo detalhado do agente: [`decisions/FLOW-agent-workflow.md`](./decisions/FLOW-agent-workflow.md).
ADRs: [`decisions/`](./decisions/). Estado vivo da infra: [`runbooks/proxmox-estado-atual.md`](./runbooks/proxmox-estado-atual.md).
