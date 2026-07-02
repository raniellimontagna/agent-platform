import { describe, expect, it, vi } from 'vitest';
import type { CommandResult, Job } from '../types.js';
import { runGuarded, runLandingAwareValidation, runValidation } from './jobValidation.js';

const log = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

function command(command: string, exitCode = 0, stderr = '', stdout = ''): CommandResult {
  return { command, exitCode, stdout, stderr, durationMs: 3 };
}

function job(overrides: Partial<Job> = {}): Job {
  return {
    runId: '12345678-1234-4234-8234-123456789abc',
    issueIdentifier: 'AGP-601',
    repoUrl: 'git@example.com:repo.git',
    baseBranch: 'main',
    branch: 'agent/agp-601',
    commands: ['pnpm build', 'pnpm test'],
    checkoutOnly: false,
    title: 'Validate runner seams',
    description: '',
    plan: 'Plan.',
    lessons: '',
    reviewFeedback: '',
    agentKey: 'software-coder',
    agentCapabilities: ['code'],
    ...overrides,
  };
}

describe('runGuarded', () => {
  it('blocks commands outside the allowlist without executing the sandbox', async () => {
    const runSandboxedCommand = vi.fn(async () => command('rm -rf .'));

    const result = await runGuarded('rm -rf .', '/repo', 'run-1', log, {
      allowlist: ['pnpm', 'node'],
      runSandboxedCommand,
    });

    expect(result).toEqual({
      command: 'rm -rf .',
      exitCode: 126,
      stdout: '',
      stderr: 'bloqueado: binário fora da allowlist: rm',
      durationMs: 0,
    });
    expect(runSandboxedCommand).not.toHaveBeenCalled();
  });
});

describe('runValidation', () => {
  it('stops at the first failed command and summarizes its failure tail', async () => {
    const runSandboxedCommand = vi
      .fn()
      .mockResolvedValueOnce(command('pnpm build'))
      .mockResolvedValueOnce(command('pnpm test', 1, 'FAIL src/app.test.ts', 'stdout ignored'))
      .mockResolvedValueOnce(command('pnpm lint'));

    const result = await runValidation(['pnpm build', 'pnpm test', 'pnpm lint'], '/repo', 'run-1', log, {
      allowlist: ['pnpm'],
      runSandboxedCommand,
    });

    expect(result).toEqual({
      passed: false,
      results: [command('pnpm build'), command('pnpm test', 1, 'FAIL src/app.test.ts', 'stdout ignored')],
      failureTail: '$ pnpm test\nFAIL src/app.test.ts\nstdout ignored',
    });
    expect(runSandboxedCommand).toHaveBeenCalledTimes(2);
  });

  it('marks validation passed only when every command runs and exits zero', async () => {
    const runSandboxedCommand = vi
      .fn()
      .mockResolvedValueOnce(command('pnpm build'))
      .mockResolvedValueOnce(command('pnpm test'));

    await expect(
      runValidation(['pnpm build', 'pnpm test'], '/repo', 'run-1', log, {
        allowlist: ['pnpm'],
        runSandboxedCommand,
      }),
    ).resolves.toEqual({
      passed: true,
      results: [command('pnpm build'), command('pnpm test')],
      failureTail: '',
    });
  });
});

describe('runLandingAwareValidation', () => {
  it('returns landing quality failures before running job commands', async () => {
    const runSandboxedCommand = vi.fn(async () => command('pnpm test'));
    const runLandingQualityGate = vi.fn(async () => ({
      passed: false,
      results: [command('landing quality gate', 1, 'hero image missing')],
      failureTail: '$ landing quality gate\nhero image missing',
    }));

    const result = await runLandingAwareValidation(job(), '/repo', ['src/app.ts'], log, {
      allowlist: ['pnpm'],
      runSandboxedCommand,
      runLandingQualityGate,
    });

    expect(result).toEqual({
      passed: false,
      results: [command('landing quality gate', 1, 'hero image missing')],
      failureTail: '$ landing quality gate\nhero image missing',
    });
    expect(runSandboxedCommand).not.toHaveBeenCalled();
  });

  it('runs command validation after the landing quality gate passes', async () => {
    const runSandboxedCommand = vi.fn(async ({ command: cmd }) => command(cmd));
    const runLandingQualityGate = vi.fn(async () => ({
      passed: true,
      results: [],
      failureTail: '',
    }));

    const result = await runLandingAwareValidation(job(), '/repo', ['src/app.ts'], log, {
      allowlist: ['pnpm'],
      runSandboxedCommand,
      runLandingQualityGate,
    });

    expect(result.passed).toBe(true);
    expect(result.results).toEqual([command('pnpm build'), command('pnpm test')]);
    expect(runLandingQualityGate).toHaveBeenCalledWith({
      dir: '/repo',
      filesChanged: ['src/app.ts'],
      agentKey: 'software-coder',
    });
  });
});
