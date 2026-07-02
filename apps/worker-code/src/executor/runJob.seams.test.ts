import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { CommandResult, Job, JobResult } from '../types.js';

const mocks = vi.hoisted(() => ({
  prepareWorktree: vi.fn(),
  cleanupWorktree: vi.fn(),
  generateAndApplyCode: vi.fn(),
  applyFix: vi.fn(),
  runSandboxedCommand: vi.fn(),
  runLandingQualityGate: vi.fn(),
  commitAll: vi.fn(),
  diffAgainst: vi.fn(),
  pushBranch: vi.fn(),
  generateHiggsfieldImage: vi.fn(),
  parsePreferredModels: vi.fn(),
}));

vi.mock('./worktree.js', () => ({
  prepareWorktree: mocks.prepareWorktree,
  cleanupWorktree: mocks.cleanupWorktree,
}));

vi.mock('./codegen.js', () => ({
  generateAndApplyCode: mocks.generateAndApplyCode,
  applyFix: mocks.applyFix,
}));

vi.mock('./sandbox.js', () => ({
  runSandboxedCommand: mocks.runSandboxedCommand,
}));

vi.mock('./landingQuality.js', () => ({
  runLandingQualityGate: mocks.runLandingQualityGate,
}));

vi.mock('./git.js', () => ({
  commitAll: mocks.commitAll,
  diffAgainst: mocks.diffAgainst,
  pushBranch: mocks.pushBranch,
}));

vi.mock('./higgsfieldTool.js', () => ({
  generateHiggsfieldImage: mocks.generateHiggsfieldImage,
  parsePreferredModels: mocks.parsePreferredModels,
}));

import { runDataCollectorJob } from './jobDispatch.js';
import { buildCommitMessage, reportResult, summarizeSandbox } from './jobResult.js';
import { reportResult as facadeReportResult, runJob } from './runJob.js';

function command(command: string, exitCode = 0, stderr = '', stdout = ''): CommandResult {
  return { command, exitCode, stdout, stderr, durationMs: 5 };
}

function job(overrides: Partial<Job> = {}): Job {
  return {
    runId: '12345678-1234-4234-8234-123456789abc',
    issueIdentifier: 'AGP-601',
    repoUrl: 'git@example.com:repo.git',
    baseBranch: 'main',
    branch: 'agent/agp-601',
    commands: ['pnpm test'],
    checkoutOnly: false,
    title: 'Refactor runner seams',
    description: 'Keep worker behavior stable.',
    plan: 'Apply the approved change.',
    lessons: '',
    reviewFeedback: '',
    agentKey: 'software-coder',
    agentCapabilities: ['code'],
    ...overrides,
  };
}

function researchResult(summary: string): JobResult {
  return {
    runId: '12345678-1234-4234-8234-123456789abc',
    status: 'succeeded',
    branch: 'agent/agp-601',
    commands: [],
    research: summary,
    pushed: false,
  };
}

describe('data collector dispatch seam', () => {
  it('routes browser-intent data collector jobs to Playwright with runner limits', async () => {
    const runPlaywrightResearchJob = vi.fn(async () => researchResult('playwright pack'));
    const runFirecrawlResearchJob = vi.fn(async () => researchResult('firecrawl pack'));

    const result = await runDataCollectorJob(job({ agentKey: 'data-collector-agent' }), {
      shouldUsePlaywrightResearch: () => true,
      runPlaywrightResearchJob,
      runFirecrawlResearchJob,
    });

    expect(result.research).toBe('playwright pack');
    expect(runPlaywrightResearchJob).toHaveBeenCalledWith(
      expect.objectContaining({ agentKey: 'data-collector-agent' }),
      expect.objectContaining({
        timeoutMs: expect.any(Number),
        maxPages: expect.any(Number),
        maxOutputChars: expect.any(Number),
        rateLimitPerMinute: expect.any(Number),
      }),
    );
    expect(runFirecrawlResearchJob).not.toHaveBeenCalled();
  });

  it('routes non-browser data collector jobs to Firecrawl with Instagram provider options', async () => {
    const runPlaywrightResearchJob = vi.fn(async () => researchResult('playwright pack'));
    const runFirecrawlResearchJob = vi.fn(async () => researchResult('firecrawl pack'));

    const result = await runDataCollectorJob(job({ agentKey: 'data-collector-agent' }), {
      shouldUsePlaywrightResearch: () => false,
      runPlaywrightResearchJob,
      runFirecrawlResearchJob,
    });

    expect(result.research).toBe('firecrawl pack');
    expect(runFirecrawlResearchJob).toHaveBeenCalledWith(
      expect.objectContaining({ agentKey: 'data-collector-agent' }),
      expect.objectContaining({
        baseUrl: expect.any(String),
        timeoutMs: expect.any(Number),
        instagramGraph: expect.objectContaining({
          baseUrl: expect.any(String),
          apiVersion: expect.any(String),
          timeoutMs: expect.any(Number),
        }),
        apifyInstagram: expect.objectContaining({
          actorId: expect.any(String),
          baseUrl: expect.any(String),
          maxItems: expect.any(Number),
          timeoutMs: expect.any(Number),
        }),
      }),
    );
    expect(runPlaywrightResearchJob).not.toHaveBeenCalled();
  });
});

describe('runJob facade orchestration seams', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prepareWorktree.mockResolvedValue('/tmp/agent-platform-run');
    mocks.cleanupWorktree.mockResolvedValue(undefined);
    mocks.generateAndApplyCode.mockResolvedValue({
      summary: 'Generated change.',
      filesChanged: ['src/app.ts'],
      costUsd: 0.25,
      prTitle: 'feat(worker): preserve result shape',
    });
    mocks.runLandingQualityGate.mockResolvedValue({
      passed: true,
      results: [],
      failureTail: '',
    });
    mocks.runSandboxedCommand.mockImplementation(async ({ command: cmd }) => command(cmd));
    mocks.commitAll.mockResolvedValue({ committed: true, sha: 'abc123' });
    mocks.diffAgainst.mockResolvedValue('diff --git a/src/app.ts b/src/app.ts');
    mocks.pushBranch.mockResolvedValue(undefined);
    mocks.applyFix.mockResolvedValue({ summary: 'Fixed.', filesChanged: ['src/app.ts'], costUsd: 0.1 });
    mocks.parsePreferredModels.mockReturnValue([]);
  });

  it('returns the existing codegen success result shape and cleans up the worktree', async () => {
    const result = await runJob(job());

    expect(result).toMatchObject({
      runId: '12345678-1234-4234-8234-123456789abc',
      status: 'succeeded',
      branch: 'agent/agp-601',
      commitSha: 'abc123',
      filesChanged: ['src/app.ts'],
      summary: 'Generated change.',
      prTitle: 'feat(worker): preserve result shape',
      pushed: true,
      testsPassed: true,
      fixAttempts: 0,
    });
    expect(result.commands).toEqual([expect.objectContaining({ command: 'pnpm test' })]);
    expect(result.sandbox).toEqual(
      expect.objectContaining({
        commandCount: 1,
        failedCommand: undefined,
      }),
    );
    expect(mocks.cleanupWorktree).toHaveBeenCalledWith(result.runId);
  });

  it('returns failed validation shape with the validation failure tail', async () => {
    mocks.runSandboxedCommand.mockResolvedValue(
      command('pnpm test', 1, 'FAIL src/app.test.ts', ''),
    );
    mocks.applyFix.mockRejectedValue(new Error('fix unavailable'));

    const result = await runJob(job());

    expect(result).toMatchObject({
      status: 'failed',
      testsPassed: false,
      error: '$ pnpm test\nFAIL src/app.test.ts',
      fixAttempts: 1,
    });
    expect(result.commands).toEqual([expect.objectContaining({ command: 'pnpm test', exitCode: 1 })]);
    expect(result.sandbox).toEqual(expect.objectContaining({ failedCommand: 'pnpm test' }));
    expect(mocks.pushBranch).not.toHaveBeenCalled();
    expect(mocks.cleanupWorktree).toHaveBeenCalledWith(result.runId);
  });

  it('uses git commit failure output for one self-correction retry', async () => {
    mocks.commitAll
      .mockRejectedValueOnce(new Error('git commit failed: hook rejected generated file'))
      .mockResolvedValueOnce({ committed: true, sha: 'def456' });

    const result = await runJob(job());

    expect(result).toMatchObject({
      status: 'succeeded',
      commitSha: 'def456',
      fixAttempts: 1,
      filesChanged: ['src/app.ts'],
    });
    expect(mocks.applyFix).toHaveBeenCalledWith(
      expect.objectContaining({
        failureTail: '$ git commit\ngit commit failed: hook rejected generated file',
      }),
    );
    expect(mocks.pushBranch).toHaveBeenCalledWith('/tmp/agent-platform-run', 'agent/agp-601');
  });

  it('keeps review no-op behavior successful without pushing a new commit', async () => {
    mocks.commitAll.mockResolvedValue({ committed: false });

    const result = await runJob(job({ reviewFeedback: 'Please adjust copy.' }));

    expect(mocks.prepareWorktree).toHaveBeenCalledWith(
      expect.objectContaining({
        checkoutOnly: false,
        revise: true,
      }),
    );
    expect(result).toMatchObject({
      status: 'succeeded',
      pushed: true,
      testsPassed: true,
    });
    expect(result.commitSha).toBeUndefined();
    expect(mocks.pushBranch).not.toHaveBeenCalled();
  });

  it('returns a failed JobResult and still runs cleanup when generation throws', async () => {
    mocks.generateAndApplyCode.mockRejectedValue(new Error('model returned no files'));

    const result = await runJob(job());

    expect(result).toMatchObject({
      status: 'failed',
      branch: 'agent/agp-601',
      commands: [],
      error: 'model returned no files',
    });
    expect(mocks.cleanupWorktree).toHaveBeenCalledWith(result.runId);
  });
});

describe('result and callback compatibility seams', () => {
  it('keeps commit message and sandbox summary semantics stable', () => {
    expect(
      buildCommitMessage(
        job({ issueIdentifier: 'AGP-601' }),
        'feat(worker): preserve shape',
        'Summary.',
        { name: 'Codex', email: 'noreply@openai.com' },
      ),
    ).toBe(
      'feat(worker): preserve shape\n\nSummary.\n\nRef: AGP-601\nCo-authored-by: Codex <noreply@openai.com>',
    );
    expect(
      summarizeSandbox([
        command('pnpm install', 0, '', '',),
        command('pnpm test', 1, 'FAIL', ''),
      ]),
    ).toEqual(
      expect.objectContaining({
        commandCount: 2,
        totalDurationMs: 10,
        maxCommandDurationMs: 5,
        failedCommand: 'pnpm test',
      }),
    );
  });

  it('posts the unchanged callback payload through the runJob facade export', async () => {
    const originalFetch = globalThis.fetch;
    const fetchImpl = vi.fn(async () => new Response('', { status: 200 }));
    globalThis.fetch = fetchImpl as typeof fetch;
    try {
      const result: JobResult = {
        runId: '12345678-1234-4234-8234-123456789abc',
        status: 'failed',
        branch: 'agent/agp-601',
        commands: [command('pnpm test', 1, 'FAIL', '')],
        error: 'validation failed',
      };

      expect(facadeReportResult).toBe(reportResult);
      await facadeReportResult(result);

      expect(fetchImpl).toHaveBeenCalledWith(
        expect.stringContaining('/runs/12345678-1234-4234-8234-123456789abc/result'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'content-type': 'application/json',
            authorization: expect.stringMatching(/^Bearer /),
          }),
          body: JSON.stringify(result),
        }),
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('keeps /jobs route importing only the runJob facade exports', async () => {
    await expect(readFile('apps/worker-code/src/routes/jobs.ts', 'utf8')).resolves.toContain(
      "import { reportResult, runJob } from '../executor/runJob.js'",
    );
  });
});
