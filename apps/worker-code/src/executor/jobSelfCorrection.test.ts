import { describe, expect, it, vi } from 'vitest';
import type { CommandResult } from '../types.js';
import {
  applySelfCorrection,
  fixValidationFailures,
  retryCommitWithSelfCorrection,
} from './jobSelfCorrection.js';

const log = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

const llm = {
  complete: vi.fn(),
};

function command(command: string, exitCode = 0, stderr = '', stdout = ''): CommandResult {
  return { command, exitCode, stdout, stderr, durationMs: 4 };
}

const failedValidation = {
  passed: false,
  results: [command('pnpm test', 1, 'FAIL src/app.test.ts')],
  failureTail: '$ pnpm test\nFAIL src/app.test.ts',
};

const passedValidation = {
  passed: true,
  results: [command('pnpm test')],
  failureTail: '',
};

const baseContext = {
  llm,
  dir: '/repo',
  plan: 'Approved plan.',
  title: 'Fix generated code',
  agentKey: 'software-coder',
  agentCapabilities: ['code'],
  log,
};

describe('applySelfCorrection', () => {
  it('accumulates touched files, cost, and restored landing media assets', async () => {
    const applyFix = vi.fn(async () => ({
      summary: 'Fixed test.',
      filesChanged: ['src/app.ts', 'src/app.test.ts', 'public/generated/higgsfield-hero.jpg'],
      costUsd: 0.5,
    }));
    const restoreLandingMediaAsset = vi.fn(async () => 'public/generated/higgsfield-hero.jpg');

    const result = await applySelfCorrection({
      ...baseContext,
      state: {
        filesChanged: ['src/app.ts', 'public/generated/higgsfield-hero.jpg'],
        fixAttempts: 0,
        costUsd: 0.25,
      },
      failureTail: '$ pnpm test\nFAIL src/app.test.ts',
      reason: 'validation failed',
      applyFix,
      landingMedia: {
        artifactPath: '/tmp/higgsfield-hero.jpg',
        assetPath: 'public/generated/higgsfield-hero.jpg',
      },
      restoreLandingMediaAsset,
    });

    expect(result).toEqual({
      fixed: true,
      state: {
        filesChanged: ['src/app.ts', 'public/generated/higgsfield-hero.jpg', 'src/app.test.ts'],
        fixAttempts: 1,
        costUsd: 0.75,
      },
    });
    expect(applyFix).toHaveBeenCalledWith(
      expect.objectContaining({
        filesChanged: ['src/app.ts', 'public/generated/higgsfield-hero.jpg'],
        failureTail: '$ pnpm test\nFAIL src/app.test.ts',
      }),
    );
    expect(restoreLandingMediaAsset).toHaveBeenCalledWith(
      '/repo',
      '/tmp/higgsfield-hero.jpg',
      'public/generated/higgsfield-hero.jpg',
    );
  });
});

describe('fixValidationFailures', () => {
  it('stops after the configured max fix attempts and returns the last validation result', async () => {
    const applyFix = vi.fn(async () => ({
      summary: 'Still failing.',
      filesChanged: ['src/app.ts'],
      costUsd: 0.1,
    }));
    const runValidation = vi.fn(async () => failedValidation);

    const result = await fixValidationFailures({
      ...baseContext,
      validation: failedValidation,
      state: { filesChanged: ['src/app.ts'], fixAttempts: 0, costUsd: 0 },
      maxFixAttempts: 2,
      runValidation,
      applyFix,
    });

    expect(result.validation).toBe(failedValidation);
    expect(result.state).toEqual({
      filesChanged: ['src/app.ts'],
      fixAttempts: 2,
      costUsd: 0.2,
    });
    expect(applyFix).toHaveBeenCalledTimes(2);
    expect(runValidation).toHaveBeenCalledTimes(2);
  });
});

describe('retryCommitWithSelfCorrection', () => {
  it('turns git commit failure output into fix feedback and retries the commit', async () => {
    const applyFix = vi.fn(async () => ({
      summary: 'Fixed hook.',
      filesChanged: ['src/app.ts', 'src/hook-fix.ts'],
      costUsd: 0.15,
    }));
    const tryCommit = vi
      .fn()
      .mockResolvedValueOnce({
        failure: command('git commit', 1, 'git commit failed: pre-commit hook failed'),
      })
      .mockResolvedValueOnce({ committed: true, sha: 'abc123' });
    const runValidation = vi.fn(async () => passedValidation);

    const result = await retryCommitWithSelfCorrection({
      ...baseContext,
      validation: passedValidation,
      state: { filesChanged: ['src/app.ts'], fixAttempts: 0, costUsd: 0.25 },
      maxFixAttempts: 2,
      tryCommit,
      runValidation,
      applyFix,
    });

    expect(result.commit).toEqual({ committed: true, sha: 'abc123' });
    expect(result.validation).toBe(passedValidation);
    expect(result.state).toEqual({
      filesChanged: ['src/app.ts', 'src/hook-fix.ts'],
      fixAttempts: 1,
      costUsd: 0.4,
    });
    expect(applyFix).toHaveBeenCalledWith(
      expect.objectContaining({
        failureTail: '$ git commit\ngit commit failed: pre-commit hook failed',
      }),
    );
    expect(tryCommit).toHaveBeenCalledTimes(2);
  });
});
