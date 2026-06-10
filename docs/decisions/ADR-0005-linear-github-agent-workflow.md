# ADR-0005 — Workflow: Linear + GitHub + Agent

**Status:** Accepted  
**Date:** 2026-06-10

## Contexto

Precisamos de um fluxo claro de ponta a ponta: como uma issue no Linear vira código no GitHub passando pelo orquestrador.

## Decisão

### Gatilho

Issue com label `ai-ready` no Linear dispara o fluxo via webhook.

### Fluxo principal

```
Linear (ai-ready)
  └─► Orquestrador recebe webhook
        └─► Agente lê issue + contexto
              └─► Gera plano + comenta no Linear
                    └─► Aguarda aprovação humana ◄── PAUSE
                          └─► Cria branch: agent/{issue-id}-{slug}
                                └─► Executa código no agent-runners (sandbox)
                                      └─► Roda testes
                                            └─► Agente reviewer revisa diff
                                                  └─► Abre Draft PR no GitHub
                                                        └─► Comenta resultado no Linear
```

### Branches

| Origem | Padrão |
|---|---|
| Agente | `agent/{issue-id}-{slug}` |
| Humano (dev) | `feat/mac-X-descricao`, `fix/mac-X-descricao`, etc. |

PR inicial criado como **Draft** quando há incerteza ou revisão pendente.

### Estados no Linear

| Estado | Quando |
|---|---|
| In Progress | Agente iniciou execução |
| In Review | PR aberto, aguardando revisão humana |
| Done | Merge realizado manualmente |

### O que permanece manual no MVP

- Merge do PR
- Deploy
- Resolução de conflitos

## Consequências

- Linear é o painel de controle principal; GitHub é onde o código vive.
- Aprovação humana está no meio do fluxo — não no final.
- Draft PR garante que nenhum merge acidental acontece antes da revisão.
