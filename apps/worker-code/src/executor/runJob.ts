import { env } from '../env.js';
import { logger } from '../logger.js';
import type { CommandResult, Job, JobResult } from '../types.js';
import { prepareWorktree, runCommand } from './worktree.js';

/**
 * Executa um job em sandbox: prepara worktree, roda os comandos e devolve o
 * resultado ao orquestrador.
 *
 * TODO(MAC-20/Fase 4): inserir a etapa de geração de código via LiteLLM
 * (alias `strong_coder`) entre o preparo do worktree e a execução dos testes.
 */
export async function runJob(job: Job): Promise<JobResult> {
  const log = logger.child({ runId: job.runId, issue: job.issueIdentifier });
  const commands: CommandResult[] = [];

  try {
    log.info('preparing worktree');
    const dir = await prepareWorktree({
      runId: job.runId,
      repoUrl: job.repoUrl,
      baseBranch: job.baseBranch,
      branch: job.branch,
    });

    for (const cmd of job.commands) {
      log.info({ cmd }, 'running command');
      const result = await runCommand(cmd, dir);
      commands.push(result);
      if (result.exitCode !== 0) {
        log.warn({ cmd, exitCode: result.exitCode }, 'command failed');
        return { runId: job.runId, status: 'failed', branch: job.branch, commands };
      }
    }

    return { runId: job.runId, status: 'succeeded', branch: job.branch, commands };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ err }, 'job failed');
    return { runId: job.runId, status: 'failed', branch: job.branch, commands, error: message };
  }
}

/** Reporta o resultado de volta ao orquestrador. */
export async function reportResult(result: JobResult): Promise<void> {
  const url = `${env.ORCHESTRATOR_BASE_URL}/runs/${result.runId}/result`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${env.RUNNER_AUTH_TOKEN}`,
      },
      body: JSON.stringify(result),
    });
    if (!res.ok) {
      logger.error({ status: res.status, runId: result.runId }, 'failed to report result');
    }
  } catch (err) {
    logger.error({ err, runId: result.runId }, 'error reporting result to orchestrator');
  }
}
