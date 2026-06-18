import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CommandResult } from '../types.js';
import type { EvalCheck, EvalScenario } from './types.js';

type EvalReportExpectation = {
  path: string;
  verdict?: string;
  autoMerge?: boolean;
  blockReason?: string | null;
  caveatCategory?: string | null;
  reviewAction?: string;
  criticRounds?: number;
  maxCriticRounds?: number;
  commitMessageIncludes?: string[];
  authorName?: string;
  authorEmail?: string;
  coAuthorTrailer?: string;
  isolation?: {
    allowNetwork?: boolean;
    allowGitHub?: boolean;
    allowLinear?: boolean;
    allowLiteLLM?: boolean;
    externalCallsCount?: number;
  };
};

export async function scoreScenario(args: {
  scenario: EvalScenario;
  workdir: string;
  changedFiles: string[];
  commands: CommandResult[];
}): Promise<{ passed: boolean; score: number; checks: EvalCheck[] }> {
  const checks: EvalCheck[] = [];
  const expected = [...args.scenario.expected.changedFiles].sort();
  const actual = [...args.changedFiles].sort();

  checks.push({
    name: 'changed-files',
    passed: sameList(actual, expected),
    detail: `expected ${expected.join(', ') || '(none)'}; got ${actual.join(', ') || '(none)'}`,
  });

  for (const file of args.scenario.expected.forbiddenFiles) {
    checks.push({
      name: `forbidden-file:${file}`,
      passed: !actual.includes(file),
      detail: actual.includes(file) ? `${file} was changed` : `${file} was not changed`,
    });
  }

  for (const requirement of args.scenario.expected.requiredContent) {
    const content = await readText(join(args.workdir, requirement.path));
    checks.push({
      name: `required-content:${requirement.path}`,
      passed: content.includes(requirement.includes),
      detail: content.includes(requirement.includes)
        ? `found "${requirement.includes}"`
        : `missing "${requirement.includes}"`,
    });
  }

  await addReportChecks({
    scenario: args.scenario,
    workdir: args.workdir,
    checks,
  });

  for (const command of args.commands) {
    checks.push({
      name: `command:${command.command}`,
      passed: command.exitCode === 0,
      detail:
        command.exitCode === 0
          ? `passed in ${command.durationMs}ms`
          : `exit ${command.exitCode}: ${tail(command.stderr || command.stdout)}`,
    });
  }

  const passedCount = checks.filter((check) => check.passed).length;
  const score = checks.length === 0 ? 100 : Math.round((passedCount / checks.length) * 100);
  return { passed: checks.every((check) => check.passed), score, checks };
}

async function addReportChecks(args: {
  scenario: EvalScenario;
  workdir: string;
  checks: EvalCheck[];
}): Promise<void> {
  const reportExpectation = (args.scenario.expected as { report?: EvalReportExpectation }).report;
  if (!reportExpectation) {
    return;
  }

  const reportPath = join(args.workdir, reportExpectation.path);
  const report = await readJson(reportPath);

  if (!report) {
    args.checks.push({
      name: `report:${reportExpectation.path}`,
      passed: false,
      detail: `missing or invalid JSON report at ${reportExpectation.path}`,
    });
    return;
  }

  if (reportExpectation.verdict !== undefined) {
    pushEqualityCheck(args.checks, {
      name: 'report:verdict',
      actual: report.verdict,
      expected: reportExpectation.verdict,
    });
  }

  if (reportExpectation.autoMerge !== undefined) {
    pushEqualityCheck(args.checks, {
      name: 'report:auto-merge',
      actual: report.autoMerge,
      expected: reportExpectation.autoMerge,
    });
  }

  if (reportExpectation.blockReason !== undefined) {
    pushEqualityCheck(args.checks, {
      name: 'report:auto-merge-block-reason',
      actual: report.blockReason ?? null,
      expected: reportExpectation.blockReason,
    });
  }

  if (reportExpectation.caveatCategory !== undefined) {
    pushEqualityCheck(args.checks, {
      name: 'report:caveat-category',
      actual: report.caveatCategory ?? null,
      expected: reportExpectation.caveatCategory,
    });
  }

  if (reportExpectation.reviewAction !== undefined) {
    pushEqualityCheck(args.checks, {
      name: 'report:review-action',
      actual: report.reviewAction,
      expected: reportExpectation.reviewAction,
    });
  }

  if (reportExpectation.criticRounds !== undefined) {
    pushEqualityCheck(args.checks, {
      name: 'report:critic-rounds',
      actual: report.criticRounds,
      expected: reportExpectation.criticRounds,
    });
  }

  if (reportExpectation.maxCriticRounds !== undefined) {
    pushEqualityCheck(args.checks, {
      name: 'report:max-critic-rounds',
      actual: report.maxCriticRounds,
      expected: reportExpectation.maxCriticRounds,
    });

    args.checks.push({
      name: 'report:critic-rounds-within-limit',
      passed:
        typeof report.criticRounds === 'number' &&
        typeof report.maxCriticRounds === 'number' &&
        report.criticRounds <= report.maxCriticRounds,
      detail: `criticRounds ${formatValue(report.criticRounds)}; maxCriticRounds ${formatValue(report.maxCriticRounds)}`,
    });
  }

  const commitMessage = typeof report.commit?.message === 'string' ? report.commit.message : '';
  for (const includes of reportExpectation.commitMessageIncludes ?? []) {
    args.checks.push({
      name: `report:commit-message-includes:${includes}`,
      passed: commitMessage.includes(includes),
      detail: commitMessage.includes(includes)
        ? `found "${includes}"`
        : `missing "${includes}" in commit message`,
    });
  }

  if (reportExpectation.authorName !== undefined) {
    pushEqualityCheck(args.checks, {
      name: 'report:commit-author-name',
      actual: report.commit?.author?.name,
      expected: reportExpectation.authorName,
    });
  }

  if (reportExpectation.authorEmail !== undefined) {
    pushEqualityCheck(args.checks, {
      name: 'report:commit-author-email',
      actual: report.commit?.author?.email,
      expected: reportExpectation.authorEmail,
    });
  }

  if (reportExpectation.coAuthorTrailer !== undefined) {
    args.checks.push({
      name: 'report:commit-co-author-trailer',
      passed: commitMessage.includes(reportExpectation.coAuthorTrailer),
      detail: commitMessage.includes(reportExpectation.coAuthorTrailer)
        ? `found "${reportExpectation.coAuthorTrailer}"`
        : `missing "${reportExpectation.coAuthorTrailer}" in commit message`,
    });
  }

  if (reportExpectation.isolation) {
    const isolation = report.isolation ?? {};
    const expectedIsolation = reportExpectation.isolation;

    if (expectedIsolation.allowNetwork !== undefined) {
      pushEqualityCheck(args.checks, {
        name: 'report:isolation:allow-network',
        actual: isolation.allowNetwork,
        expected: expectedIsolation.allowNetwork,
      });
    }

    if (expectedIsolation.allowGitHub !== undefined) {
      pushEqualityCheck(args.checks, {
        name: 'report:isolation:allow-github',
        actual: isolation.allowGitHub,
        expected: expectedIsolation.allowGitHub,
      });
    }

    if (expectedIsolation.allowLinear !== undefined) {
      pushEqualityCheck(args.checks, {
        name: 'report:isolation:allow-linear',
        actual: isolation.allowLinear,
        expected: expectedIsolation.allowLinear,
      });
    }

    if (expectedIsolation.allowLiteLLM !== undefined) {
      pushEqualityCheck(args.checks, {
        name: 'report:isolation:allow-litellm',
        actual: isolation.allowLiteLLM,
        expected: expectedIsolation.allowLiteLLM,
      });
    }

    if (expectedIsolation.externalCallsCount !== undefined) {
      const actualExternalCallsCount = Array.isArray(isolation.externalCalls)
        ? isolation.externalCalls.length
        : undefined;
      pushEqualityCheck(args.checks, {
        name: 'report:isolation:external-calls-count',
        actual: actualExternalCallsCount,
        expected: expectedIsolation.externalCallsCount,
      });
    }
  }
}

function pushEqualityCheck(
  checks: EvalCheck[],
  args: { name: string; actual: unknown; expected: unknown },
): void {
  checks.push({
    name: args.name,
    passed: Object.is(args.actual, args.expected),
    detail: `expected ${formatValue(args.expected)}; got ${formatValue(args.actual)}`,
  });
}

function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

async function readText(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return '';
  }
}

async function readJson(path: string): Promise<Record<string, any> | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as Record<string, any>;
  } catch {
    return null;
  }
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') {
    return `"${value}"`;
  }

  if (value === undefined) {
    return 'undefined';
  }

  return JSON.stringify(value);
}

function tail(value: string, max = 300): string {
  const trimmed = value.trim();
  return trimmed.length > max ? trimmed.slice(-max) : trimmed;
}
