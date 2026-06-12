import { describe, expect, it } from 'vitest';
import type { CommandResult } from '../types.js';
import { summarizeFailureTail } from './runJob.js';

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
});
