import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkCommand } from '../executor/commandPolicy.js';
import type { CommandResult } from '../types.js';
import { scoreScenario } from './scoring.js';
import {
  type EvalReport,
  type EvalResult,
  type EvalScenario,
  evalScenarioSchema,
} from './types.js';

const DEFAULT_ALLOWLIST = ['node', 'npm', 'pnpm', 'corepack', 'git'];

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
    await applyCandidate(workdir, scenario);
    const commands = await runCommands(workdir, scenario.commands);
    const changedFiles = await listChangedFiles(workdir);
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
    };
    await writeFile(join(artifactDir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
    await writeFile(join(artifactDir, 'diff.patch'), (await runShell('git diff', workdir)).stdout);
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

async function writeFiles(root: string, files: Record<string, string>): Promise<void> {
  for (const [path, content] of Object.entries(files)) {
    const fullPath = join(root, path);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, content);
  }
}

async function initRepo(workdir: string): Promise<void> {
  for (const command of [
    'git init',
    'git config user.name "Eval Harness"',
    'git config user.email "eval@example.invalid"',
    'git add -A',
    'git commit -m "base fixture"',
  ]) {
    const result = await runShell(command, workdir);
    if (result.exitCode !== 0) {
      throw new Error(`failed to initialize fixture repo: ${result.stderr || result.stdout}`);
    }
  }
}

async function applyCandidate(workdir: string, scenario: EvalScenario): Promise<void> {
  await writeFiles(workdir, scenario.candidate.files);
  for (const path of scenario.candidate.delete) {
    await rm(join(workdir, path), { recursive: true, force: true });
  }
}

async function runCommands(workdir: string, commands: string[]): Promise<CommandResult[]> {
  const results: CommandResult[] = [];
  for (const command of commands) {
    const check = checkCommand(command, DEFAULT_ALLOWLIST);
    if (!check.allowed) {
      results.push({
        command,
        exitCode: 126,
        stdout: '',
        stderr: `bloqueado: ${check.reason}`,
        durationMs: 0,
      });
      break;
    }
    const result = await runShell(command, workdir);
    results.push(result);
    if (result.exitCode !== 0) break;
  }
  return results;
}

async function listChangedFiles(workdir: string): Promise<string[]> {
  const result = await runShell('git status --porcelain --untracked-files=all', workdir);
  if (result.exitCode !== 0) return [];
  return result.stdout
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => line.slice(3).trim())
    .sort();
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

function runShell(command: string, cwd: string): Promise<CommandResult> {
  const start = Date.now();
  return new Promise((resolve) => {
    const child = spawn('bash', ['-lc', command], {
      cwd,
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('close', (code) => {
      resolve({
        command,
        exitCode: code ?? -1,
        stdout,
        stderr,
        durationMs: Date.now() - start,
      });
    });
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
