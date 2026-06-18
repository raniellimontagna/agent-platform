import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CommandResult } from '../types.js';
import {
  applyCandidate,
  initRepo,
  listChangedFiles,
  runCommands,
  runShell,
  writeFiles,
} from './runtime.js';
import { scoreScenario } from './scoring.js';
import {
  type EvalReport,
  type EvalResult,
  type EvalScenario,
  type EvalTrend,
  evalScenarioSchema,
} from './types.js';
import { type WorkerDryRunResult, runWorkerDryRun } from './workerDryRun.js';

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const fixturesDir = resolve(args.fixtures ?? defaultFixturesDir());
  const outRoot = resolve(args.out ?? '.eval-runs');
  const report = await runEvalSuite({ fixturesDir, outRoot });

  console.log(`eval report: ${join(outRoot, report.generatedAt)}`);
  console.log(`${report.passedCount}/${report.total} scenarios passed; score ${report.score}`);
  if (report.trend?.previousScore !== undefined) {
    console.log(`score delta vs previous: ${formatDelta(report.trend.scoreDelta ?? 0)}`);
  }

  if (!report.passed || (args.failOnRegression && report.trend?.regressed)) {
    process.exitCode = 1;
  }
}

export async function runEvalSuite(args: {
  fixturesDir: string;
  outRoot: string;
}): Promise<EvalReport> {
  const generatedAt = new Date().toISOString().replace(/[:.]/g, '-');
  const artifactRoot = join(args.outRoot, generatedAt);
  await mkdir(artifactRoot, { recursive: true });

  const scenarios = await loadScenarios(args.fixturesDir);
  const results: EvalResult[] = [];
  for (const scenario of scenarios) {
    results.push(await runScenario(scenario, join(artifactRoot, scenario.id)));
  }

  const passedCount = results.filter((result) => result.passed).length;
  const score =
    results.length === 0
      ? 100
      : Math.round(results.reduce((sum, result) => sum + result.score, 0) / results.length);
  const previous = await readLatestReport(args.outRoot);
  const report: EvalReport = {
    generatedAt,
    passed: results.every((result) => result.passed),
    total: results.length,
    passedCount,
    score,
    trend: compareReports(results, score, previous),
    results,
  };

  await writeFile(join(artifactRoot, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(join(artifactRoot, 'report.md'), renderMarkdown(report));
  await writeFile(join(args.outRoot, 'latest-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(
    join(args.outRoot, 'history.jsonl'),
    `${JSON.stringify(reportSummary(report))}\n`,
    {
      flag: 'a',
    },
  );
  return report;
}

export function compareReports(
  results: EvalResult[],
  score: number,
  previous?: EvalReport,
): EvalTrend {
  if (!previous) return { regressed: false, regressedScenarios: [] };
  const previousScores = new Map(previous.results.map((result) => [result.id, result.score]));
  const regressedScenarios = results
    .filter((result) => {
      const previousScore = previousScores.get(result.id);
      return previousScore !== undefined && result.score < previousScore;
    })
    .map((result) => result.id);
  const scoreDelta = score - previous.score;
  return {
    previousGeneratedAt: previous.generatedAt,
    previousScore: previous.score,
    scoreDelta,
    regressed: scoreDelta < 0 || regressedScenarios.length > 0,
    regressedScenarios,
  };
}

async function runScenario(scenario: EvalScenario, artifactDir: string): Promise<EvalResult> {
  await mkdir(artifactDir, { recursive: true });
  const workdir = await mkdtemp(join(tmpdir(), `agent-platform-eval-${scenario.id}-`));
  try {
    await writeFiles(workdir, scenario.repo.files);
    await initRepo(workdir);
    let commands: CommandResult[];
    let dryRun: WorkerDryRunResult | undefined;
    if (scenario.workerDryRun) {
      dryRun = await runWorkerDryRun({ scenario, workdir, artifactDir });
      commands = dryRun.commands;
    } else {
      await applyCandidate(workdir, scenario.candidate);
      commands = await runCommands(workdir, scenario.commands);
    }
    const changedFiles = dryRun ? [...dryRun.filesChanged].sort() : await listChangedFiles(workdir);
    const scored = await scoreScenario({ scenario, workdir, changedFiles, commands });
    const harnessChecks = createHarnessChecks(scenario, {
      changedFiles,
      commands,
      dryRun,
    });
    const checks = [...scored.checks, ...harnessChecks];
    const passed = scored.passed && harnessChecks.every((check) => check.passed);
    const score = combineScores(scored.score, checks);
    const result: EvalResult = {
      id: scenario.id,
      title: scenario.title,
      passed,
      score,
      changedFiles,
      commands,
      checks,
      artifactDir,
      dryRun,
    };
    await writeFile(join(artifactDir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
    await writeFile(
      join(artifactDir, 'diff.patch'),
      dryRun?.diff ?? (await runShell('git diff', workdir)).stdout,
    );
    return result;
  } finally {
    await rm(workdir, { recursive: true, force: true });
  }
}

async function loadScenarios(fixturesDir: string): Promise<EvalScenario[]> {
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
    commands:
      record.commands ?? inputs?.commands ?? fixtures?.commands ?? record.commands,
    workerDryRun:
      record.workerDryRun ?? inputs?.workerDryRun ?? fixtures?.workerDryRun ?? record.workerDryRun,
    expected: normalizeExpectedFixture(rawExpected, rawReview, record),
  };

  return normalized;
}

export function renderMarkdown(report: EvalReport): string {
  const lines = [
    '# Agent Eval Report',
    '',
    `Generated at: ${report.generatedAt}`,
    `Result: ${report.passed ? 'PASS' : 'FAIL'}`,
    `Score: ${report.score}`,
    `Scenarios: ${report.passedCount}/${report.total}`,
  ];
  if (report.trend?.previousScore !== undefined) {
    lines.push(`Previous score: ${report.trend.previousScore}`);
    lines.push(`Score delta: ${formatDelta(report.trend.scoreDelta ?? 0)}`);
    lines.push(`Regressed scenarios: ${report.trend.regressedScenarios.join(', ') || '(none)'}`);
  }
  lines.push('');

  for (const result of report.results) {
    const insights = extractResultInsights(result);
    lines.push(`## ${result.id}: ${result.title}`);
    lines.push('');
    lines.push(`Result: ${result.passed ? 'PASS' : 'FAIL'} (${result.score})`);
    if (insights.verdict) lines.push(`Verdict: ${insights.verdict}`);
    if (insights.reviewOutcome) lines.push(`Review outcome: ${insights.reviewOutcome}`);
    if (insights.autoMergeExpected) lines.push(`Expected auto-merge: ${insights.autoMergeExpected}`);
    if (insights.blockReason) lines.push(`Auto-merge block reason: ${insights.blockReason}`);
    if (insights.criticRounds) lines.push(`Critic rounds: ${insights.criticRounds}`);
    if (insights.commitSummary) lines.push(`Commit policy: ${insights.commitSummary}`);
    lines.push(`Changed files: ${result.changedFiles.join(', ') || '(none)'}`);
    if (result.dryRun) {
      lines.push(`Dry-run branch: ${result.dryRun.branch}`);
      lines.push(`Dry-run pushed: ${result.dryRun.pushed}`);
      lines.push(`Dry-run fixes: ${result.dryRun.fixAttempts}`);
      lines.push(`Dry-run commit: ${result.dryRun.commitSha ?? '(none)'}`);
    }
    lines.push('');
    for (const check of result.checks) {
      lines.push(`- ${check.passed ? 'PASS' : 'FAIL'} ${check.name}: ${check.detail}`);
    }
    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}

function createHarnessChecks(
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
      detail: actualAuthor === expectedAuthor ? actualAuthor : `expected ${expectedAuthor}; actual ${actualAuthor}`,
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

  return {
    verdict:
      readString(review, ['verdict', 'status']) ?? readString(expected, ['finalVerdict', 'verdict']),
    reviewOutcome:
      readString(review, ['outcome', 'action']) ?? readString(expected, ['reviewOutcome']),
    autoMergeExpected:
      readBooleanLike(autoMerge, ['enabled', 'expected']) ??
      readBooleanLike(expected, ['autoMergeExpected']),
    blockReason:
      readString(autoMerge, ['blockReason']) ?? readString(expected, ['blockReason']),
    criticRounds:
      readNumberLike(critic, ['rounds']) ?? readNumberLike(expected, ['criticRounds']),
    maxCriticRounds:
      readNumberLike(critic, ['maxRounds']) ??
      readNumberLike(expected, ['maxCriticRounds']) ??
      readNumberLike(record, ['agentMaxReviewRounds']),
    commitRequiresRef:
      readBooleanLike(commit, ['requiresRef']) ?? readBooleanLike(expected, ['commitRequiresRef']),
    commitRequiresCoAuthoredBy:
      readBooleanLike(commit, ['requiresCoAuthoredBy']) ??
      readBooleanLike(expected, ['commitRequiresCoAuthoredBy']),
    commitAuthorName:
      readString(commit, ['authorName']) ?? readString(expected, ['commitAuthorName']),
    commitAuthorEmail:
      readString(commit, ['authorEmail']) ?? readString(expected, ['commitAuthorEmail']),
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
    criticRounds:
      readNumberLike(record, ['criticRounds', 'reviewRounds', 'criticRoundCount']),
    maxCriticRounds:
      readNumberLike(record, ['maxCriticRounds', 'maxReviewRounds', 'agentMaxReviewRounds']),
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

function combineScores(baseScore: number, checks: EvalResult['checks']): number {
  if (checks.length === 0) return baseScore;
  const complianceScore = Math.round((checks.filter((check) => check.passed).length / checks.length) * 100);
  return Math.min(baseScore, complianceScore);
}

function extractResultInsights(result: EvalResult): {
  verdict?: string;
  reviewOutcome?: string;
  autoMergeExpected?: string;
  blockReason?: string;
  criticRounds?: string;
  commitSummary?: string;
} {
  const dryRun = asRecord(result.dryRun);
  const checks = result.checks;

  const verdict =
    readString(dryRun, ['reviewVerdict', 'verdict', 'finalVerdict']) ??
    findCheckValue(checks, ['eval verdict']) ??
    findCheckDetail(checks, ['verdict']);

  const reviewOutcome =
    readString(dryRun, ['reviewOutcome', 'reviewAction']) ??
    findCheckValue(checks, ['review outcome']) ??
    inferReviewOutcomeFromChecks(checks);

  const autoMerge =
    readBooleanLike(dryRun, ['expectedAutoMerge', 'autoMergeExpected', 'shouldAutoMerge']) ??
    parseYesNo(findCheckValue(checks, ['auto-merge expectation'])) ??
    inferAutoMergeFromChecks(checks);
  const autoMergeExpected =
    autoMerge === undefined ? undefined : autoMerge ? 'yes' : 'no';

  const structuredBlockReason = readString(dryRun, [
    'autoMergeBlockReason',
    'blockReason',
    'blockedReason',
  ]);
  const inferredBlockReason =
    autoMerge === false
      ? findCheckValue(checks, ['auto-merge block reason']) ??
        findAutoMergeBlockReasonFromChecks(checks)
      : undefined;
  const blockReason = structuredBlockReason ?? inferredBlockReason;

  const rounds =
    readNumberLike(dryRun, ['criticRounds', 'reviewRounds', 'criticRoundCount']) ??
    parseNumber(findCheckValue(checks, ['critic rounds'])) ??
    parseFractionLeft(findCheckValue(checks, ['critic rounds limit']));
  const maxRounds =
    readNumberLike(dryRun, ['maxCriticRounds', 'maxReviewRounds', 'agentMaxReviewRounds']) ??
    parseFractionRight(findCheckValue(checks, ['critic rounds limit'])) ??
    undefined;
  const criticRounds =
    rounds === undefined
      ? undefined
      : maxRounds === undefined
        ? String(rounds)
        : `${rounds}/${maxRounds}`;

  const commitSummary = summarizeCommitPolicy(result, dryRun);

  return {
    verdict,
    reviewOutcome,
    autoMergeExpected,
    blockReason,
    criticRounds,
    commitSummary,
  };
}

function summarizeCommitPolicy(
  result: EvalResult,
  dryRun: Record<string, unknown> | undefined,
): string | undefined {
  const commitMessage =
    readString(dryRun, ['commitMessage', 'finalCommitMessage']) ??
    findCheckDetail(result.checks, ['commit message']);
  const authorName =
    readString(dryRun, ['commitAuthorName', 'authorName']) ??
    parseAuthorField(findCheckValue(result.checks, ['commit author']), 'name');
  const authorEmail =
    readString(dryRun, ['commitAuthorEmail', 'authorEmail']) ??
    parseAuthorField(findCheckValue(result.checks, ['commit author']), 'email');
  const explicitRefStatus = findCheckValue(result.checks, ['commit Ref trailer']);
  const explicitCoauthoredStatus = findCheckValue(result.checks, ['commit Co-authored-by trailer']);
  const hasRef = explicitRefStatus ? explicitRefStatus === 'present' : commitMessage?.includes('Ref:') ?? false;
  const hasCoauthored = explicitCoauthoredStatus
    ? explicitCoauthoredStatus === 'present'
    : commitMessage?.includes('Co-authored-by: Codex <noreply@openai.com>') ?? false;

  if (!commitMessage && !authorName && !authorEmail && !explicitRefStatus && !explicitCoauthoredStatus) {
    return undefined;
  }

  const parts: string[] = [];
  if (authorName || authorEmail) {
    parts.push(`author ${authorName ?? '(unknown)'} <${authorEmail ?? '(unknown)'}>`);
  }
  if (commitMessage || explicitRefStatus) {
    parts.push(`Ref: ${hasRef ? 'present' : 'missing'}`);
    parts.push(`Co-authored-by: ${hasCoauthored ? 'present' : 'missing'}`);
  }
  return parts.join('; ');
}

function findCheckDetail(
  checks: EvalResult['checks'],
  keywords: string[],
): string | undefined {
  const loweredKeywords = keywords.map((keyword) => keyword.toLowerCase());
  for (const check of checks) {
    const haystack = `${check.name} ${check.detail}`.toLowerCase();
    if (loweredKeywords.every((keyword) => haystack.includes(keyword))) {
      return check.detail;
    }
  }
  return undefined;
}

function findCheckValue(checks: EvalResult['checks'], keywords: string[]): string | undefined {
  const loweredKeywords = keywords.map((keyword) => keyword.toLowerCase());
  for (const check of checks) {
    const haystack = check.name.toLowerCase();
    if (loweredKeywords.every((keyword) => haystack.includes(keyword))) {
      if (!check.detail.startsWith('expected ')) return check.detail;
    }
  }
  return undefined;
}

function inferReviewOutcomeFromChecks(checks: EvalResult['checks']): string | undefined {
  const noOp = checks.find((check) => includesAll(`${check.name} ${check.detail}`, ['no-op']));
  if (noOp) return 'no-op';
  const recode = checks.find((check) => includesAll(`${check.name} ${check.detail}`, ['recode']));
  if (recode) return 'recode';
  return undefined;
}

function inferAutoMergeFromChecks(checks: EvalResult['checks']): boolean | undefined {
  for (const check of checks) {
    const haystack = `${check.name} ${check.detail}`.toLowerCase();
    if (!haystack.includes('auto-merge')) continue;

    if (
      haystack.includes('not blocked') ||
      haystack.includes('not disabled') ||
      haystack.includes('no block reason') ||
      haystack.includes('without blockers')
    ) {
      return true;
    }

    if (
      haystack.includes('blocked') ||
      haystack.includes('disabled') ||
      haystack.includes('not allowed') ||
      haystack.includes('must not merge')
    ) {
      return false;
    }

    if (
      haystack.includes('allowed') ||
      haystack.includes('enabled') ||
      haystack.includes('approved for merge') ||
      haystack.includes('can merge')
    ) {
      return true;
    }

    if (/(^|\W)yes($|\W)/.test(haystack)) return true;
    if (/(^|\W)no($|\W)/.test(haystack)) return false;
  }
  return undefined;
}

function findAutoMergeBlockReasonFromChecks(checks: EvalResult['checks']): string | undefined {
  for (const check of checks) {
    const haystack = `${check.name} ${check.detail}`.toLowerCase();
    if (!haystack.includes('auto-merge')) continue;
    if (haystack.includes('not blocked') || haystack.includes('no block reason')) continue;
    if (
      haystack.includes('blocked') ||
      haystack.includes('disabled') ||
      haystack.includes('not allowed') ||
      haystack.includes('must not merge')
    ) {
      return check.detail;
    }
  }
  return undefined;
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
      rounds: readNumberLike(expectedCritic, ['rounds']) ?? readNumberLike(expected, ['criticRounds']),
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

function includesAll(value: string, keywords: string[]): boolean {
  const lowered = value.toLowerCase();
  return keywords.every((keyword) => lowered.includes(keyword.toLowerCase()));
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

async function readLatestReport(outRoot: string): Promise<EvalReport | undefined> {
  try {
    const raw = await readFile(join(outRoot, 'latest-report.json'), 'utf8');
    return JSON.parse(raw) as EvalReport;
  } catch {
    return undefined;
  }
}

function reportSummary(report: EvalReport): Record<string, unknown> {
  return {
    generatedAt: report.generatedAt,
    passed: report.passed,
    total: report.total,
    passedCount: report.passedCount,
    score: report.score,
    previousScore: report.trend?.previousScore,
    scoreDelta: report.trend?.scoreDelta,
    regressed: report.trend?.regressed ?? false,
    regressedScenarios: report.trend?.regressedScenarios ?? [],
  };
}

function formatDelta(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

function formatBoolean(value: boolean | undefined): string {
  if (value === true) return 'yes';
  if (value === false) return 'no';
  return '(missing)';
}

function normalizeText(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function parseYesNo(value: string | undefined): boolean | undefined {
  if (value === 'yes') return true;
  if (value === 'no') return false;
  return undefined;
}

function parseNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseFractionLeft(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const match = value.match(/^(\d+)\/(\d+)$/);
  return match ? Number(match[1]) : undefined;
}

function parseFractionRight(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const match = value.match(/^(\d+)\/(\d+)$/);
  return match ? Number(match[2]) : undefined;
}

function formatAuthor(name?: string, email?: string): string {
  return `${name ?? '(unknown)'} <${email ?? '(unknown)'}>`;
}

function parseAuthorField(author: string | undefined, field: 'name' | 'email'): string | undefined {
  if (!author) return undefined;
  const match = author.match(/^(.*) <(.*)>$/);
  if (!match) return undefined;
  return field === 'name' ? match[1] : match[2];
}

function parseArgs(argv: string[]): { fixtures?: string; out?: string; failOnRegression: boolean } {
  const parsed: { fixtures?: string; out?: string; failOnRegression: boolean } = {
    failOnRegression: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--fixtures') parsed.fixtures = argv[++i];
    if (arg === '--out') parsed.out = argv[++i];
    if (arg === '--fail-on-regression') parsed.failOnRegression = true;
  }
  return parsed;
}

function defaultFixturesDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, '../../evals/fixtures');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
