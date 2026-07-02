import type { CommandResult } from '../types.js';
import type { EvalResult, EvalScenario } from './types.js';
import type { WorkerDryRunResult } from './workerDryRun.js';

export function createHarnessChecks(
  scenario: EvalScenario,
  result: {
    changedFiles: string[];
    commands: CommandResult[];
    dryRun?: WorkerDryRunResult;
  },
): EvalResult['checks'] {
  const expectations = extractScenarioExpectations(scenario);
  const actual = extractActualEvaluation(result.dryRun);
  const checks: EvalResult['checks'] = [];

  if (expectations.verdict) {
    checks.push({
      passed: actual.verdict === expectations.verdict,
      name: 'eval verdict',
      detail:
        actual.verdict === expectations.verdict
          ? expectations.verdict
          : `expected ${expectations.verdict}; actual ${actual.verdict ?? '(missing)'}`,
    });
  }

  if (expectations.reviewOutcome) {
    checks.push({
      passed: actual.reviewOutcome === expectations.reviewOutcome,
      name: 'review outcome',
      detail:
        actual.reviewOutcome === expectations.reviewOutcome
          ? expectations.reviewOutcome
          : `expected ${expectations.reviewOutcome}; actual ${actual.reviewOutcome ?? '(missing)'}`,
    });
  }

  if (expectations.autoMergeExpected !== undefined) {
    checks.push({
      passed: actual.autoMergeExpected === expectations.autoMergeExpected,
      name: 'auto-merge expectation',
      detail:
        actual.autoMergeExpected === expectations.autoMergeExpected
          ? expectations.autoMergeExpected
            ? 'yes'
            : 'no'
          : `expected ${expectations.autoMergeExpected ? 'yes' : 'no'}; actual ${formatBoolean(actual.autoMergeExpected)}`,
    });
  }

  if (expectations.blockReason !== undefined) {
    checks.push({
      passed: normalizeText(actual.blockReason) === normalizeText(expectations.blockReason),
      name: 'auto-merge block reason',
      detail:
        normalizeText(actual.blockReason) === normalizeText(expectations.blockReason)
          ? expectations.blockReason || '(none)'
          : `expected ${expectations.blockReason || '(none)'}; actual ${actual.blockReason || '(missing)'}`,
    });
  }

  if (expectations.maxCriticRounds !== undefined) {
    const rounds = actual.criticRounds;
    const passed = typeof rounds === 'number' && rounds <= expectations.maxCriticRounds;
    checks.push({
      passed,
      name: 'critic rounds limit',
      detail:
        typeof rounds === 'number'
          ? `${rounds}/${expectations.maxCriticRounds}`
          : `expected <= ${expectations.maxCriticRounds}; actual (missing)`,
    });
  }

  if (expectations.criticRounds !== undefined) {
    const rounds = actual.criticRounds;
    checks.push({
      passed: rounds === expectations.criticRounds,
      name: 'critic rounds',
      detail:
        rounds === expectations.criticRounds
          ? String(expectations.criticRounds)
          : `expected ${expectations.criticRounds}; actual ${rounds ?? '(missing)'}`,
    });
  }

  if (expectations.commitRequiresRef !== undefined) {
    const hasRef = actual.commitMessage?.includes('Ref:') ?? false;
    checks.push({
      passed: hasRef === expectations.commitRequiresRef,
      name: 'commit Ref trailer',
      detail:
        hasRef === expectations.commitRequiresRef
          ? hasRef
            ? 'present'
            : 'not required'
          : `expected ${expectations.commitRequiresRef ? 'present' : 'absent'}; actual ${hasRef ? 'present' : 'missing'}`,
    });
  }

  if (expectations.commitRequiresCoAuthoredBy !== undefined) {
    const hasTrailer =
      actual.commitMessage?.includes('Co-authored-by: Codex <noreply@openai.com>') ?? false;
    checks.push({
      passed: hasTrailer === expectations.commitRequiresCoAuthoredBy,
      name: 'commit Co-authored-by trailer',
      detail:
        hasTrailer === expectations.commitRequiresCoAuthoredBy
          ? hasTrailer
            ? 'present'
            : 'not required'
          : `expected ${expectations.commitRequiresCoAuthoredBy ? 'present' : 'absent'}; actual ${hasTrailer ? 'present' : 'missing'}`,
    });
  }

  if (expectations.commitAuthorName || expectations.commitAuthorEmail) {
    const actualAuthor = formatAuthor(actual.commitAuthorName, actual.commitAuthorEmail);
    const expectedAuthor = formatAuthor(
      expectations.commitAuthorName,
      expectations.commitAuthorEmail,
    );
    checks.push({
      passed:
        normalizeText(actual.commitAuthorName) === normalizeText(expectations.commitAuthorName) &&
        normalizeText(actual.commitAuthorEmail) === normalizeText(expectations.commitAuthorEmail),
      name: 'commit author',
      detail:
        actualAuthor === expectedAuthor
          ? actualAuthor
          : `expected ${expectedAuthor}; actual ${actualAuthor}`,
    });
  }

  if (expectations.isolation) {
    const isolationPassed =
      (!expectations.isolation.allowNetwork || actual.allowNetwork === false) &&
      (!expectations.isolation.allowGitHub || actual.allowGitHub === false) &&
      (!expectations.isolation.allowLinear || actual.allowLinear === false) &&
      (!expectations.isolation.allowLiteLLM || actual.allowLiteLLM === false) &&
      (!expectations.isolation.externalCallsEmpty || actual.externalCalls.length === 0);
    checks.push({
      passed: isolationPassed,
      name: 'isolation policy',
      detail: `allowNetwork=${formatBoolean(actual.allowNetwork)}; allowGitHub=${formatBoolean(actual.allowGitHub)}; allowLinear=${formatBoolean(actual.allowLinear)}; allowLiteLLM=${formatBoolean(actual.allowLiteLLM)}; externalCalls=${actual.externalCalls.length}`,
    });
  }

  return checks;
}

export function combineScores(baseScore: number, checks: EvalResult['checks']): number {
  if (checks.length === 0) return baseScore;
  const complianceScore = Math.round(
    (checks.filter((check) => check.passed).length / checks.length) * 100,
  );
  return Math.min(baseScore, complianceScore);
}

function extractScenarioExpectations(scenario: EvalScenario): {
  verdict?: string;
  reviewOutcome?: string;
  autoMergeExpected?: boolean;
  blockReason?: string;
  criticRounds?: number;
  maxCriticRounds?: number;
  commitRequiresRef?: boolean;
  commitRequiresCoAuthoredBy?: boolean;
  commitAuthorName?: string;
  commitAuthorEmail?: string;
  isolation?: {
    allowNetwork: boolean;
    allowGitHub: boolean;
    allowLinear: boolean;
    allowLiteLLM: boolean;
    externalCallsEmpty: boolean;
  };
} {
  const record = asRecord(scenario);
  const expected = asRecord(record?.expected);
  const review = asRecord(expected?.review);
  const autoMerge = asRecord(expected?.autoMerge);
  const critic = asRecord(expected?.critic);
  const commit = asRecord(expected?.commit);
  const isolation = asRecord(expected?.isolation);

  const allowNetwork = readBooleanLike(isolation, ['allowNetwork']);
  const allowGitHub = readBooleanLike(isolation, ['allowGitHub']);
  const allowLinear = readBooleanLike(isolation, ['allowLinear']);
  const allowLiteLLM = readBooleanLike(isolation, ['allowLiteLLM']);
  const externalCallsEmpty =
    readBooleanLike(isolation, ['externalCallsEmpty']) ??
    (Array.isArray(isolation?.externalCalls) ? isolation.externalCalls.length === 0 : undefined);

  const hasIsolationExpectation =
    allowNetwork !== undefined ||
    allowGitHub !== undefined ||
    allowLinear !== undefined ||
    allowLiteLLM !== undefined ||
    externalCallsEmpty !== undefined;
  const commitPolicyStrings = [
    ...readStringList(commit, ['messageIncludes']),
    ...readStringList(commit, ['trailersInclude']),
    ...readStringList(commit, ['mustInclude']),
  ];

  return {
    verdict:
      readString(review, ['verdict', 'status']) ??
      readString(expected, ['finalVerdict', 'verdict']),
    reviewOutcome:
      readString(review, ['reviewOutcome', 'outcome', 'action']) ??
      readString(expected, ['reviewOutcome']),
    autoMergeExpected:
      readBooleanLike(review, ['autoMergeEligible']) ??
      readBooleanLike(autoMerge, ['enabled', 'expected']) ??
      readBooleanLike(expected, ['autoMergeExpected']),
    blockReason:
      readString(review, ['blockReason']) ??
      readString(autoMerge, ['blockReason', 'reason']) ??
      readString(expected, ['blockReason']),
    criticRounds:
      readNumberLike(review, ['criticRounds']) ??
      readNumberLike(critic, ['rounds', 'roundsExecuted']) ??
      readNumberLike(expected, ['criticRounds']),
    maxCriticRounds:
      readNumberLike(review, ['maxCriticRounds']) ??
      readNumberLike(critic, ['maxRounds']) ??
      readNumberLike(expected, ['maxCriticRounds']) ??
      readNumberLike(record, ['agentMaxReviewRounds']),
    commitRequiresRef:
      readBooleanLike(commit, ['requiresRef', 'containsRef']) ??
      readBooleanLike(expected, ['commitRequiresRef']) ??
      commitPolicyStrings.some((value) => value.includes('Ref:')),
    commitRequiresCoAuthoredBy:
      readBooleanLike(commit, ['requiresCoAuthoredBy', 'containsCoAuthoredBy']) ??
      readBooleanLike(expected, ['commitRequiresCoAuthoredBy']) ??
      commitPolicyStrings.some((value) => value.includes('Co-authored-by:')),
    commitAuthorName:
      readString(asRecord(commit?.author), ['name']) ??
      readString(commit, ['authorName']) ??
      readString(expected, ['commitAuthorName']),
    commitAuthorEmail:
      readString(asRecord(commit?.author), ['email']) ??
      readString(commit, ['authorEmail']) ??
      readString(expected, ['commitAuthorEmail']),
    isolation: hasIsolationExpectation
      ? {
          allowNetwork: allowNetwork ?? true,
          allowGitHub: allowGitHub ?? true,
          allowLinear: allowLinear ?? true,
          allowLiteLLM: allowLiteLLM ?? true,
          externalCallsEmpty: externalCallsEmpty ?? false,
        }
      : undefined,
  };
}

function extractActualEvaluation(dryRun?: WorkerDryRunResult): {
  verdict?: string;
  reviewOutcome?: string;
  autoMergeExpected?: boolean;
  blockReason?: string;
  criticRounds?: number;
  maxCriticRounds?: number;
  commitMessage?: string;
  commitAuthorName?: string;
  commitAuthorEmail?: string;
  allowNetwork?: boolean;
  allowGitHub?: boolean;
  allowLinear?: boolean;
  allowLiteLLM?: boolean;
  externalCalls: unknown[];
} {
  const record = asRecord(dryRun);
  const externalCalls = Array.isArray(record?.externalCalls) ? record.externalCalls : [];
  return {
    verdict:
      readString(record, ['reviewVerdict', 'verdict', 'finalVerdict']) ??
      readString(asRecord(record?.review), ['verdict', 'status']),
    reviewOutcome:
      readString(record, ['reviewOutcome', 'reviewAction']) ??
      readString(asRecord(record?.review), ['outcome', 'action']),
    autoMergeExpected:
      readBooleanLike(record, ['expectedAutoMerge', 'autoMergeExpected', 'shouldAutoMerge']) ??
      readBooleanLike(asRecord(record?.autoMerge), ['expected', 'enabled']),
    blockReason:
      readString(record, ['autoMergeBlockReason', 'blockReason', 'blockedReason']) ??
      readString(asRecord(record?.autoMerge), ['blockReason']),
    criticRounds: readNumberLike(record, ['criticRounds', 'reviewRounds', 'criticRoundCount']),
    maxCriticRounds: readNumberLike(record, [
      'maxCriticRounds',
      'maxReviewRounds',
      'agentMaxReviewRounds',
    ]),
    commitMessage: readString(record, ['commitMessage', 'finalCommitMessage']),
    commitAuthorName: readString(record, ['commitAuthorName', 'authorName']),
    commitAuthorEmail: readString(record, ['commitAuthorEmail', 'authorEmail']),
    allowNetwork: readBooleanLike(record, ['allowNetwork']),
    allowGitHub: readBooleanLike(record, ['allowGitHub']),
    allowLinear: readBooleanLike(record, ['allowLinear']),
    allowLiteLLM: readBooleanLike(record, ['allowLiteLLM']),
    externalCalls,
  };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object') return undefined;
  return value as Record<string, unknown>;
}

function readString(
  record: Record<string, unknown> | undefined,
  keys: string[],
): string | undefined {
  if (!record) return undefined;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}

function readStringList(record: Record<string, unknown> | undefined, keys: string[]): string[] {
  if (!record) return [];
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value.filter((entry): entry is string => typeof entry === 'string');
    }
  }
  return [];
}

function readBooleanLike(
  record: Record<string, unknown> | undefined,
  keys: string[],
): boolean | undefined {
  if (!record) return undefined;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      if (value === 'true') return true;
      if (value === 'false') return false;
    }
  }
  return undefined;
}

function readNumberLike(
  record: Record<string, unknown> | undefined,
  keys: string[],
): number | undefined {
  if (!record) return undefined;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function formatBoolean(value: boolean | undefined): string {
  if (value === true) return 'yes';
  if (value === false) return 'no';
  return '(missing)';
}

function normalizeText(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function formatAuthor(name?: string, email?: string): string {
  return `${name ?? '(unknown)'} <${email ?? '(unknown)'}>`;
}
