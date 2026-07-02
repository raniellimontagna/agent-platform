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
│  1. /webhooks/plane valida HMAC + transicao de label            │
│  2. createRun persiste identidade Plane do card                 │
│  3. BullMQ agent-runs recebe job plan                           │
│  4. Planner comenta plano no Plane                              │
│  5. ⏸ PAUSE — approved retoma com job resume quando necessario  │
│  6. Worker do orchestrator envia tarefa para /jobs              │
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

## Ancoras de codigo e teste

| Responsabilidade | Fonte de verdade | Evidencia local |
|---|---|---|
| Plane intake, HMAC, label `ai-ready`, approval resume, cancelamento e skips auditados | `apps/orchestrator-api/src/routes/webhooks.ts` | `apps/orchestrator-api/src/routes/webhooks.test.ts` |
| Run persistence e identidade `card_provider=plane` | `apps/orchestrator-api/src/runs.ts` | `apps/orchestrator-api/src/runs.test.ts` |
| Jobs BullMQ `plan`/`resume`, fila `agent-runs` e prioridades | `apps/orchestrator-api/src/queue.ts` | `apps/orchestrator-api/src/queue.test.ts` |
| Processamento do job, artifacts e continuacao workflow | `apps/orchestrator-api/src/worker.ts` | `apps/orchestrator-api/src/worker.test.ts` |
| API HTTP do runner (`/jobs`, `/jobs/sync`) | `apps/worker-code/src/routes/jobs.ts` | Ancora estatica; a cobertura comportamental do runner fica em `apps/worker-code/src/executor/runJob.test.ts`. |
| Execucao runner, validacao, self-correction, commit/push e callback | `apps/worker-code/src/executor/runJob.ts` | `apps/worker-code/src/executor/runJob.test.ts` |
| Report final no Plane | `packages/graph/src/nodes/report.ts` | `packages/graph/src/nodes/report.test.ts` |
| GitHub PR/merge e auto-merge opt-in | `packages/graph/src/nodes/merging.ts` | `packages/graph/src/nodes/merging.test.ts` |

`apps/worker-code/src/routes/jobs.ts` ainda nao tem um teste de rota dedicado;
por enquanto ele e uma ancora estatica de propriedade da API do runner, e
`apps/worker-code/src/executor/runJob.test.ts` cobre o comportamento executado
apos o dispatch.

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
