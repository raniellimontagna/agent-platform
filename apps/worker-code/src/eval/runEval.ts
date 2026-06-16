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

  if (!report.passed) {
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
  const report: EvalReport = {
    generatedAt,
    passed: results.every((result) => result.passed),
    total: results.length,
    passedCount,
    score,
    results,
  };

  await writeFile(join(artifactRoot, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(join(artifactRoot, 'report.md'), renderMarkdown(report));
  return report;
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

function renderMarkdown(report: EvalReport): string {
  const lines = [
    '# Agent Eval Report',
    '',
    `Generated at: ${report.generatedAt}`,
    `Result: ${report.passed ? 'PASS' : 'FAIL'}`,
    `Score: ${report.score}`,
    `Scenarios: ${report.passedCount}/${report.total}`,
    '',
  ];

  for (const result of report.results) {
    lines.push(`## ${result.id}: ${result.title}`);
    lines.push('');
    lines.push(`Result: ${result.passed ? 'PASS' : 'FAIL'} (${result.score})`);
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

function parseArgs(argv: string[]): { fixtures?: string; out?: string } {
  const parsed: { fixtures?: string; out?: string } = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--fixtures') parsed.fixtures = argv[++i];
    if (arg === '--out') parsed.out = argv[++i];
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
