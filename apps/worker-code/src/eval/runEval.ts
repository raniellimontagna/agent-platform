import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderMarkdown } from './reportRenderer.js';
import { loadScenarios } from './scenarioLoader.js';
import { runScenario } from './scenarioRunner.js';
import { compareReports, formatDelta, reportSummary } from './trend.js';
import type { EvalReport, EvalResult } from './types.js';

export { renderMarkdown } from './reportRenderer.js';
export { normalizeScenarioFixture } from './scenarioLoader.js';
export { compareReports } from './trend.js';

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

async function readLatestReport(outRoot: string): Promise<EvalReport | undefined> {
  try {
    const raw = await readFile(join(outRoot, 'latest-report.json'), 'utf8');
    return JSON.parse(raw) as EvalReport;
  } catch {
    return undefined;
  }
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
