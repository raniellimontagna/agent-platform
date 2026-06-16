import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CommandResult } from '../types.js';
import type { EvalCheck, EvalScenario } from './types.js';

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
