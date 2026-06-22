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
│  16. Abre PR no GitHub (Draft ou pronto conforme auto-merge)    │
│  17. Merging opt-in: auto-merge se label + testes + critic OK   │
│  18. Cloudflare deploy opcional para landings geradas           │
│  19. Artifact Store (MAC-44): guarda plano/patch/review/        │
│      validação/summary do run                                   │
│  20. Memory (MAC-23/45): se critic REPROVA / validação ❌ →     │
│      destila lição [cheap_fast], embeda e guarda por repo       │
│  21. Report: comenta resultado consolidado + custo no Plane     │
│  22. Persiste qualidade no run (validação/veredito/fixAttempts) │
└─────────────────────────────────────────────────────────────────┘

            ── sem label `auto-merge`, o merge fica manual ──
```

Grafo LangGraph: `planning → [⏸ aprovação] → coding → reviewing → [revisar? → revising → reviewing] → pr → merging → cloudflareDeploy → report → END`
(falha do coder curto-circuita para `report`). O self-correction (passo 11) vive
dentro do runner — não muda a topologia do grafo; o loop de revisão (passo 15) é
graph-level (nó `revising`, fora do `interruptBefore` p/ não re-pedir aprovação).
Checkpointer Postgres persiste e retoma após restart (MAC-34).

## Pipeline e roles

O runtime físico ainda é um único LangGraph, mas o catálogo diferencia a chave
compatível `coder-agent` da identidade mais clara `software-delivery-pipeline`.
Essa identidade expõe roles para leitura, observabilidade e evolução futura:

- `planner`: gera plano e `APPROVAL_REASONS`.
- `coder`: aplica o plano no runner e valida mudanças.
- `critic`: revisa o diff e decide recode ou PR.
- `pr`: abre PR e avalia auto-merge.
- `reporter`: publica o resumo final no provider de origem.

Essas roles não são serviços separados nesta fase; elas nomeiam as
responsabilidades já existentes no grafo e no runner.

**Disparo e escala.** Além do webhook `ai-ready`, um **scheduler cron** (MAC-38)
cria cards + runs (auto-aprovados se sem motivo crítico). O run grava `agent_id`
do **Agent Registry** (MAC-42); ferramentas e suas permissões vivem no **Tool
Registry** (MAC-43). O worker processa **N runs em paralelo**
(`AGENT_MAX_CONCURRENCY`, MAC-47) com dedup de card ativo por índice único; o
dispatch faz **failover** entre runners (MAC-39). Concorrência observável em
`GET /admin/concurrency`.

Linear continua suportado como provider legado/opcional para cards migrados ou
integrações antigas, mas o fluxo operacional novo usa Plane por padrão. O handler
Plane audita skips de webhook com `reason`, labels atuais/anteriores e
identificador do card; o histórico de runs por card pode ser consultado em
`GET /admin/card-runs`.

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
