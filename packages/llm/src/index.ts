import OpenAI from 'openai';

/** Aliases estáveis expostos pelo LiteLLM (ver litellm-config.yaml). */
export type ModelAlias = 'cheap_fast' | 'research' | 'strong_coder' | 'heavy_coder' | 'critic';

export interface LlmConfig {
  baseUrl: string;
  apiKey: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompleteOptions {
  alias: ModelAlias;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
}

export interface LlmClient {
  complete(opts: CompleteOptions): Promise<string>;
}

/**
 * Cliente fino sobre o LiteLLM (endpoint OpenAI-compatible). Os agentes chamam
 * sempre por alias, nunca por modelo real — o roteamento/fallback é do gateway.
 */
export function createLlmClient(config: LlmConfig): LlmClient {
  const client = new OpenAI({ baseURL: config.baseUrl, apiKey: config.apiKey });

  return {
    async complete({ alias, messages, temperature, maxTokens }) {
      const res = await client.chat.completions.create({
        model: alias,
        messages,
        temperature,
        max_tokens: maxTokens,
      });
      return res.choices[0]?.message?.content ?? '';
    },
  };
}
