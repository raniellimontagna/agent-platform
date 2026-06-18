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

  it('valida report v2 para aprovado com auto-merge e revisão no-op', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'eval-score-'));
    try {
      await writeFile(join(dir, 'README.md'), 'hello eval harness\n');
      await writeFile(
        join(dir, 'report.json'),
        JSON.stringify(
          {
            verdict: 'APROVADO',
            autoMerge: true,
            blockReason: null,
            caveatCategory: null,
            reviewAction: 'noop',
            criticRounds: 0,
            maxCriticRounds: 3,
            commit: {
              message:
                'feat(eval): add local fixture\n\nRef: MAC-84\n\nCo-authored-by: Codex <noreply@openai.com>',
              author: {
                name: 'Ranielli Montagna',
                email: 'raniellimontagna@hotmail.com',
              },
            },
            isolation: {
              allowNetwork: false,
              allowGitHub: false,
              allowLinear: false,
              allowLiteLLM: false,
              externalCalls: [],
            },
          },
          null,
          2,
        ),
      );

      const result = await scoreScenario({
        scenario: scenario({
          report: {
            path: 'report.json',
            verdict: 'APROVADO',
            autoMerge: true,
            blockReason: null,
            caveatCategory: null,
            reviewAction: 'noop',
            criticRounds: 0,
            maxCriticRounds: 3,
            commitMessageIncludes: ['Ref: MAC-84'],
            authorName: 'Ranielli Montagna',
            authorEmail: 'raniellimontagna@hotmail.com',
            coAuthorTrailer: 'Co-authored-by: Codex <noreply@openai.com>',
            isolation: {
              allowNetwork: false,
              allowGitHub: false,
              allowLinear: false,
              allowLiteLLM: false,
              externalCallsCount: 0,
            },
          },
        }),
        workdir: dir,
        changedFiles: ['README.md'],
        commands: [command(0)],
      });

      expect(result.passed).toBe(true);
      expect(result.checks.find((check) => check.name === 'report:verdict')?.passed).toBe(true);
      expect(result.checks.find((check) => check.name === 'report:auto-merge')?.passed).toBe(
        true,
      );
      expect(result.checks.find((check) => check.name === 'report:review-action')?.passed).toBe(
        true,
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('valida aprovado com ressalvas operacionais e revisão com recode', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'eval-score-'));
    try {
      await writeFile(join(dir, 'README.md'), 'hello eval harness\n');
      await writeFile(
        join(dir, 'report.json'),
        JSON.stringify(
          {
            verdict: 'APROVADO COM RESSALVAS',
            autoMerge: true,
            blockReason: null,
            caveatCategory: 'operational',
            reviewAction: 'recode',
            criticRounds: 2,
            maxCriticRounds: 3,
            commit: {
              message:
                'fix(worker): harden critic loop\n\nRef: MAC-85\n\nCo-authored-by: Codex <noreply@openai.com>',
              author: {
                name: 'Ranielli Montagna',
                email: 'raniellimontagna@hotmail.com',
              },
            },
            isolation: {
              allowNetwork: false,
              allowGitHub: false,
              allowLinear: false,
              allowLiteLLM: false,
              externalCalls: [],
            },
          },
          null,
          2,
        ),
      );

      const result = await scoreScenario({
        scenario: scenario({
          report: {
            path: 'report.json',
            verdict: 'APROVADO COM RESSALVAS',
            autoMerge: true,
            blockReason: null,
            caveatCategory: 'operational',
            reviewAction: 'recode',
            criticRounds: 2,
            maxCriticRounds: 3,
            commitMessageIncludes: ['Ref: MAC-85'],
            authorName: 'Ranielli Montagna',
            authorEmail: 'raniellimontagna@hotmail.com',
            coAuthorTrailer: 'Co-authored-by: Codex <noreply@openai.com>',
            isolation: {
              allowNetwork: false,
              allowGitHub: false,
              allowLinear: false,
              allowLiteLLM: false,
              externalCallsCount: 0,
            },
          },
        }),
        workdir: dir,
        changedFiles: ['README.md'],
        commands: [command(0)],
      });

      expect(result.passed).toBe(true);
      expect(result.checks.find((check) => check.name === 'report:caveat-category')?.detail).toBe(
        'expected "operational"; got "operational"',
      );
      expect(result.checks.find((check) => check.name === 'report:review-action')?.detail).toBe(
        'expected "recode"; got "recode"',
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('bloqueia ressalva não operacional e respeita limite de 3 voltas do critic', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'eval-score-'));
    try {
      await writeFile(join(dir, 'README.md'), 'hello eval harness\n');
      await writeFile(
        join(dir, 'report.json'),
        JSON.stringify(
          {
            verdict: 'APROVADO COM RESSALVAS',
            autoMerge: false,
            blockReason: 'non-operational caveat requires manual review',
            caveatCategory: 'non-operational',
            reviewAction: 'recode',
            criticRounds: 3,
            maxCriticRounds: 3,
            commit: {
              message:
                'test(eval): add blocker fixture\n\nRef: MAC-85\n\nCo-authored-by: Codex <noreply@openai.com>',
              author: {
                name: 'Ranielli Montagna',
                email: 'raniellimontagna@hotmail.com',
              },
            },
            isolation: {
              allowNetwork: false,
              allowGitHub: false,
              allowLinear: false,
              allowLiteLLM: false,
              externalCalls: [],
            },
          },
          null,
          2,
        ),
      );

      const result = await scoreScenario({
        scenario: scenario({
          report: {
            path: 'report.json',
            verdict: 'APROVADO COM RESSALVAS',
            autoMerge: false,
            blockReason: 'non-operational caveat requires manual review',
            caveatCategory: 'non-operational',
            reviewAction: 'recode',
            criticRounds: 3,
            maxCriticRounds: 3,
            commitMessageIncludes: ['Ref: MAC-85'],
            authorName: 'Ranielli Montagna',
            authorEmail: 'raniellimontagna@hotmail.com',
            coAuthorTrailer: 'Co-authored-by: Codex <noreply@openai.com>',
            isolation: {
              allowNetwork: false,
              allowGitHub: false,
              allowLinear: false,
              allowLiteLLM: false,
              externalCallsCount: 0,
            },
          },
        }),
        workdir: dir,
        changedFiles: ['README.md'],
        commands: [command(0)],
      });

      expect(result.passed).toBe(true);
      expect(
        result.checks.find((check) => check.name === 'report:auto-merge-block-reason')?.detail,
      ).toBe(
        'expected "non-operational caveat requires manual review"; got "non-operational caveat requires manual review"',
      );
      expect(
        result.checks.find((check) => check.name === 'report:critic-rounds-within-limit')?.passed,
      ).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('reprova quando o commit não contém trailer obrigatório', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'eval-score-'));
    try {
      await writeFile(join(dir, 'README.md'), 'hello eval harness\n');
      await writeFile(
        join(dir, 'report.json'),
        JSON.stringify(
          {
            verdict: 'APROVADO',
            autoMerge: true,
            blockReason: null,
            caveatCategory: null,
            reviewAction: 'noop',
            criticRounds: 1,
            maxCriticRounds: 3,
            commit: {
              message: 'feat(eval): missing trailer\n\nRef: MAC-84',
              author: {
                name: 'Ranielli Montagna',
                email: 'raniellimontagna@hotmail.com',
              },
            },
            isolation: {
              allowNetwork: false,
              allowGitHub: false,
              allowLinear: false,
              allowLiteLLM: false,
              externalCalls: [],
            },
          },
          null,
          2,
        ),
      );

      const result = await scoreScenario({
        scenario: scenario({
          report: {
            path: 'report.json',
            verdict: 'APROVADO',
            autoMerge: true,
            blockReason: null,
            caveatCategory: null,
            reviewAction: 'noop',
            criticRounds: 1,
            maxCriticRounds: 3,
            commitMessageIncludes: ['Ref: MAC-84'],
            authorName: 'Ranielli Montagna',
            authorEmail: 'raniellimontagna@hotmail.com',
            coAuthorTrailer: 'Co-authored-by: Codex <noreply@openai.com>',
            isolation: {
              allowNetwork: false,
              allowGitHub: false,
              allowLinear: false,
              allowLiteLLM: false,
              externalCallsCount: 0,
            },
          },
        }),
        workdir: dir,
        changedFiles: ['README.md'],
        commands: [command(0)],
      });

      expect(result.passed).toBe(false);
      expect(
        result.checks.find((check) => check.name === 'report:commit-co-author-trailer')?.passed,
      ).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

function scenario(extraExpected: Record<string, unknown> = {}): EvalScenario {
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
      ...extraExpected,
    },
  } as EvalScenario;
}
