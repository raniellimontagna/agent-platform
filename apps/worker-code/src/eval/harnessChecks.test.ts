import { describe, expect, it } from 'vitest';
import type { CommandResult } from '../types.js';
import { combineScores, createHarnessChecks } from './harnessChecks.js';
import type { EvalScenario } from './types.js';
import type { WorkerDryRunResult } from './workerDryRun.js';

describe('createHarnessChecks', () => {
  it('preserves check names and details for review, commit, and isolation expectations', () => {
    const checks = createHarnessChecks(scenario, {
      changedFiles: ['README.md'],
      commands: [command(0)],
      dryRun,
    });

    expect(checks).toEqual([
      { passed: true, name: 'eval verdict', detail: 'APROVADO COM RESSALVAS' },
      { passed: true, name: 'review outcome', detail: 'recode' },
      { passed: true, name: 'auto-merge expectation', detail: 'no' },
      { passed: true, name: 'auto-merge block reason', detail: 'manual review required' },
      { passed: true, name: 'critic rounds limit', detail: '2/3' },
      { passed: true, name: 'critic rounds', detail: '2' },
      { passed: true, name: 'commit Ref trailer', detail: 'present' },
      { passed: true, name: 'commit Co-authored-by trailer', detail: 'present' },
      {
        passed: true,
        name: 'commit author',
        detail: 'Ranielli Montagna <raniellimontagna@hotmail.com>',
      },
      {
        passed: true,
        name: 'isolation policy',
        detail: 'allowNetwork=no; allowGitHub=no; allowLinear=no; allowLiteLLM=no; externalCalls=0',
      },
    ]);
  });
});

describe('combineScores', () => {
  it('keeps the lower value between scoreScenario output and harness compliance', () => {
    expect(
      combineScores(90, [
        { name: 'base', passed: true, detail: 'ok' },
        { name: 'harness', passed: false, detail: 'failed' },
      ]),
    ).toBe(50);
    expect(combineScores(80, [{ name: 'harness', passed: true, detail: 'ok' }])).toBe(80);
  });
});

const scenario: EvalScenario = {
  id: 'harness-policy',
  title: 'Harness policy',
  description: 'Checks eval harness expectations.',
  repo: { files: {} },
  candidate: { files: {}, delete: [] },
  commands: [],
  expected: {
    changedFiles: ['README.md'],
    review: {
      verdict: 'APROVADO COM RESSALVAS',
      reviewOutcome: 'recode',
      autoMergeEligible: false,
      blockReason: 'manual review required',
      criticRounds: 2,
      maxCriticRounds: 3,
    },
    commit: {
      author: {
        name: 'Ranielli Montagna',
        email: 'raniellimontagna@hotmail.com',
      },
      messageIncludes: ['Ref:'],
      trailersInclude: ['Co-authored-by: Codex <noreply@openai.com>'],
    },
    isolation: {
      allowNetwork: false,
      allowGitHub: false,
      allowLinear: false,
      allowLiteLLM: false,
      externalCalls: [],
    },
  },
};

const dryRun: WorkerDryRunResult = {
  branch: 'eval/harness-policy',
  commands: [],
  diff: '',
  expectedAutoMerge: false,
  autoMergeBlockReason: 'manual review required',
  filesChanged: ['README.md'],
  fixAttempts: 0,
  reviewOutcome: 'recode',
  reviewVerdict: 'APROVADO COM RESSALVAS',
  criticRounds: 2,
  maxReviewRounds: 3,
  commitMessage:
    'fix(eval): harness policy\n\nRef: MAC-85\n\nCo-authored-by: Codex <noreply@openai.com>',
  commitAuthorName: 'Ranielli Montagna',
  commitAuthorEmail: 'raniellimontagna@hotmail.com',
  allowNetwork: false,
  allowGitHub: false,
  allowLinear: false,
  allowLiteLLM: false,
  externalCalls: [],
  prTitle: 'fix(eval): harness policy',
  summary: 'Harness policy summary.',
  pushed: false,
};

function command(exitCode: number): CommandResult {
  return {
    command: 'node test.js',
    exitCode,
    stdout: exitCode === 0 ? 'ok' : '',
    stderr: exitCode === 0 ? '' : 'failed',
    durationMs: 1,
  };
}
