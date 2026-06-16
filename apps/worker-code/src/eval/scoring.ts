import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CommandResult } from '../types.js';
import type { EvalCheck, EvalScenario } from './types.js';

type ExtendedExpected = EvalScenario['expected'] & {
  forbiddenContent?: Array<{ path: string; includes: string }>;
  reportExpectations?: Array<{
    path: string;
    verdict: string;
    autoMerge: string;
    blockReason?: string;
    reviewOutcome?: string;
    reviewRounds?: number;
  }>;
  commitExpectations?: Array<{
    path: string;
    authorName?: string;
    authorEmail?: string;
    includes?: string[];
  }>;
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
  const extendedExpected = args.scenario.expected as ExtendedExpected;

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

  for (const requirement of extendedExpected.forbiddenContent ?? []) {
    const content = await readText(join(args.workdir, requirement.path));
    checks.push({
      name: `forbidden-content:${requirement.path}`,
      passed: !content.includes(requirement.includes),
      detail: content.includes(requirement.includes)
        ? `found forbidden "${requirement.includes}"`
        : `did not find forbidden "${requirement.includes}"`,
    });
  }

  for (const expectation of extendedExpected.reportExpectations ?? []) {
    const content = await readText(join(args.workdir, expectation.path));
    pushContentCheck(checks, expectation.path, content, 'Verdict', expectation.verdict);
    pushContentCheck(checks, expectation.path, content, 'Auto-merge', expectation.autoMerge);

    if (expectation.blockReason) {
      pushContentCheck(checks, expectation.path, content, 'Block reason', expectation.blockReason);
    }

    if (expectation.reviewOutcome) {
      pushContentCheck(checks, expectation.path, content, 'Review outcome', expectation.reviewOutcome);
    }

    if (typeof expectation.reviewRounds === 'number') {
      pushContentCheck(
        checks,
        expectation.path,
        content,
        'Review rounds',
        String(expectation.reviewRounds),
      );
    }
  }

  for (const expectation of extendedExpected.commitExpectations ?? []) {
    const content = await readText(join(args.workdir, expectation.path));

    if (expectation.authorName || expectation.authorEmail) {
      const author = `${expectation.authorName || ''} <${expectation.authorEmail || ''}>`;
      checks.push({
        name: `commit-author:${expectation.path}`,
        passed: content.includes(author),
        detail: content.includes(author) ? `found author "${author}"` : `missing author "${author}"`,
      });
    }

    for (const required of expectation.includes ?? []) {
      checks.push({
        name: `commit-content:${expectation.path}`,
        passed: content.includes(required),
        detail: content.includes(required) ? `found "${required}"` : `missing "${required}"`,
      });
    }
  }

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

function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function pushContentCheck(
  checks: EvalCheck[],
  path: string,
  content: string,
  label: string,
  expected: string,
): void {
  const required = `${label}: ${expected}`;
  checks.push({
    name: `report-content:${path}:${label.toLowerCase().replace(/\s+/g, '-')}`,
    passed: content.includes(required),
    detail: content.includes(required) ? `found "${required}"` : `missing "${required}"`,
  });
}

async function readText(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return '';
  }
}

function tail(value: string, max = 300): string {
  const trimmed = value.trim();
  return trimmed.length > max ? trimmed.slice(-max) : trimmed;
}
