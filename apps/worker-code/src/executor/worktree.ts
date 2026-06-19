import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
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
  return join(runnerWorkdir(), runId);
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
  /** MAC-59: parte da branch de trabalho já existente (revisão incremental). */
  revise?: boolean;
  /** Mantém o checkout clonado da base sem criar branch nova. */
  checkoutOnly?: boolean;
}): Promise<string> {
  const dir = worktreePath(args.runId);
  // Garante diretório limpo antes de clonar.
  await rm(dir, { recursive: true, force: true });

  // Clona a base (main) — mantém o ref local `main` p/ calcular o diff do PR.
  const clone = await runCommand(
    `git clone --depth 1 --branch ${args.baseBranch} ${args.repoUrl} ${dir}`,
    runnerWorkdir(),
  );
  if (clone.exitCode !== 0) {
    throw new Error(`git clone failed: ${clone.stderr || clone.stdout}`);
  }

  if (args.checkoutOnly) return dir;

  if (args.revise) {
    // Modo revisão: traz a branch de trabalho (já tem o código da passada
    // anterior) e faz checkout nela. Diff continua vs base (main ref local).
    const fetched = await runCommand(`git fetch --depth 1 origin ${args.branch}`, dir);
    if (fetched.exitCode !== 0) {
      throw new Error(`git fetch failed: ${fetched.stderr || fetched.stdout}`);
    }
    const checkout = await runCommand(`git checkout -b ${args.branch} FETCH_HEAD`, dir);
    if (checkout.exitCode !== 0) {
      throw new Error(`git checkout failed: ${checkout.stderr || checkout.stdout}`);
    }
  } else {
    const checkout = await runCommand(`git checkout -b ${args.branch}`, dir);
    if (checkout.exitCode !== 0) {
      throw new Error(`git checkout failed: ${checkout.stderr || checkout.stdout}`);
    }
  }

  return dir;
}

/** Remove o worktree de um run (limpeza). */
export async function cleanupWorktree(runId: string): Promise<void> {
  await rm(worktreePath(runId), { recursive: true, force: true });
}

function runnerWorkdir(): string {
  const value = process.env.RUNNER_WORKDIR;
  if (!value) throw new Error('RUNNER_WORKDIR env obrigatório');
  return value;
}
