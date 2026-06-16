import type { LlmClient } from '@agent-platform/llm';
import type { Logger } from 'pino';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  completeJson,
  extractJson,
  filterDocumentationTargets,
  filterReviewCreates,
  selectFixCandidateFiles,
} from './codegen.js';

/** LlmClient fake: devolve as respostas da fila em ordem (repete a última). */
function fakeLlm(responses: string[]): {
  llm: LlmClient;
  calls: () => number;
  lastMaxTokens: () => number | undefined;
} {
  let i = 0;
  let maxTokens: number | undefined;
  return {
    llm: {
      complete: async (opts) => {
        maxTokens = opts.maxTokens;
        return responses[Math.min(i++, responses.length - 1)] ?? '';
      },
    },
    calls: () => i,
    lastMaxTokens: () => maxTokens,
  };
}

const noopLog = { info() {}, warn() {} } as unknown as Logger;
const schema = z.object({ ok: z.boolean() });
const opts = { messages: [{ role: 'system' as const, content: 'x' }], temperature: 0 };

describe('extractJson', () => {
  it('parseia JSON cru', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it('parseia JSON em cerca ```json', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('parseia JSON em cerca sem linguagem', () => {
    expect(extractJson('```\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('tolera prosa ao redor do JSON', () => {
    expect(extractJson('Claro! Aqui está:\n{"a":1}\nPronto.')).toEqual({ a: 1 });
  });

  it('lança quando não há JSON', () => {
    expect(() => extractJson('sem json aqui')).toThrow();
  });

  it('lança quando o JSON é inválido', () => {
    expect(() => extractJson('{ a: }')).toThrow();
  });
});

describe('completeJson', () => {
  it('parseia na primeira tentativa sem repair', async () => {
    const { llm, calls } = fakeLlm(['{"ok": true}']);
    expect(await completeJson(llm, opts, schema, noopLog, 2)).toEqual({ ok: true });
    expect(calls()).toBe(1);
  });

  it('faz repair quando os attempts vêm em prosa e o repair traz JSON limpo', async () => {
    const { llm, calls } = fakeLlm([
      'Claro! Vou gerar o código...',
      'Aqui está a explicação com JSON inválido: { ok: true }',
      '{"ok": true}',
    ]);
    expect(await completeJson(llm, opts, schema, noopLog, 2)).toEqual({ ok: true });
    // 2 attempts + 1 repair.
    expect(calls()).toBe(3);
  });

  it('lança quando nem os attempts nem o repair produzem JSON', async () => {
    const { llm } = fakeLlm(['prosa', 'mais prosa', 'ainda prosa']);
    await expect(completeJson(llm, opts, schema, noopLog, 2)).rejects.toThrow();
  });

  it('não faz repair caro quando a última resposta nem contém objeto JSON', async () => {
    const { llm, calls } = fakeLlm(['{"bad": true}', 'bash\nrtk pnpm eval\n', '{"ok": true}']);
    await expect(completeJson(llm, opts, schema, noopLog, 2)).rejects.toThrow();
    expect(calls()).toBe(2);
  });

  it('ainda faz repair quando a última resposta parece JSON truncado', async () => {
    const { llm, calls } = fakeLlm(['{"bad": true}', '{"ok":', '{"ok": true}']);
    expect(await completeJson(llm, opts, schema, noopLog, 2)).toEqual({ ok: true });
    expect(calls()).toBe(3);
  });

  it('encaminha maxTokens para o cliente LLM', async () => {
    const { llm, lastMaxTokens } = fakeLlm(['{"ok": true}']);
    await completeJson(llm, { ...opts, maxTokens: 1234 }, schema, noopLog, 1);
    expect(lastMaxTokens()).toBe(1234);
  });
});

describe('filterDocumentationTargets', () => {
  it('remove markdown e docs quando a issue não pede documentação explicitamente', () => {
    const result = filterDocumentationTargets(
      {
        edit: ['src/index.ts', 'docs/runbooks/eval-harness.md', 'README.md'],
        create: ['src/new.ts', 'docs/new-runbook.md'],
      },
      { title: 'Eval Harness v2 para auto-merge', description: '' },
    );

    expect(result.selection).toEqual({
      edit: ['src/index.ts'],
      create: ['src/new.ts'],
    });
    expect(result.droppedDocs).toEqual([
      'docs/runbooks/eval-harness.md',
      'README.md',
      'docs/new-runbook.md',
    ]);
  });

  it('mantém markdown e docs quando a issue pede documentação explicitamente', () => {
    const selection = {
      edit: ['docs/runbooks/eval-harness.md'],
      create: ['README.md'],
    };

    const result = filterDocumentationTargets(selection, {
      title: 'Documentar eval harness',
      description: '',
    });

    expect(result.selection).toEqual(selection);
    expect(result.droppedDocs).toEqual([]);
  });
});

describe('selectFixCandidateFiles', () => {
  it('mantém só os arquivos citados no erro de validação', () => {
    expect(
      selectFixCandidateFiles(
        ['apps/worker-code/src/eval/runEval.ts', 'apps/worker-code/src/eval/scoring.ts'],
        'apps/worker-code/src/eval/runEval.ts:42:13 - error TS2322',
      ),
    ).toEqual(['apps/worker-code/src/eval/runEval.ts']);
  });

  it('usa o nome do arquivo quando o erro não traz caminho completo', () => {
    expect(
      selectFixCandidateFiles(
        ['apps/worker-code/src/eval/runEval.ts', 'apps/worker-code/src/eval/scoring.ts'],
        'FAIL scoring.ts > scoreEvalReport',
      ),
    ).toEqual(['apps/worker-code/src/eval/scoring.ts']);
  });

  it('limita o fallback quando não consegue inferir arquivos do erro', () => {
    const files = Array.from({ length: 10 }, (_, index) => `src/file${index}.ts`);

    expect(selectFixCandidateFiles(files, 'erro sem caminho')).toEqual(files.slice(0, 6));
  });
});

describe('filterReviewCreates', () => {
  it('mantém creates no fluxo normal', () => {
    const selection = { edit: ['src/a.ts'], create: ['src/b.ts'] };

    expect(filterReviewCreates(selection, undefined)).toEqual({
      selection,
      droppedCreates: [],
    });
  });

  it('remove creates no modo revisão', () => {
    expect(
      filterReviewCreates(
        { edit: ['src/a.ts'], create: ['src/b.ts', 'src/c.ts'] },
        'endereçar ressalvas do critic',
      ),
    ).toEqual({
      selection: { edit: ['src/a.ts'], create: [] },
      droppedCreates: ['src/b.ts', 'src/c.ts'],
    });
  });
});
