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
    const result: EvalResult = {
      id: scenario.id,
      title: scenario.title,
      passed: scored.passed,
      score: scored.score,
      changedFiles,
      commands,
      checks: scored.checks,
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

  if (typeof record.id !== 'string' && typeof record.scenarioId === 'string') {
    return {
      ...record,
      id: record.scenarioId,
    };
  }

  return raw;
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
    findCheckDetail(checks, ['verdict']);

  const reviewOutcome =
    readString(dryRun, ['reviewOutcome', 'reviewAction']) ??
    inferReviewOutcomeFromChecks(checks);

  const autoMerge =
    readBooleanLike(dryRun, ['expectedAutoMerge', 'autoMergeExpected', 'shouldAutoMerge']) ??
    inferAutoMergeFromChecks(checks);
  const autoMergeExpected =
    autoMerge === undefined ? undefined : autoMerge ? 'yes' : 'no';

  const structuredBlockReason = readString(dryRun, [
    'autoMergeBlockReason',
    'blockReason',
    'blockedReason',
  ]);
  const inferredBlockReason =
    autoMerge === false ? findAutoMergeBlockReasonFromChecks(checks) : undefined;
  const blockReason = structuredBlockReason ?? inferredBlockReason;

  const rounds =
    readNumberLike(dryRun, ['criticRounds', 'reviewRounds', 'criticRoundCount']) ??
    undefined;
  const maxRounds =
    readNumberLike(dryRun, ['maxCriticRounds', 'maxReviewRounds', 'agentMaxReviewRounds']) ??
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
    findCheckDetail(result.checks, ['commit']);
  const authorName = readString(dryRun, ['commitAuthorName', 'authorName']);
  const authorEmail = readString(dryRun, ['commitAuthorEmail', 'authorEmail']);
  const hasRef = commitMessage?.includes('Ref:') ?? false;
  const hasCoauthored =
    commitMessage?.includes('Co-authored-by: Codex <noreply@openai.com>') ?? false;

  if (!commitMessage && !authorName && !authorEmail) return undefined;

  const parts: string[] = [];
  if (authorName || authorEmail) {
    parts.push(`author ${authorName ?? '(unknown)'} <${authorEmail ?? '(unknown)'}>`);
  }
  if (commitMessage) {
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
