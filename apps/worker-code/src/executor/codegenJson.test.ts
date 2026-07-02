import type { LlmClient, TokenUsage } from '@agent-platform/llm';
import type { Logger } from 'pino';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { completeJson, extractJson } from './codegenJson.js';

function fakeLlm(responses: string[]): {
  llm: LlmClient;
  calls: () => number;
  callOpts: () => Parameters<LlmClient['complete']>[0][];
} {
  let i = 0;
  const callOpts: Parameters<LlmClient['complete']>[0][] = [];
  return {
    llm: {
      complete: async (opts) => {
        callOpts.push(opts);
        opts.onUsage?.({ promptTokens: i + 1, completionTokens: i + 10 });
        return responses[Math.min(i++, responses.length - 1)] ?? '';
      },
    },
    calls: () => i,
    callOpts: () => callOpts,
  };
}

const noopLog = { info() {}, warn() {} } as unknown as Logger;
const schema = z.object({ ok: z.boolean() });
const opts = { messages: [{ role: 'system' as const, content: 'x' }], temperature: 0 };

describe('extractJson', () => {
  it('extracts raw, fenced, and surrounded JSON objects', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Claro! Aqui está:\n{"a":1}\nPronto.')).toEqual({ a: 1 });
  });

  it('includes a compact sample when the model response has no JSON object', () => {
    expect(() => extractJson('sem json aqui\ncom quebras de linha e texto explicativo')).toThrow(
      'Amostra: sem json aqui com quebras de linha e texto explicativo',
    );
  });
});

describe('completeJson', () => {
  it('uses strong_coder JSON mode and parses on the first attempt without repair', async () => {
    const { llm, calls, callOpts } = fakeLlm(['{"ok": true}']);

    await expect(completeJson(llm, opts, schema, noopLog, 2)).resolves.toEqual({ ok: true });

    expect(calls()).toBe(1);
    expect(callOpts()[0]).toMatchObject({
      alias: 'strong_coder',
      jsonMode: true,
      temperature: 0,
    });
  });

  it('tries twice before asking the model to repair a dirty JSON object', async () => {
    const { llm, calls, callOpts } = fakeLlm([
      'Claro! Vou gerar o código...',
      'Aqui está a explicação com JSON inválido: { ok: true }',
      '{"ok": true}',
    ]);

    await expect(completeJson(llm, opts, schema, noopLog, 2)).resolves.toEqual({ ok: true });

    expect(calls()).toBe(3);
    expect(callOpts()[2]).toMatchObject({
      alias: 'strong_coder',
      jsonMode: true,
      temperature: 0,
    });
    expect(callOpts()[2]?.messages[0]?.content).toContain('Devolva SOMENTE o objeto JSON');
  });

  it('forwards usage accounting for normal attempts and repair calls', async () => {
    const { llm } = fakeLlm(['{"bad": true}', '{"ok":', '{"ok": true}']);
    const usage: TokenUsage = { promptTokens: 0, completionTokens: 0 };

    await expect(
      completeJson(
        llm,
        {
          ...opts,
          onUsage: (item) => {
            usage.promptTokens += item.promptTokens;
            usage.completionTokens += item.completionTokens;
          },
        },
        schema,
        noopLog,
        2,
      ),
    ).resolves.toEqual({ ok: true });

    expect(usage).toEqual({ promptTokens: 6, completionTokens: 33 });
  });

  it('does not run repair when the last response has no JSON object start', async () => {
    const { llm, calls } = fakeLlm(['{"bad": true}', 'bash\nrtk pnpm eval\n', '{"ok": true}']);

    await expect(completeJson(llm, opts, schema, noopLog, 2)).rejects.toThrow();

    expect(calls()).toBe(2);
  });

  it('passes maxTokens through to the LLM client', async () => {
    const { llm, callOpts } = fakeLlm(['{"ok": true}']);

    await completeJson(llm, { ...opts, maxTokens: 1234 }, schema, noopLog, 1);

    expect(callOpts()[0]?.maxTokens).toBe(1234);
  });
});
