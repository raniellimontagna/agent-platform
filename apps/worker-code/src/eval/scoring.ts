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
    caveatType?: string;
    reviewOutcome?: string;
    reviewRounds?: number;
  }>;
  commitExpectations?: Array<{
    path: string;
    authorName?: string;
    authorEmail?: string;
    ref?: string;
    coAuthoredBy?: string;
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
    const report = parseStructuredFields(content);

    pushStructuredFieldCheck(checks, expectation.path, report, 'Verdict', expectation.verdict);
    pushStructuredFieldCheck(checks, expectation.path, report, 'Auto-merge', expectation.autoMerge);

    if (expectation.blockReason) {
      pushStructuredFieldCheck(
        checks,
        expectation.path,
        report,
        'Block reason',
        expectation.blockReason,
      );
    }

    if (expectation.caveatType) {
      pushStructuredFieldCheck(
        checks,
        expectation.path,
        report,
        'Caveat type',
        expectation.caveatType,
      );
    }

    if (expectation.reviewOutcome) {
      pushStructuredFieldCheck(
        checks,
        expectation.path,
        report,
        'Review outcome',
        expectation.reviewOutcome,
      );
    }

    if (typeof expectation.reviewRounds === 'number') {
      pushStructuredFieldCheck(
        checks,
        expectation.path,
        report,
        'Review rounds',
        String(expectation.reviewRounds),
      );
      checks.push({
        name: `report-content:${expectation.path}:review-rounds-limit`,
        passed: expectation.reviewRounds <= 3,
        detail:
          expectation.reviewRounds <= 3
            ? `review rounds stayed within limit (${expectation.reviewRounds}/3)`
            : `review rounds exceeded limit (${expectation.reviewRounds}/3)`,
      });
    }
  }

  for (const expectation of extendedExpected.commitExpectations ?? []) {
    const content = await readText(join(args.workdir, expectation.path));
    const commit = parseStructuredFields(content);

    if (expectation.authorName || expectation.authorEmail) {
      const author = `${expectation.authorName || ''} <${expectation.authorEmail || ''}>`;
      const actualAuthor = commit.get(normalizeFieldName('Author')) || '';
      checks.push({
        name: `commit-author:${expectation.path}`,
        passed: actualAuthor === author,
        detail: actualAuthor === author ? `found author "${author}"` : `expected author "${author}"; got "${actualAuthor || '(missing)'}"`,
      });
    }

    if (expectation.ref) {
      const actualRef = commit.get(normalizeFieldName('Ref')) || '';
      checks.push({
        name: `commit-ref:${expectation.path}`,
        passed: actualRef === expectation.ref,
        detail:
          actualRef === expectation.ref
            ? `found ref "${expectation.ref}"`
            : `expected ref "${expectation.ref}"; got "${actualRef || '(missing)'}"`,
      });
    }

    if (expectation.coAuthoredBy) {
      const actualCoAuthoredBy = commit.get(normalizeFieldName('Co-authored-by')) || '';
      checks.push({
        name: `commit-co-authored-by:${expectation.path}`,
        passed: actualCoAuthoredBy === expectation.coAuthoredBy,
        detail:
          actualCoAuthoredBy === expectation.coAuthoredBy
            ? `found co-author "${expectation.coAuthoredBy}"`
            : `expected co-author "${expectation.coAuthoredBy}"; got "${actualCoAuthoredBy || '(missing)'}"`,
      });
    }

    for (const required of expectation.includes ?? []) {
      checks.push({
        name: `commit-content:${expectation.path}:${slug(required)}`,
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

function pushStructuredFieldCheck(
  checks: EvalCheck[],
  path: string,
  fields: Map<string, string>,
  label: string,
  expected: string,
): void {
  const actual = fields.get(normalizeFieldName(label)) || '';
  checks.push({
    name: `report-content:${path}:${label.toLowerCase().replace(/\s+/g, '-')}`,
    passed: actual === expected,
    detail:
      actual === expected
        ? `found "${label}: ${expected}"`
        : `expected "${label}: ${expected}"; got "${actual || '(missing)'}"`,
  });
}

function parseStructuredFields(content: string): Map<string, string> {
  const fields = new Map<string, string>();

  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z][A-Za-z- ]*):\s*(.+)$/);
    if (!match) {
      continue;
    }

    const [, rawLabel, rawValue] = match;
    fields.set(normalizeFieldName(rawLabel), rawValue.trim());
  }

  return fields;
}

function normalizeFieldName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
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
