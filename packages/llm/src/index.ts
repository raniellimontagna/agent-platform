import OpenAI from 'openai';

/** Aliases estáveis expostos pelo LiteLLM (ver litellm-config.yaml). */
export type ModelAlias = 'cheap_fast' | 'research' | 'strong_coder' | 'heavy_coder' | 'critic';

/**
 * Retenta uma operação transitória com backoff exponencial (MAC-33). Use só em
 * operações idempotentes/read-only — NÃO em passos com efeito colateral.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { attempts?: number; baseDelayMs?: number } = {},
): Promise<T> {
  const attempts = opts.attempts ?? 3;
  const baseDelayMs = opts.baseDelayMs ?? 500;
  let lastErr: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < attempts) await new Promise((r) => setTimeout(r, baseDelayMs * 2 ** (i - 1)));
    }
  }
  throw lastErr;
}

export interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  /** Retries em erros transitórios (429/5xx/conexão). Default 4 (MAC-33). */
  maxRetries?: number;
  /** Timeout por chamada em ms. Default 60s (MAC-33). */
  timeoutMs?: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
}

export interface CompleteOptions {
  alias: ModelAlias;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  /** Callback com o uso de tokens da chamada — base do cost tracking (MAC-40). */
  onUsage?: (usage: TokenUsage) => void;
}

export interface LlmClient {
  complete(opts: CompleteOptions): Promise<string>;
}

/**
 * Preço ESTIMATIVO por alias em USD por 1M de tokens (entrada/saída). Os combos
 * via OmniRoute usam assinatura (custo fixo), então isto é o equivalente em API
 * — serve para tracking relativo, não cobrança real (MAC-40).
 */
export const MODEL_PRICING: Record<ModelAlias, { inUsdPerM: number; outUsdPerM: number }> = {
  cheap_fast: { inUsdPerM: 0.1, outUsdPerM: 0.3 },
  research: { inUsdPerM: 3, outUsdPerM: 15 },
  strong_coder: { inUsdPerM: 3, outUsdPerM: 15 },
  heavy_coder: { inUsdPerM: 3, outUsdPerM: 15 },
  critic: { inUsdPerM: 3, outUsdPerM: 15 },
};

/** Estima o custo (USD) de uma chamada a partir do uso de tokens (MAC-40). */
export function estimateCostUsd(alias: ModelAlias, usage: TokenUsage): number {
  const p = MODEL_PRICING[alias];
  return (usage.promptTokens * p.inUsdPerM + usage.completionTokens * p.outUsdPerM) / 1_000_000;
}

/**
 * Cliente fino sobre o LiteLLM (endpoint OpenAI-compatible). Os agentes chamam
 * sempre por alias, nunca por modelo real — o roteamento/fallback é do gateway.
 *
 * Retry Engine (MAC-33): o SDK da OpenAI já faz backoff exponencial em erros
 * transitórios (429, 5xx, conexão) até `maxRetries`. Chamadas LLM são seguras de
 * retentar (sem efeito colateral). Passos com efeito (push/PR/runner) NÃO são
 * retentados às cegas — usam o checkpointer + resume manual.
 */
export function createLlmClient(config: LlmConfig): LlmClient {
  const client = new OpenAI({
    baseURL: config.baseUrl,
    apiKey: config.apiKey,
    maxRetries: config.maxRetries ?? 4,
    timeout: config.timeoutMs ?? 60_000,
  });

  return {
    async complete({ alias, messages, temperature, maxTokens, onUsage }) {
      const res = await client.chat.completions.create({
        model: alias,
        messages,
        temperature,
        max_tokens: maxTokens,
      });
      if (onUsage && res.usage) {
        onUsage({
          promptTokens: res.usage.prompt_tokens ?? 0,
          completionTokens: res.usage.completion_tokens ?? 0,
        });
      }
      return res.choices[0]?.message?.content ?? '';
    },
  };
}
