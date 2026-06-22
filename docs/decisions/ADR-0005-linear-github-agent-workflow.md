# ADR-0005 — Workflow: Linear + GitHub + Agent

**Status:** Accepted  
**Date:** 2026-06-10

> Nota de atualização (2026-06-22): este ADR documenta o fluxo histórico Linear + GitHub + Agent. O estado atual do projeto é Plane-first; Linear permanece opcional/legado para cards existentes e `/webhooks/linear`. Auto-merge existe como opt-in por label `auto-merge`; sem essa label, o merge continua manual.

## Contexto

Precisamos de um fluxo claro de ponta a ponta: como uma issue no Linear vira código no GitHub passando pelo orquestrador.

## Decisão

### Gatilho

Issue com label `ai-ready` no Linear dispara o fluxo via webhook.

### Fluxo principal (histórico)

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

### Estados no Linear (histórico)

| Estado | Quando |
|---|---|
| In Progress | Agente iniciou execução |
| In Review | PR aberto, aguardando revisão humana |
| Done | Merge realizado manualmente |

### O que era manual no MVP histórico

- Merge do PR
- Deploy
- Resolução de conflitos

## Consequências

- Linear foi o painel de controle principal neste fluxo histórico; hoje Plane é o provider primário e Linear segue opcional/legado.
- Aprovação humana está no meio do fluxo — não no final.
- Draft PR e auto-merge opt-in impedem merge acidental fora das políticas atuais.
