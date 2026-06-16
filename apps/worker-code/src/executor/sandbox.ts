import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { Env } from '../env.js';
import type { CommandResult } from '../types.js';
import { runCommand } from './worktree.js';

export interface SandboxCommandArgs {
  command: string;
  cwd: string;
  runId: string;
  env: Pick<
    Env,
    | 'AGENT_SANDBOX_BACKEND'
    | 'AGENT_SANDBOX_IMAGE'
    | 'AGENT_SANDBOX_NETWORK'
    | 'AGENT_SANDBOX_CPUS'
    | 'AGENT_SANDBOX_MEMORY'
    | 'AGENT_SANDBOX_PIDS_LIMIT'
  >;
}

/** Executa comando de validação no backend configurado para o sandbox. */
export function runSandboxedCommand(args: SandboxCommandArgs): Promise<CommandResult> {
  if (args.env.AGENT_SANDBOX_BACKEND === 'process') {
    return runCommand(args.command, args.cwd);
  }
  return runDockerCommand(args);
}

export function buildDockerRunArgs(args: SandboxCommandArgs): string[] {
  const name = `agent-job-${safeName(args.runId)}-${randomUUID().slice(0, 8)}`;
  return [
    'run',
    '--rm',
    '--name',
    name,
    '--network',
    args.env.AGENT_SANDBOX_NETWORK,
    '--cpus',
    String(args.env.AGENT_SANDBOX_CPUS),
    '--memory',
    args.env.AGENT_SANDBOX_MEMORY,
    '--pids-limit',
    String(args.env.AGENT_SANDBOX_PIDS_LIMIT),
    '--workdir',
    args.cwd,
    '--volume',
    `${args.cwd}:${args.cwd}`,
    '--env',
    'CI=true',
    args.env.AGENT_SANDBOX_IMAGE,
    'bash',
    '-lc',
    args.command,
  ];
}

function runDockerCommand(args: SandboxCommandArgs): Promise<CommandResult> {
  const start = Date.now();
  const dockerArgs = buildDockerRunArgs(args);
  return new Promise((resolve) => {
    const child = spawn('docker', dockerArgs);

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (err) => {
      resolve({
        command: args.command,
        exitCode: 127,
        stdout,
        stderr: String(err),
        durationMs: Date.now() - start,
      });
    });

    child.on('close', (code) => {
      resolve({
        command: args.command,
        exitCode: code ?? -1,
        stdout,
        stderr,
        durationMs: Date.now() - start,
      });
    });
  });
}

function safeName(value: string): string {
  const safe = value
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return safe.slice(0, 40) || 'run';
}
