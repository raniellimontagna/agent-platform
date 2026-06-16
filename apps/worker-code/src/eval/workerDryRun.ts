import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { LlmClient } from '@agent-platform/llm';
import type { Logger } from 'pino';
import { applyFix, generateAndApplyCode } from '../executor/codegen.js';
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

  const llmResponses = dryRun.llmResponses ?? [];
  const scriptedLlm = llmResponses.length > 0 ? fakeLlm(llmResponses) : undefined;
  const generated = scriptedLlm
    ? await generateAndApplyCode({
        llm: scriptedLlm,
        dir: args.workdir,
        title: args.scenario.title,
        description: args.scenario.description,
        plan: dryRun.plan,
        log: noopLog,
      })
    : undefined;

  let filesChanged = generated
    ? generated.filesChanged
    : await writeFileList(args.workdir, dryRun.files);
  let commands = await runCommands(args.workdir, args.scenario.commands);
  let fixAttempts = 0;

  while (!commandsPassed(commands, args.scenario.commands) && fixAttempts < dryRun.maxFixAttempts) {
    fixAttempts++;
    await writeFile(
      join(args.artifactDir, `failure-${fixAttempts}.txt`),
      summarizeFailureTail(commands),
    );
    if (scriptedLlm) {
      const fix = await applyFix({
        llm: scriptedLlm,
        dir: args.workdir,
        filesChanged,
        failureTail: summarizeFailureTail(commands),
        plan: dryRun.plan,
        title: args.scenario.title,
        log: noopLog,
      });
      filesChanged = [...new Set([...filesChanged, ...fix.filesChanged])];
    } else {
      const fix = dryRun.fixes[fixAttempts - 1];
      if (!fix) break;
      filesChanged = [
        ...new Set([...filesChanged, ...(await writeFileList(args.workdir, fix.files))]),
      ];
    }
    commands = await runCommands(args.workdir, args.scenario.commands);
  }

  const prTitle = generated?.prTitle ?? dryRun.prTitle;
  const summary = generated?.summary ?? dryRun.summary;
  const commit = await commitLocal(args.workdir, prTitle, summary);
  const diff = (await runShell('git diff main...HEAD', args.workdir)).stdout;
  const result: WorkerDryRunResult = {
    branch: dryRun.branch,
    commitSha: commit,
    commands,
    diff,
    filesChanged,
    fixAttempts,
    prTitle,
    summary,
    pushed: false,
  };
  await writeFile(
    join(args.artifactDir, 'worker-dry-run.json'),
    `${JSON.stringify(result, null, 2)}\n`,
  );
  return result;
}

function fakeLlm(responses: string[]): LlmClient {
  let index = 0;
  return {
    async complete() {
      const response = responses[Math.min(index, responses.length - 1)];
      index++;
      return response ?? '{}';
    },
  };
}

const noopLog = {
  info() {},
  warn() {},
  error() {},
} as unknown as Logger;

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
