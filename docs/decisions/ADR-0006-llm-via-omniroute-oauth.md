# ADR-0006 — LLM via OmniRoute (OAuth de assinaturas)

**Status:** Accepted
**Date:** 2026-06-11
**Revisa:** [ADR-0003](./ADR-0003-llm-gateway-litellm-model-aliases.md)

## Contexto

O ADR-0003 previa providers via API key paga (Verboo + Claude/OpenAI). Decidimos
**não** comprar créditos de API da Anthropic/OpenAI e usar as **assinaturas
existentes** (Claude Max + ChatGPT) para os modelos fortes. O **Verboo continua**
como provider de alto volume / baixo custo (é onde há mais tokens disponíveis).

Assinaturas não dão acesso direto à API — só às UIs. O acesso programático se dá
por um **bridge OAuth** que segura a sessão da assinatura e expõe um endpoint
OpenAI-compatible.

## Decisão

Manter o **LiteLLM como gateway** (ADR-0003 segue válido) com backend **híbrido**:

```
                    ┌→ Verboo (API key)        → cheap_fast, research
agente → LiteLLM ───┤
                    └→ OmniRoute (OAuth) → Claude Max / ChatGPT → strong_coder, critic
```

- **Verboo** (MAC-13): API key direta, aliases de alto volume `cheap_fast` e `research`.
- **OmniRoute** (MAC-48): `diegosouzapw/omniroute`, container no `agent-gateway`,
  porta `20128`, web UI para o OAuth. LiteLLM chama `http://omniroute:20128/v1`
  (OpenAI-compatible) com `OMNIROUTE_API_KEY`. Modelos fortes `strong_coder` e `critic`.
- Prefixos de modelo OmniRoute: `cc/...` (Claude), `cx/...` (GPT), `auto`.
- Aliases (`cheap_fast`, `strong_coder`, `critic`, `research`) inalterados para
  os agentes — só a origem de cada um muda.

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
