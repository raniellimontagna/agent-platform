import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { env } from '../env.js';
import type { CommandResult } from '../types.js';

/** Executa um comando, capturando stdout/stderr e código de saída. */
export function runCommand(command: string, cwd: string): Promise<CommandResult> {
  const start = Date.now();
  return new Promise((resolve) => {
    const child = spawn('bash', ['-lc', command], {
      cwd,
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d) => {
      stderr += d.toString();
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

/** Diretório de worktree isolado para um run. */
export function worktreePath(runId: string): string {
  return join(env.RUNNER_WORKDIR, runId);
}

/**
 * Clona o repo numa worktree isolada e cria a branch de trabalho a partir da base.
 * Retorna o caminho do worktree pronto.
 */
export async function prepareWorktree(args: {
  runId: string;
  repoUrl: string;
  baseBranch: string;
  branch: string;
}): Promise<string> {
  const dir = worktreePath(args.runId);
  // Garante diretório limpo antes de clonar.
  await rm(dir, { recursive: true, force: true });

  const clone = await runCommand(
    `git clone --depth 1 --branch ${args.baseBranch} ${args.repoUrl} ${dir}`,
    env.RUNNER_WORKDIR,
  );
  if (clone.exitCode !== 0) {
    throw new Error(`git clone failed: ${clone.stderr || clone.stdout}`);
  }

  const checkout = await runCommand(`git checkout -b ${args.branch}`, dir);
  if (checkout.exitCode !== 0) {
    throw new Error(`git checkout failed: ${checkout.stderr || checkout.stdout}`);
  }

  return dir;
}

/** Remove o worktree de um run (limpeza). */
export async function cleanupWorktree(runId: string): Promise<void> {
  await rm(worktreePath(runId), { recursive: true, force: true });
}
