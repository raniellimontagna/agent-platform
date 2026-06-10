# ADR-0002 — Infra: Proxmox com 4 VMs

**Status:** Accepted  
**Date:** 2026-06-10

## Contexto

Precisamos de isolamento entre os componentes do sistema: gateway LLM, orquestrador, execução de código de agentes e observabilidade.

## Decisão

4 máquinas no Proxmox com responsabilidades separadas:

| VM | Hostname | Tipo | Responsabilidade |
|---|---|---|---|
| agent-gateway | `agent-gateway` | LXC Debian 13 + Docker | LiteLLM, proxy LLM, rate limits |
| agent-orchestrator | `agent-orchestrator` | LXC Debian 13 + Docker | API Hono, LangGraph, Postgres, Redis, BullMQ |
| agent-runners | `agent-runners` | VM completa Debian/Ubuntu | Execução de código de agentes, worktrees, containers efêmeros |
| agent-observability | `agent-observability` | LXC Debian 13 + Docker | Grafana, Prometheus, Loki, exporters |

**DNS interno:**

| Alias | Destino |
|---|---|
| `llm.agent.local` | agent-gateway |
| `api.agent.local` | agent-orchestrator |
| `grafana.agent.local` | agent-observability |

## Justificativa

- `agent-runners` usa VM completa (não LXC) porque executa código potencialmente não confiável gerado por agentes — isolamento de kernel é necessário.
- Os demais usam LXC por leveza e simplicidade operacional.
- Separação de observabilidade evita que falhas no orquestrador apaguem os logs de diagnóstico.

## Consequências

- Deploy e gerenciamento por VM, cada uma com seu `docker-compose.yml` em `infra/compose/`.
- Rede interna via Tailscale/VPN; nada exposto publicamente no MVP.
