import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { checkCommand } from '../executor/commandPolicy.js';
import type { CommandResult } from '../types.js';

const DEFAULT_ALLOWLIST = ['node', 'npm', 'pnpm', 'corepack', 'git'];
const BLOCKED_ENV_VARS = [
  'GITHUB_TOKEN',
  'GH_TOKEN',
  'LINEAR_API_KEY',
  'LINEAR_TOKEN',
  'OPENAI_API_KEY',
  'LITELLM_API_KEY',
  'LITELLM_BASE_URL',
  'LITELLM_URL',
  'PRODUCTION_API_URL',
  'PROD_API_URL',
];

export function runShell(command: string, cwd: string): Promise<CommandResult> {
  const start = Date.now();
  return new Promise((resolve) => {
    const env = { ...process.env };
    for (const name of BLOCKED_ENV_VARS) {
      delete env[name];
    }
    env.EVAL_OFFLINE = '1';

    const child = spawn('bash', ['-lc', command], {
      cwd,
      env,
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

export async function writeFiles(root: string, files: Record<string, string>): Promise<void> {
  for (const [path, content] of Object.entries(files)) {
    const fullPath = join(root, path);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, content);
  }
}

export async function writeFileList(
  root: string,
  files: { path: string; content: string }[],
): Promise<string[]> {
  const out: string[] = [];
  for (const file of files) {
    await writeFiles(root, { [file.path]: file.content });
    out.push(file.path);
  }
  return out;
}

export async function initRepo(workdir: string, branch = 'main'): Promise<void> {
  for (const command of [
    'git init',
    `git checkout -b ${branch}`,
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

export async function applyCandidate(
  workdir: string,
  candidate: { files: Record<string, string>; delete: string[] },
): Promise<void> {
  await writeFiles(workdir, candidate.files);
  for (const path of candidate.delete) {
    await rm(join(workdir, path), { recursive: true, force: true });
  }
}

export async function runCommands(workdir: string, commands: string[]): Promise<CommandResult[]> {
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

export async function listChangedFiles(workdir: string): Promise<string[]> {
  const result = await runShell('git status --porcelain --untracked-files=all', workdir);
  if (result.exitCode !== 0) return [];
  return result.stdout
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => line.slice(3).trim())
    .sort();
}
