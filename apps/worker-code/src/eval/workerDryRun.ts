import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { summarizeFailureTail } from '../executor/validation.js';
import type { CommandResult } from '../types.js';
import { runCommands, runShell, writeFileList } from './runtime.js';
import type { EvalScenario } from './types.js';

export interface WorkerDryRunResult {
  branch: string;
  commitSha?: string;
  commands: CommandResult[];
  diff: string;
  filesChanged: string[];
  fixAttempts: number;
  prTitle: string;
  summary: string;
  pushed: false;
}

export async function runWorkerDryRun(args: {
  scenario: EvalScenario;
  workdir: string;
  artifactDir: string;
}): Promise<WorkerDryRunResult> {
  const dryRun = args.scenario.workerDryRun;
  if (!dryRun) throw new Error(`scenario ${args.scenario.id} does not define workerDryRun`);

  const checkout = await runShell(`git checkout -b ${dryRun.branch}`, args.workdir);
  if (checkout.exitCode !== 0) {
    throw new Error(`failed to create dry-run branch: ${checkout.stderr || checkout.stdout}`);
  }

  let filesChanged = await writeFileList(args.workdir, dryRun.files);
  let commands = await runCommands(args.workdir, args.scenario.commands);
  let fixAttempts = 0;

  while (!commandsPassed(commands, args.scenario.commands) && fixAttempts < dryRun.maxFixAttempts) {
    const fix = dryRun.fixes[fixAttempts];
    if (!fix) break;
    fixAttempts++;
    await writeFile(
      join(args.artifactDir, `failure-${fixAttempts}.txt`),
      summarizeFailureTail(commands),
    );
    filesChanged = [
      ...new Set([...filesChanged, ...(await writeFileList(args.workdir, fix.files))]),
    ];
    commands = await runCommands(args.workdir, args.scenario.commands);
  }

  const commit = await commitLocal(args.workdir, dryRun.prTitle, dryRun.summary);
  const diff = (await runShell('git diff main...HEAD', args.workdir)).stdout;
  const result: WorkerDryRunResult = {
    branch: dryRun.branch,
    commitSha: commit,
    commands,
    diff,
    filesChanged,
    fixAttempts,
    prTitle: dryRun.prTitle,
    summary: dryRun.summary,
    pushed: false,
  };
  await writeFile(
    join(args.artifactDir, 'worker-dry-run.json'),
    `${JSON.stringify(result, null, 2)}\n`,
  );
  return result;
}

export function commandsPassed(commands: CommandResult[], expectedCommands: string[]): boolean {
  return (
    commands.length === expectedCommands.length &&
    commands.every((command) => command.exitCode === 0)
  );
}

async function commitLocal(
  workdir: string,
  title: string,
  summary: string,
): Promise<string | undefined> {
  const add = await runShell('git add -A', workdir);
  if (add.exitCode !== 0) {
    throw new Error(`git add failed: ${add.stderr || add.stdout}`);
  }

  const message = `${title}\n\n${summary}\n\nEval-Dry-Run: true`;
  const commit = await runShell(`git commit -F - <<'EOF'\n${message}\nEOF`, workdir);
  if (commit.exitCode !== 0) {
    throw new Error(`git commit failed: ${commit.stderr || commit.stdout}`);
  }

  const rev = await runShell('git rev-parse HEAD', workdir);
  return rev.stdout.trim() || undefined;
}
