# ADR-0003 — LLM Gateway: LiteLLM e Model Aliases

**Status:** Accepted  
**Date:** 2026-06-10

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
