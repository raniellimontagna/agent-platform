import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
import type { EvalResult, EvalScenario } from './types.js';
import { type WorkerDryRunResult, runWorkerDryRun } from './workerDryRun.js';

export interface ScenarioRunnerHooks {
  createHarnessChecks: (
    scenario: EvalScenario,
    result: {
      changedFiles: string[];
      commands: CommandResult[];
      dryRun?: WorkerDryRunResult;
    },
  ) => EvalResult['checks'];
  combineScores: (baseScore: number, checks: EvalResult['checks']) => number;
}

const defaultHooks: ScenarioRunnerHooks = {
  createHarnessChecks: () => [],
  combineScores: (baseScore) => baseScore,
};

export async function runScenario(
  scenario: EvalScenario,
  artifactDir: string,
  hooks: ScenarioRunnerHooks = defaultHooks,
): Promise<EvalResult> {
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
    const harnessChecks = hooks.createHarnessChecks(scenario, {
      changedFiles,
      commands,
      dryRun,
    });
    const checks = [...scored.checks, ...harnessChecks];
    const passed = scored.passed && harnessChecks.every((check) => check.passed);
    const score = hooks.combineScores(scored.score, checks);
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
