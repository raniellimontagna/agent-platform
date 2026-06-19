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
    | 'HIGGSFIELD_HOME'
    | 'CLOUDFLARE_API_TOKEN'
    | 'CLOUDFLARE_ACCOUNT_ID'
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
    '--label',
    'agent-platform.component=sandbox',
    '--label',
    `agent-platform.run-id=${args.runId}`,
    '--label',
    `agent-platform.workdir=${args.cwd}`,
    '--security-opt',
    'no-new-privileges',
    '--cap-drop',
    'ALL',
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
    '--volume',
    `${args.env.HIGGSFIELD_HOME}:${args.env.HIGGSFIELD_HOME}`,
    '--env',
    'CI=true',
    '--env',
    `HOME=${args.env.HIGGSFIELD_HOME}`,
    '--env',
    `XDG_CONFIG_HOME=${args.env.HIGGSFIELD_HOME}/.config`,
    '--env',
    `HIGGSFIELD_HOME=${args.env.HIGGSFIELD_HOME}`,
    ...optionalEnv('CLOUDFLARE_API_TOKEN', args.env.CLOUDFLARE_API_TOKEN),
    ...optionalEnv('CLOUDFLARE_ACCOUNT_ID', args.env.CLOUDFLARE_ACCOUNT_ID),
    args.env.AGENT_SANDBOX_IMAGE,
    'bash',
    '-lc',
    args.command,
  ];
}

function optionalEnv(name: string, value: string | undefined): string[] {
  return value ? ['--env', `${name}=${value}`] : [];
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
