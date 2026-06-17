import { describe, expect, it } from 'vitest';
import type { CommandResult } from '../types.js';
import type { Job } from '../types.js';
import { buildCommitMessage, summarizeFailureTail } from './runJob.js';

function cmd(command: string, exitCode: number, stderr = '', stdout = ''): CommandResult {
  return { command, exitCode, stdout, stderr, durationMs: 1 };
}

describe('summarizeFailureTail', () => {
  it('retorna vazio quando todos os comandos passaram', () => {
    expect(summarizeFailureTail([cmd('pnpm build', 0)])).toBe('');
  });

  it('extrai o comando e o tail do stderr do primeiro que falhou', () => {
    const out = summarizeFailureTail([
      cmd('pnpm install', 0),
      cmd('pnpm build', 1, 'erro: Cannot find module X'),
      cmd('pnpm test', 1, 'não deveria aparecer'),
    ]);
    expect(out).toBe('$ pnpm build\nerro: Cannot find module X');
  });

  it('cai no stdout quando o stderr está vazio', () => {
    const out = summarizeFailureTail([cmd('pnpm test', 1, '', 'FAIL src/x.test.ts')]);
    expect(out).toBe('$ pnpm test\nFAIL src/x.test.ts');
  });

  it('inclui stderr e stdout quando ambos existem', () => {
    const out = summarizeFailureTail([
      cmd('pnpm build', 1, '[ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL]', 'src/eval/scoring.ts(1,1)'),
    ]);

    expect(out).toBe('$ pnpm build\n[ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL]\nsrc/eval/scoring.ts(1,1)');
  });

  it('preserva começo e fim de saídas longas', () => {
    const out = summarizeFailureTail([
      cmd(
        'pnpm build',
        1,
        `src/eval/scoring.ts(5,26): error TS2305\n${'x'.repeat(4000)}\nELIFECYCLE`,
      ),
    ]);

    expect(out).toContain('src/eval/scoring.ts(5,26): error TS2305');
    expect(out).toContain('[output truncated; keeping first and last diagnostics]');
    expect(out).toContain('ELIFECYCLE');
  });
});

describe('buildCommitMessage', () => {
  const job = {
    issueIdentifier: 'MAC-84',
    title: 'Teste descartável',
  } as Job;

  it('adiciona Ref e Co-authored-by quando coautor está configurado', () => {
    const msg = buildCommitMessage(job, 'docs(runbooks): add note', 'Resumo curto.', {
      name: 'Codex',
      email: 'noreply@openai.com',
    });

    expect(msg).toBe(
      'docs(runbooks): add note\n\nResumo curto.\n\nRef: MAC-84\nCo-authored-by: Codex <noreply@openai.com>',
    );
  });

  it('não adiciona Co-authored-by incompleto', () => {
    const msg = buildCommitMessage(job, 'docs: add note', '', { name: 'Codex' });

    expect(msg).toBe('docs: add note\n\nRef: MAC-84');
  });
});
