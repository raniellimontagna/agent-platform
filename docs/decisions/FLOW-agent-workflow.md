# Fluxo do Agente — Visão Geral

```
┌─────────────────────────────────────────────────────────────────┐
│                           PLANE                                 │
│  Card + label [ai-ready]                                        │
└───────────────────────────┬─────────────────────────────────────┘
                            │ webhook
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                     ORCHESTRATOR API                            │
│  (agent-orchestrator / Hono + LangGraph)                        │
│                                                                 │
│  1. Lê card + contexto do Plane                                 │
│  2. Chama LiteLLM [research] → gera plano                       │
│  3. Comenta plano no Plane                                      │
│  4. ⏸ PAUSE — aguarda aprovação humana                          │
│  5. Cria branch: agent/{issue-id}-{slug}                        │
│  6. Envia tarefa para agent-runners                             │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                      AGENT RUNNERS                              │
│  (agent-runners / VM isolada)                                   │
│                                                                 │
│  7. Clona repo em worktree isolado                              │
│  8. Monta contexto: convenções + arquivos-exemplo (MAC-24)      │
│     + lições RELEVANTES do repo (busca semântica, MAC-23/45)    │
│  9. Chama LiteLLM [strong_coder] → gera/altera código           │
│  10. Valida no sandbox (install/build/test) ANTES de pushar     │
│  11. Self-correction (MAC-54): falhou? → fix dirigido →         │
│      revalida, até AGENT_MAX_FIX_ATTEMPTS (default 2)           │
│  12. Commita + pusha a branch (estado final, uma vez)           │
│  13. Retorna resultado (diff, validação, fixAttempts, custo)    │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                     ORCHESTRATOR API                            │
│                                                                 │
│  14. Chama LiteLLM [critic] → revisa diff                       │
│  15. Loop de revisão (MAC-59): REPROVA/ressalva? → coder        │
│      re-coda endereçando o parecer → re-revisa, até teto        │
│  16. Abre Draft PR no GitHub (título Conventional Commits EN)   │
│  17. Artifact Store (MAC-44): guarda plano/patch/review/        │
│      validação/summary do run                                   │
│  18. Memory (MAC-23/45): se critic REPROVA / validação ❌ →     │
│      destila lição [cheap_fast], embeda e guarda por repo       │
│  19. Report: comenta resultado consolidado + custo no Plane     │
│  20. Persiste qualidade no run (validação/veredito/fixAttempts) │
└─────────────────────────────────────────────────────────────────┘

                    ── MERGE É MANUAL ──
```

Grafo LangGraph: `planning → [⏸ aprovação] → coding → reviewing → [revisar? → revising → reviewing] → pr → report → END`
(falha do coder curto-circuita para `report`). O self-correction (passo 11) vive
dentro do runner — não muda a topologia do grafo; o loop de revisão (passo 15) é
graph-level (nó `revising`, fora do `interruptBefore` p/ não re-pedir aprovação).
Checkpointer Postgres persiste e retoma após restart (MAC-34).

**Disparo e escala.** Além do webhook `ai-ready`, um **scheduler cron** (MAC-38)
cria cards + runs (auto-aprovados se sem motivo crítico). O run grava `agent_id`
do **Agent Registry** (MAC-42); ferramentas e suas permissões vivem no **Tool
Registry** (MAC-43). O worker processa **N runs em paralelo**
(`AGENT_MAX_CONCURRENCY`, MAC-47) com dedup de card ativo por índice único; o
dispatch faz **failover** entre runners (MAC-39). Concorrência observável em
`GET /admin/concurrency`.

Linear continua suportado como provider legado/opcional para cards migrados ou
integrações antigas, mas o fluxo operacional novo usa Plane por padrão.

## VMs e DNS interno

| VM | DNS | Papel |
|---|---|---|
| agent-gateway | `llm.agent.local` | LiteLLM proxy |
| agent-orchestrator | `api.agent.local` | Orquestrador + LangGraph |
| agent-runners | — | Execução isolada de código |
| agent-observability | `grafana.agent.local` | Grafana — execuções, custo, qualidade, memória |

`grafana.agent.local` é acessível na LAN via DNAT no host (porta 3000) — ver
[`runbooks/grafana-lan-access.md`](../runbooks/grafana-lan-access.md).

## Model Aliases

| Alias | Quando usar |
|---|---|
| `cheap_fast` | Tarefas triviais / alto volume; Verboo direto com fallback para `cost-saver` |
| `research` | Leitura de contexto, síntese e planejamento; usa o combo OmniRoute `cost-saver` |
| `strong_coder` | Geração e alteração de código comum; usa o combo OmniRoute `cost-saver` |
| `heavy_coder` | Código difícil, correção após falha e tarefas críticas; usa o combo OmniRoute `high-availability` |
| `critic` | Revisão final de diff e planos; usa o combo OmniRoute `high-availability` |

`cost-saver` deve priorizar modelos custo-benefício e contexto longo, com Gemini
como bom candidato para research/síntese. `high-availability` concentra os
modelos mais fortes e múltiplos providers para preservar execução em tarefas
críticas.
