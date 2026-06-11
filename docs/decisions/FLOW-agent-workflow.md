# Fluxo do Agente — Visão Geral

```
┌─────────────────────────────────────────────────────────────────┐
│                          LINEAR                                 │
│  Issue + label [ai-ready]                                       │
└───────────────────────────┬─────────────────────────────────────┘
                            │ webhook
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                     ORCHESTRATOR API                            │
│  (agent-orchestrator / Hono + LangGraph)                        │
│                                                                 │
│  1. Lê issue + contexto do Linear                               │
│  2. Chama LiteLLM [research] → gera plano                       │
│  3. Comenta plano no Linear                                     │
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
│  8. Chama LiteLLM [strong_coder] → gera/altera código          │
│  9. Roda testes                                                 │
│  10. Retorna resultado ao orquestrador                          │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                     ORCHESTRATOR API                            │
│                                                                 │
│  11. Chama LiteLLM [critic] → revisa diff                       │
│  12. Abre Draft PR no GitHub                                    │
│  13. Comenta resultado + link PR no Linear                      │
│  14. Atualiza status da issue → In Review                       │
└─────────────────────────────────────────────────────────────────┘

                    ── MERGE É MANUAL ──
```

## VMs e DNS interno

| VM | DNS | Papel |
|---|---|---|
| agent-gateway | `llm.agent.local` | LiteLLM proxy |
| agent-orchestrator | `api.agent.local` | Orquestrador + LangGraph |
| agent-runners | — | Execução isolada de código |
| agent-observability | `grafana.agent.local` | Logs, métricas, custos |

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
