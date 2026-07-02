import type { Logger } from 'pino';
import { env } from '../env.js';
import type { CommandResult, Job } from '../types.js';
import { checkCommand } from './commandPolicy.js';
import {
  type LandingQualityGateInput,
  type LandingQualityGateResult,
  runLandingQualityGate as defaultRunLandingQualityGate,
} from './landingQuality.js';
import {
  type SandboxCommandArgs,
  runSandboxedCommand as defaultRunSandboxedCommand,
} from './sandbox.js';
import { summarizeFailureTail } from './validation.js';

export interface ValidationResult {
  passed: boolean;
  results: CommandResult[];
  failureTail: string;
}

export interface JobValidationDeps {
  allowlist?: string[];
  runSandboxedCommand?: (args: SandboxCommandArgs) => Promise<CommandResult>;
  runLandingQualityGate?: (input: LandingQualityGateInput) => Promise<LandingQualityGateResult>;
}

function defaultAllowlist(): string[] {
  return env.AGENT_COMMAND_ALLOWLIST.split(',')
    .map((b) => b.trim())
    .filter(Boolean);
}

/**
 * Roda um comando do job aplicando a allowlist (MAC-31). Comando bloqueado não
 * executa: devolve um CommandResult de auditoria (exitCode 126) com o motivo.
 */
export async function runGuarded(
  command: string,
  dir: string,
  runId: string,
  log: Pick<Logger, 'warn'>,
  deps: JobValidationDeps = {},
): Promise<CommandResult> {
  const check = checkCommand(command, deps.allowlist ?? defaultAllowlist());
  if (!check.allowed) {
    log.warn({ command, reason: check.reason }, 'comando bloqueado pela allowlist');
    return {
      command,
      exitCode: 126,
      stdout: '',
      stderr: `bloqueado: ${check.reason}`,
      durationMs: 0,
    };
  }
  return (deps.runSandboxedCommand ?? defaultRunSandboxedCommand)({
    command,
    cwd: dir,
    runId,
    env,
  });
}

/**
 * Roda os comandos de validação no worktree. Para no primeiro que falhar (build
 * quebrado → não adianta testar). Devolve se passou tudo + o tail do erro p/ o fix.
 */
export async function runValidation(
  cmds: string[],
  dir: string,
  runId: string,
  log: Pick<Logger, 'info' | 'warn'>,
  deps: JobValidationDeps = {},
): Promise<ValidationResult> {
  const results: CommandResult[] = [];
  for (const cmd of cmds) {
    log.info({ cmd }, 'running validation command');
    const result = await runGuarded(cmd, dir, runId, log, deps);
    results.push(result);
    if (result.exitCode !== 0) {
      log.warn({ cmd, exitCode: result.exitCode }, 'validation failed');
      break;
    }
  }
  const passed = results.length === cmds.length && results.every((c) => c.exitCode === 0);
  return { passed, results, failureTail: summarizeFailureTail(results) };
}

export async function runLandingAwareValidation(
  job: Job,
  dir: string,
  filesChanged: string[],
  log: Pick<Logger, 'info' | 'warn'>,
  deps: JobValidationDeps = {},
): Promise<ValidationResult> {
  const quality = await (deps.runLandingQualityGate ?? defaultRunLandingQualityGate)({
    dir,
    filesChanged,
    agentKey: job.agentKey,
  });
  if (!quality.passed) {
    log.warn({ failureTail: quality.failureTail }, 'landing quality gate failed');
    return quality;
  }
  return runValidation(job.commands, dir, job.runId, log, deps);
}

export { summarizeFailureTail };
