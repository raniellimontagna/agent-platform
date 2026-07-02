import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { type EvalScenario, evalScenarioSchema } from './types.js';

export async function loadScenarios(fixturesDir: string): Promise<EvalScenario[]> {
  const entries = await readdir(fixturesDir, { withFileTypes: true });
  const scenarios: EvalScenario[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const raw = await readFile(join(fixturesDir, entry.name, 'scenario.json'), 'utf8');
    scenarios.push(evalScenarioSchema.parse(normalizeScenarioFixture(JSON.parse(raw))));
  }
  return scenarios.sort((a, b) => a.id.localeCompare(b.id));
}

export function normalizeScenarioFixture(raw: unknown): unknown {
  const record = asRecord(raw);
  if (!record) return raw;

  const inputs = asRecord(record.inputs);
  const fixtures = asRecord(record.fixtures);
  const rawExpected = asRecord(record.expected);
  const rawReview = asRecord(record.review);

  const id =
    readString(record, ['id']) ??
    readString(record, ['scenarioId']) ??
    readString(inputs, ['id', 'scenarioId']) ??
    readString(fixtures, ['id', 'scenarioId']);

  const repo =
    asRecord(record.repo) ??
    asRecord(inputs?.repo) ??
    asRecord(fixtures?.repo) ??
    normalizeRepoFromFixtureSources(inputs, fixtures);

  const normalized = {
    ...record,
    ...(id ? { id } : {}),
    version:
      readString(record, ['version']) ??
      readString(record, ['schemaVersion']) ??
      readString(inputs, ['version']) ??
      readString(fixtures, ['version']) ??
      record.version,
    title:
      readString(record, ['title']) ??
      readString(inputs, ['title']) ??
      readString(fixtures, ['title']) ??
      record.title,
    repo: repo ?? record.repo,
    candidate:
      record.candidate ?? inputs?.candidate ?? fixtures?.candidate ?? normalizeCandidate(fixtures),
    commands: record.commands ?? inputs?.commands ?? fixtures?.commands ?? record.commands,
    workerDryRun:
      record.workerDryRun ?? inputs?.workerDryRun ?? fixtures?.workerDryRun ?? record.workerDryRun,
    expected: normalizeExpectedFixture(rawExpected, rawReview, record),
  };

  return normalized;
}

function normalizeExpectedFixture(
  expected: Record<string, unknown> | undefined,
  review: Record<string, unknown> | undefined,
  root: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!expected && !review) return expected;

  const expectedReview = asRecord(expected?.review);
  const expectedAutoMerge = asRecord(expected?.autoMerge);
  const expectedCritic = asRecord(expected?.critic);
  const expectedCommit = asRecord(expected?.commit);
  const expectedIsolation = asRecord(expected?.isolation);
  const rootIsolation = asRecord(root.isolation);

  return {
    ...expected,
    review: {
      ...expectedReview,
      verdict:
        readString(expectedReview, ['verdict', 'status']) ??
        readString(review, ['verdict', 'status']) ??
        readString(expected, ['finalVerdict', 'verdict']),
      outcome:
        readString(expectedReview, ['outcome', 'action']) ??
        readString(review, ['outcome', 'action']) ??
        readString(expected, ['reviewOutcome']),
    },
    autoMerge: {
      ...expectedAutoMerge,
      enabled:
        readBooleanLike(expectedAutoMerge, ['enabled', 'expected']) ??
        readBooleanLike(expected, ['autoMergeExpected']),
      blockReason:
        readString(expectedAutoMerge, ['blockReason']) ?? readString(expected, ['blockReason']),
    },
    critic: {
      ...expectedCritic,
      rounds:
        readNumberLike(expectedCritic, ['rounds']) ?? readNumberLike(expected, ['criticRounds']),
      maxRounds:
        readNumberLike(expectedCritic, ['maxRounds']) ??
        readNumberLike(expected, ['maxCriticRounds']) ??
        readNumberLike(root, ['agentMaxReviewRounds']),
    },
    commit: {
      ...expectedCommit,
      requiresRef:
        readBooleanLike(expectedCommit, ['requiresRef']) ??
        readBooleanLike(expected, ['commitRequiresRef']),
      requiresCoAuthoredBy:
        readBooleanLike(expectedCommit, ['requiresCoAuthoredBy']) ??
        readBooleanLike(expected, ['commitRequiresCoAuthoredBy']),
      authorName:
        readString(expectedCommit, ['authorName']) ?? readString(expected, ['commitAuthorName']),
      authorEmail:
        readString(expectedCommit, ['authorEmail']) ?? readString(expected, ['commitAuthorEmail']),
    },
    isolation: {
      ...rootIsolation,
      ...expectedIsolation,
      allowNetwork:
        readBooleanLike(expectedIsolation, ['allowNetwork']) ??
        readBooleanLike(rootIsolation, ['allowNetwork']),
      allowGitHub:
        readBooleanLike(expectedIsolation, ['allowGitHub']) ??
        readBooleanLike(rootIsolation, ['allowGitHub']),
      allowLinear:
        readBooleanLike(expectedIsolation, ['allowLinear']) ??
        readBooleanLike(rootIsolation, ['allowLinear']),
      allowLiteLLM:
        readBooleanLike(expectedIsolation, ['allowLiteLLM']) ??
        readBooleanLike(rootIsolation, ['allowLiteLLM']),
      externalCallsEmpty:
        readBooleanLike(expectedIsolation, ['externalCallsEmpty']) ??
        (Array.isArray(expectedIsolation?.externalCalls)
          ? expectedIsolation.externalCalls.length === 0
          : undefined),
    },
  };
}

function normalizeRepoFromFixtureSources(
  inputs: Record<string, unknown> | undefined,
  fixtures: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  const repo = asRecord(inputs?.repo) ?? asRecord(fixtures?.repo);
  if (repo) return repo;

  const files = Array.isArray(fixtures?.files)
    ? fixtures.files
    : Array.isArray(inputs?.files)
      ? inputs.files
      : undefined;

  if (!files) return undefined;
  return { files };
}

function normalizeCandidate(fixtures: Record<string, unknown> | undefined): unknown {
  if (!fixtures) return undefined;
  if (fixtures.candidate !== undefined) return fixtures.candidate;
  if (Array.isArray(fixtures.patch)) return fixtures.patch;
  if (typeof fixtures.patch === 'string') return fixtures.patch;
  return undefined;
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
