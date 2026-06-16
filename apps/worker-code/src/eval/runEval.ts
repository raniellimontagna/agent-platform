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
    scenarios.push(evalScenarioSchema.parse(JSON.parse(raw)));
  }
  return scenarios.sort((a, b) => a.id.localeCompare(b.id));
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
    const summary = summarizeResult(result);
    lines.push(`## ${result.id}: ${result.title}`);
    lines.push('');
    lines.push(`Result: ${result.passed ? 'PASS' : 'FAIL'} (${result.score})`);
    lines.push(`Verdict: ${summary.verdict}`);
    lines.push(`Expected auto-merge: ${summary.autoMerge}`);
    if (summary.blockReason) {
      lines.push(`Block reason: ${summary.blockReason}`);
    }
    lines.push(`Review flow: ${summary.reviewFlow}`);
    lines.push(`Commit policy: ${summary.commitPolicy}`);
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

function summarizeResult(result: EvalResult): {
  verdict: string;
  autoMerge: string;
  blockReason?: string;
  reviewFlow: string;
  commitPolicy: string;
} {
  const verdictCheck = findRelevantCheck(result, [
    'verdict',
    'critic verdict',
    'review verdict',
    'aprovado',
    'ressalvas',
  ]);
  const autoMergeCheck = findRelevantCheck(result, ['auto-merge', 'automerge']);
  const blockCheck = findRelevantCheckByPriority(result, [
    ['block reason', 'merge block reason'],
    ['blocked reason', 'bloqueio', 'bloquear'],
  ]);
  const reviewChecks = findRelevantChecksByPriority(result, [
    ['review flow', 'review outcome', 'review result'],
    ['critic rounds', 'review rounds', 'max rounds'],
    ['no-op', 'noop', 'recode', 'follow-up-pr', 'pull-request', 'proceed to pr'],
  ]);
  const commitChecks = findRelevantChecks(result, [
    'commit',
    'ref:',
    'co-authored-by',
    'coauthored',
  ]);

  return {
    verdict: requireDescription(
      verdictCheck,
      result.passed ? 'not explicitly reported' : 'failed without explicit verdict',
    ),
    autoMerge: requireDescription(autoMergeCheck, 'not explicitly reported'),
    blockReason: describeCheck(blockCheck),
    reviewFlow: joinCheckDetails(reviewChecks) ?? 'not explicitly reported',
    commitPolicy: joinCheckDetails(commitChecks) ?? 'not explicitly reported',
  };
}

function findRelevantCheck(
  result: EvalResult,
  keywords: string[],
): EvalResult['checks'][number] | undefined {
  return result.checks.find(
    (check) => matchesKeywords(check.name, keywords) || matchesKeywords(check.detail, keywords),
  );
}

function findRelevantCheckByPriority(
  result: EvalResult,
  keywordGroups: string[][],
): EvalResult['checks'][number] | undefined {
  for (const keywords of keywordGroups) {
    const match = findRelevantCheck(result, keywords);
    if (match) return match;
  }
  return undefined;
}

function findRelevantChecks(result: EvalResult, keywords: string[]): EvalResult['checks'] {
  return result.checks.filter(
    (check) => matchesKeywords(check.name, keywords) || matchesKeywords(check.detail, keywords),
  );
}

function findRelevantChecksByPriority(
  result: EvalResult,
  keywordGroups: string[][],
): EvalResult['checks'] {
  const matches: EvalResult['checks'] = [];
  const seen = new Set<string>();

  for (const keywords of keywordGroups) {
    for (const check of findRelevantChecks(result, keywords)) {
      const key = `${check.name}\u0000${check.detail}`;
      if (seen.has(key)) continue;
      seen.add(key);
      matches.push(check);
    }
  }

  return matches;
}

function matchesKeywords(value: string, keywords: string[]): boolean {
  const normalized = value.toLowerCase();
  return keywords.some((keyword) => normalized.includes(keyword.toLowerCase()));
}

function describeCheck(
  check?: EvalResult['checks'][number],
  fallback?: string,
): string | undefined {
  if (!check) return fallback;
  return check.detail?.trim() || `${check.passed ? 'PASS' : 'FAIL'} ${check.name}`;
}

function requireDescription(check: EvalResult['checks'][number] | undefined, fallback: string): string {
  return describeCheck(check, fallback) ?? fallback;
}

function joinCheckDetails(checks: EvalResult['checks']): string | undefined {
  if (checks.length === 0) return undefined;
  const details = checks
    .map((check) => describeCheck(check, check.name))
    .filter((detail): detail is string => Boolean(detail));
  return [...new Set(details)].join(' | ');
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
