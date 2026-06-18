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

  const verdict = getValue(report, ['verdict']);
  const autoMerge = getValue(report, ['autoMerge']);
  const blockReason = readNullableString(report, [
    ['blockReason'],
    ['autoMergeBlockReason'],
    ['blockedReason'],
    ['autoMerge', 'blockReason'],
  ]);
  const caveatCategory = readNullableString(report, [['caveatCategory']]);
  const reviewAction = getValue(report, ['reviewAction']);
  const criticRounds = getValue(report, ['criticRounds']);
  const maxCriticRounds = getValue(report, ['maxCriticRounds']);

  if (reportExpectation.verdict !== undefined) {
    pushEqualityCheck(args.checks, {
      name: 'report:verdict',
      actual: verdict,
      expected: reportExpectation.verdict,
    });
  }

  if (reportExpectation.autoMerge !== undefined) {
    pushEqualityCheck(args.checks, {
      name: 'report:auto-merge',
      actual: autoMerge,
      expected: reportExpectation.autoMerge,
    });
  }

  if (reportExpectation.blockReason !== undefined) {
    const shouldValidateBlockReason =
      reportExpectation.autoMerge === false ||
      autoMerge === false ||
      reportExpectation.blockReason === null;

    args.checks.push({
      name: 'report:auto-merge-block-reason',
      passed: !shouldValidateBlockReason || Object.is(blockReason, reportExpectation.blockReason),
      detail: shouldValidateBlockReason
        ? `expected ${formatValue(reportExpectation.blockReason)}; got ${formatValue(blockReason)}`
        : `skipped because auto-merge is not blocked (expected ${formatValue(reportExpectation.blockReason)}; got ${formatValue(blockReason)})`,
    });
  }

  if (reportExpectation.caveatCategory !== undefined) {
    pushEqualityCheck(args.checks, {
      name: 'report:caveat-category',
      actual: caveatCategory,
      expected: reportExpectation.caveatCategory,
    });
  }

  if (reportExpectation.reviewAction !== undefined) {
    pushEqualityCheck(args.checks, {
      name: 'report:review-action',
      actual: reviewAction,
      expected: reportExpectation.reviewAction,
    });
  }

  if (reportExpectation.criticRounds !== undefined) {
    pushEqualityCheck(args.checks, {
      name: 'report:critic-rounds',
      actual: criticRounds,
      expected: reportExpectation.criticRounds,
    });
  }

  if (reportExpectation.maxCriticRounds !== undefined) {
    pushEqualityCheck(args.checks, {
      name: 'report:max-critic-rounds',
      actual: maxCriticRounds,
      expected: reportExpectation.maxCriticRounds,
    });

    args.checks.push({
      name: 'report:critic-rounds-within-limit',
      passed:
        typeof criticRounds === 'number' &&
        typeof maxCriticRounds === 'number' &&
        criticRounds <= maxCriticRounds,
      detail: `criticRounds ${formatValue(criticRounds)}; maxCriticRounds ${formatValue(maxCriticRounds)}`,
    });
  }

  const commitMessage = readString(report, [['commit', 'message']]) ?? '';
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
      actual: getValue(report, ['commit', 'author', 'name']),
      expected: reportExpectation.authorName,
    });
  }

  if (reportExpectation.authorEmail !== undefined) {
    pushEqualityCheck(args.checks, {
      name: 'report:commit-author-email',
      actual: getValue(report, ['commit', 'author', 'email']),
      expected: reportExpectation.authorEmail,
    });
  }

  if (reportExpectation.coAuthorTrailer !== undefined) {
    const trailers = readStringList(report, [['commit', 'trailers']]);
    const hasTrailer =
      commitMessage.includes(reportExpectation.coAuthorTrailer) ||
      trailers.includes(reportExpectation.coAuthorTrailer);

    args.checks.push({
      name: 'report:commit-co-author-trailer',
      passed: hasTrailer,
      detail: hasTrailer
        ? `found "${reportExpectation.coAuthorTrailer}"`
        : `missing "${reportExpectation.coAuthorTrailer}" in commit message or trailers`,
    });
  }

  if (reportExpectation.isolation) {
    const isolation = getObject(report, ['isolation']) ?? {};
    const expectedIsolation = reportExpectation.isolation;

    if (expectedIsolation.allowNetwork !== undefined) {
      pushEqualityCheck(args.checks, {
        name: 'report:isolation:allow-network',
        actual: getValue(isolation, ['allowNetwork']),
        expected: expectedIsolation.allowNetwork,
      });
    }

    if (expectedIsolation.allowGitHub !== undefined) {
      pushEqualityCheck(args.checks, {
        name: 'report:isolation:allow-github',
        actual: getValue(isolation, ['allowGitHub']),
        expected: expectedIsolation.allowGitHub,
      });
    }

    if (expectedIsolation.allowLinear !== undefined) {
      pushEqualityCheck(args.checks, {
        name: 'report:isolation:allow-linear',
        actual: getValue(isolation, ['allowLinear']),
        expected: expectedIsolation.allowLinear,
      });
    }

    if (expectedIsolation.allowLiteLLM !== undefined) {
      pushEqualityCheck(args.checks, {
        name: 'report:isolation:allow-litellm',
        actual: getValue(isolation, ['allowLiteLLM']),
        expected: expectedIsolation.allowLiteLLM,
      });
    }

    if (expectedIsolation.externalCallsCount !== undefined) {
      const externalCalls = Array.isArray(getValue(isolation, ['externalCalls']))
        ? (getValue(isolation, ['externalCalls']) as unknown[])
        : [];
      pushEqualityCheck(args.checks, {
        name: 'report:isolation:external-calls-count',
        actual: externalCalls.length,
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

async function readJson(path: string): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function getValue(source: unknown, path: string[]): unknown {
  let current: unknown = source;
  for (const segment of path) {
    if (!current || typeof current !== 'object' || !(segment in current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function getObject(source: unknown, path: string[]): Record<string, unknown> | null {
  const value = getValue(source, path);
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(source: unknown, paths: string[][]): string | undefined {
  for (const path of paths) {
    const value = getValue(source, path);
    if (typeof value === 'string') {
      return value;
    }
  }
  return undefined;
}

function readNullableString(source: unknown, paths: string[][]): string | null | undefined {
  for (const path of paths) {
    const value = getValue(source, path);
    if (typeof value === 'string' || value === null) {
      return value;
    }
  }
  return undefined;
}

function readStringList(source: unknown, paths: string[][]): string[] {
  for (const path of paths) {
    const value = getValue(source, path);
    if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
      return [...value];
    }
  }
  return [];
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
