# ADR-0003 — LLM Gateway: LiteLLM e Model Aliases

**Status:** Accepted (backend de providers revisado pelo [ADR-0006](./ADR-0006-llm-via-omniroute-oauth.md))
**Date:** 2026-06-10

> **Nota:** o gateway LiteLLM e os aliases seguem como descritos aqui. A origem
> dos modelos mudou de API keys diretas (Verboo/Claude/OpenAI) para **OmniRoute
> com OAuth de assinaturas** — ver [ADR-0006](./ADR-0006-llm-via-omniroute-oauth.md).

## Contexto

Agentes não devem depender de providers LLM específicos. Precisamos de um gateway central que abstraia modelos, controle custos e ofereça fallback.

## Decisão

**Gateway:** LiteLLM rodando em `agent-gateway`.

**Providers:**

| Papel | Provider |
|---|---|
| Barato/alto volume | Verboo |
| Forte/fallback | Claude (Anthropic) |
| Forte/fallback | OpenAI / Codex |
| Experimental/opcional | OmniRoute (atrás do LiteLLM) |

**Aliases oficiais** — agentes chamam apenas aliases, nunca modelos reais:

| Alias | Uso |
|---|---|
| `cheap_fast` | Tarefas simples, alto volume, baixo custo |
| `strong_coder` | Geração e revisão de código |
| `critic` | Revisão de diff, avaliação de planos |
| `research` | Busca, síntese, raciocínio longo |
| `local_private` | Dados sensíveis (futuro) |

## Consequências

- Troca de provider não exige mudança de código nos agentes.
- Budgets, rate limits e logs centralizados no LiteLLM.
- `local_private` reservado para fase futura com modelo local (Ollama/vLLM).
- OmniRoute opcional e experimental — não bloqueia MVP.
