# ADR-0006 — LLM via OmniRoute (OAuth de assinaturas)

**Status:** Accepted
**Date:** 2026-06-11
**Revisa:** [ADR-0003](./ADR-0003-llm-gateway-litellm-model-aliases.md)

## Contexto

O ADR-0003 previa providers via API key paga (Verboo + Claude/OpenAI). Decidimos
usar as **assinaturas existentes** (Claude Max + ChatGPT) em vez de créditos de
API, já que é a mesma conta sendo consumida.

Assinaturas não dão acesso direto à API — só às UIs. O acesso programático se dá
por um **bridge OAuth** que segura a sessão da assinatura e expõe um endpoint
OpenAI-compatible.

## Decisão

Manter o **LiteLLM como gateway** (ADR-0003 segue válido), mas o backend dos
aliases passa a ser o **OmniRoute** (`diegosouzapw/omniroute`), rodando como
container no `agent-gateway`:

```
agente → LiteLLM (aliases) → OmniRoute (OAuth) → Claude Max / ChatGPT
```

- OmniRoute na porta `20128`, web UI para o OAuth dos providers.
- LiteLLM chama `http://omniroute:20128/v1` (OpenAI-compatible) com `OMNIROUTE_API_KEY`.
- Prefixos de modelo: `cc/...` (Claude), `cx/...` (GPT), `auto` (roteamento).
- Aliases (`cheap_fast`, `strong_coder`, `critic`, `research`) inalterados para
  os agentes — só a origem mudou.

## Trade-offs

- **Custo:** usa assinatura já paga, sem créditos de API adicionais.
- **ToS (risco aceito):** uso programático de assinatura via OAuth é zona cinzenta.
  Anthropic tolera (mecanismo do Claude Code/Max); OpenAI é mais rígido e os
  bridges quebram com mais frequência. Risco é ação na conta, não técnico.
- **Dependência:** OmniRoute é ferramenta community; tokens OAuth precisam de
  refresh (o OmniRoute cuida disso). Se ele cair, o gateway perde os modelos.
- **Saída:** trocar para API keys diretas é só reescrever o `litellm-config.yaml`
  de volta ao formato do ADR-0003 — os agentes não percebem.

## Consequências

- `infra/compose/gateway/` ganha o serviço `omniroute` + volume persistente.
- `.env` do gateway: `OMNIROUTE_API_KEY` em vez das keys diretas de provider.
- Deploy do gateway é em duas fases: sobe OmniRoute → OAuth na UI → preenche a
  key → sobe LiteLLM.
