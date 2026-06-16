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

  it('aprova report com auto-merge operacional e commit com Ref e Co-authored-by', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'eval-score-'));
    try {
      await writeFile(join(dir, 'README.md'), 'hello eval harness\n');
      await writeFile(
        join(dir, 'eval-report.txt'),
        [
          'Verdict: APROVADO COM RESSALVAS',
          'Auto-merge: allowed',
          'Review outcome: no-op',
          'Review rounds: 1',
        ].join('\n'),
      );
      await writeFile(
        join(dir, 'commit-message.txt'),
        [
          'feat(eval): add local harness coverage',
          '',
          'Ref: MAC-85',
          'Author: Ranielli Montagna <raniellimontagna@hotmail.com>',
          'Co-authored-by: Codex <noreply@openai.com>',
        ].join('\n'),
      );

      const result = await scoreScenario({
        scenario: reviewScenario({
          verdict: 'APROVADO COM RESSALVAS',
          autoMerge: 'allowed',
          reviewOutcome: 'no-op',
          reviewRounds: 1,
        }),
        workdir: dir,
        changedFiles: ['README.md', 'eval-report.txt', 'commit-message.txt'],
        commands: [command(0)],
      });

      expect(result.passed).toBe(true);
      expect(
        result.checks.some(
          (check) => check.name === 'commit-author:commit-message.txt' && check.passed,
        ),
      ).toBe(true);
      expect(
        result.checks.some(
          (check) => check.name === 'report-content:eval-report.txt:auto-merge' && check.passed,
        ),
      ).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('reprova ressalva não operacional que deveria bloquear auto-merge', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'eval-score-'));
    try {
      await writeFile(join(dir, 'README.md'), 'hello eval harness\n');
      await writeFile(
        join(dir, 'eval-report.txt'),
        [
          'Verdict: APROVADO COM RESSALVAS',
          'Auto-merge: blocked',
          'Review outcome: follow-up-pr',
          'Review rounds: 3',
        ].join('\n'),
      );
      await writeFile(
        join(dir, 'commit-message.txt'),
        [
          'feat(eval): block auto-merge when needed',
          '',
          'Ref: MAC-84',
          'Author: Ranielli Montagna <raniellimontagna@hotmail.com>',
          'Co-authored-by: Codex <noreply@openai.com>',
        ].join('\n'),
      );

      const result = await scoreScenario({
        scenario: reviewScenario({
          verdict: 'APROVADO COM RESSALVAS',
          autoMerge: 'blocked',
          blockReason: 'non-operational caveat',
          reviewOutcome: 'follow-up-pr',
          reviewRounds: 3,
        }),
        workdir: dir,
        changedFiles: ['README.md', 'eval-report.txt', 'commit-message.txt'],
        commands: [command(0)],
      });

      expect(result.passed).toBe(false);
      expect(
        result.checks.some(
          (check) =>
            check.name === 'report-content:eval-report.txt:block-reason' && !check.passed,
        ),
      ).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('aprova fluxo com recode até o limite de 3 rodadas do critic antes de seguir para PR', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'eval-score-'));
    try {
      await writeFile(join(dir, 'README.md'), 'hello eval harness\n');
      await writeFile(
        join(dir, 'eval-report.txt'),
        [
          'Verdict: APROVADO',
          'Auto-merge: allowed',
          'Review outcome: recode-then-pr',
          'Review rounds: 3',
        ].join('\n'),
      );
      await writeFile(
        join(dir, 'commit-message.txt'),
        [
          'feat(eval): continue after critic limit',
          '',
          'Ref: MAC-85',
          'Author: Ranielli Montagna <raniellimontagna@hotmail.com>',
          'Co-authored-by: Codex <noreply@openai.com>',
        ].join('\n'),
      );

      const result = await scoreScenario({
        scenario: reviewScenario({
          verdict: 'APROVADO',
          autoMerge: 'allowed',
          reviewOutcome: 'recode-then-pr',
          reviewRounds: 3,
        }),
        workdir: dir,
        changedFiles: ['README.md', 'eval-report.txt', 'commit-message.txt'],
        commands: [command(0)],
      });

      expect(result.passed).toBe(true);
      expect(
        result.checks.some(
          (check) =>
            check.name === 'report-content:eval-report.txt:review-rounds' && check.passed,
        ),
      ).toBe(true);
      expect(
        result.checks.some(
          (check) =>
            check.name === 'report-content:eval-report.txt:review-outcome' && check.passed,
        ),
      ).toBe(true);
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

function reviewScenario(args: {
  verdict: string;
  autoMerge: string;
  blockReason?: string;
  reviewOutcome: string;
  reviewRounds: number;
}): EvalScenario {
  return {
    id: 'eval-harness-v2',
    title: 'Eval harness v2',
    description: 'Scores local critic and auto-merge fixtures',
    repo: { files: {} },
    candidate: { files: {}, delete: [] },
    commands: ['node test.js'],
    expected: {
      changedFiles: ['README.md', 'commit-message.txt', 'eval-report.txt'],
      forbiddenFiles: ['package.json'],
      requiredContent: [{ path: 'README.md', includes: 'eval harness' }],
      reportExpectations: [
        {
          path: 'eval-report.txt',
          verdict: args.verdict,
          autoMerge: args.autoMerge,
          blockReason: args.blockReason,
          reviewOutcome: args.reviewOutcome,
          reviewRounds: args.reviewRounds,
        },
      ],
      commitExpectations: [
        {
          path: 'commit-message.txt',
          authorName: 'Ranielli Montagna',
          authorEmail: 'raniellimontagna@hotmail.com',
          includes: ['Ref:', 'Co-authored-by: Codex <noreply@openai.com>'],
        },
      ],
    } as EvalScenario['expected'],
  };
}
