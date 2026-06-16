import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CommandResult } from '../types.js';
import { scoreScenario } from './scoring.js';
import type { EvalScenario } from './types.js';

const command = (exitCode: number): CommandResult => ({
  command: 'node test.js',
  exitCode,
  stdout: exitCode === 0 ? 'ok' : '',
  stderr: exitCode === 0 ? '' : 'failed',
  durationMs: 1,
});

describe('scoreScenario', () => {
  it('aprova quando arquivos, conteúdo e comandos batem', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'eval-score-'));
    try {
      await writeFile(join(dir, 'README.md'), 'hello eval harness\n');
      const result = await scoreScenario({
        scenario: scenario(),
        workdir: dir,
        changedFiles: ['README.md'],
        commands: [command(0)],
      });

      expect(result.passed).toBe(true);
      expect(result.score).toBe(100);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('reprova mudanças fora do esperado', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'eval-score-'));
    try {
      await writeFile(join(dir, 'README.md'), 'hello eval harness\n');
      const result = await scoreScenario({
        scenario: scenario(),
        workdir: dir,
        changedFiles: ['README.md', 'package.json'],
        commands: [command(0)],
      });

      expect(result.passed).toBe(false);
      expect(result.checks.some((check) => !check.passed && check.name === 'changed-files')).toBe(
        true,
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

function scenario(): EvalScenario {
  return {
    id: 'docs-note',
    title: 'Docs note',
    description: 'Adds a note',
    repo: { files: {} },
    candidate: { files: {}, delete: [] },
    commands: ['node test.js'],
    expected: {
      changedFiles: ['README.md'],
      forbiddenFiles: ['package.json'],
      requiredContent: [{ path: 'README.md', includes: 'eval harness' }],
    },
  };
}
