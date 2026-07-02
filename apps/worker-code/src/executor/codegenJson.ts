import { type LlmClient, type TokenUsage } from '@agent-platform/llm';
import type { Logger } from 'pino';
import { z } from 'zod';

export const fileSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
});

export const selectSchema = z.object({
  edit: z.array(z.string()).default([]),
  create: z.array(z.string()).default([]),
});

export const responseSchema = z.object({
  prTitle: z.string().default(''),
  summary: z.string().default(''),
  files: z.array(fileSchema).default([]),
});

/**
 * Extrai o JSON da resposta do modelo, tolerando cercas de código (```json ... ```)
 * ou texto ao redor. Lança se não encontrar um objeto JSON.
 */
export function extractJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? raw).trim();
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    const sample = candidate.replace(/\s+/g, ' ').slice(0, 240);
    throw new Error(
      sample
        ? `resposta do modelo não contém JSON. Amostra: ${sample}`
        : 'resposta do modelo não contém JSON',
    );
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

function hasJsonObjectStart(raw: string): boolean {
  const candidate = raw.trim();
  return candidate.includes('{');
}

/**
 * Chama o modelo e faz parse do JSON da resposta, com retry — o modelo às vezes
 * devolve prosa em vez de JSON limpo (flakiness). Loga a resposta crua truncada
 * na última falha para diagnóstico.
 */
export async function completeJson<S extends z.ZodTypeAny>(
  llm: LlmClient,
  opts: {
    messages: { role: 'system' | 'user'; content: string }[];
    temperature: number;
    maxTokens?: number;
    onUsage?: (usage: TokenUsage) => void;
  },
  schema: S,
  log: Logger,
  attempts = 2,
): Promise<z.infer<S>> {
  let lastErr: unknown;
  let lastRaw = '';
  for (let i = 1; i <= attempts; i++) {
    const start = Date.now();
    log.info({ attempt: i }, 'llm call start');
    const raw = await llm.complete({
      alias: 'strong_coder',
      temperature: opts.temperature,
      maxTokens: opts.maxTokens,
      jsonMode: true,
      messages: opts.messages,
      onUsage: opts.onUsage,
    });
    lastRaw = raw;
    log.info({ attempt: i, ms: Date.now() - start }, 'llm call done');
    try {
      return schema.parse(extractJson(raw));
    } catch (err) {
      lastErr = err;
      log.warn({ attempt: i, raw: raw.slice(0, 500) }, 'falha ao parsear JSON do modelo');
    }
  }
  // Passo de "repair" (MAC-57): o modelo às vezes devolve prosa em vez de JSON.
  // Em vez de desistir, reenvia a última resposta suja pedindo SÓ o objeto JSON.
  // Model-agnostic (qualquer combo do gateway) e só roda quando os attempts falharam.
  if (lastRaw.trim() && hasJsonObjectStart(lastRaw)) {
    try {
      log.info('repair: re-pedindo JSON limpo');
      const repaired = await llm.complete({
        alias: 'strong_coder',
        temperature: 0,
        maxTokens: opts.maxTokens,
        jsonMode: true,
        onUsage: opts.onUsage,
        messages: [
          {
            role: 'system',
            content:
              'Você extrai JSON. Devolva SOMENTE o objeto JSON válido presente no texto a seguir — sem markdown, sem comentários, sem nada fora do JSON.',
          },
          { role: 'user', content: lastRaw },
        ],
      });
      return schema.parse(extractJson(repaired));
    } catch (err) {
      lastErr = err;
      log.warn('repair falhou — sem JSON parseável');
    }
  } else if (lastRaw.trim()) {
    log.warn({ raw: lastRaw.slice(0, 500) }, 'repair ignorado — resposta sem objeto JSON');
  }
  throw lastErr instanceof Error ? lastErr : new Error('resposta do modelo não contém JSON');
}
