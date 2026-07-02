import { env } from '../env.js';
import { logger } from '../logger.js';
import type { CommandResult, Job, JobResult } from '../types.js';

export function commitErrorResult(err: unknown): CommandResult {
  const message = err instanceof Error ? err.message : String(err);
  return {
    command: 'git commit',
    exitCode: 1,
    stdout: '',
    stderr: message,
    durationMs: 0,
  };
}

export function summarizeSandbox(commands: CommandResult[]): JobResult['sandbox'] {
  const durations = commands.map((command) => command.durationMs);
  const failed = commands.find((command) => command.exitCode !== 0);
  return {
    backend: env.AGENT_SANDBOX_BACKEND,
    image: env.AGENT_SANDBOX_BACKEND === 'docker' ? env.AGENT_SANDBOX_IMAGE : undefined,
    network: env.AGENT_SANDBOX_BACKEND === 'docker' ? env.AGENT_SANDBOX_NETWORK : undefined,
    commandCount: commands.length,
    totalDurationMs: durations.reduce((sum, value) => sum + value, 0),
    maxCommandDurationMs: durations.length > 0 ? Math.max(...durations) : 0,
    failedCommand: failed?.command,
  };
}

/** Monta a mensagem de commit (Conventional Commits, título do modelo em inglês). */
export interface CommitCoauthor {
  name?: string;
  email?: string;
}

export function buildCommitMessage(
  job: Job,
  prTitle: string,
  summary: string,
  coauthor: CommitCoauthor = {
    name: env.GIT_COAUTHOR_NAME,
    email: env.GIT_COAUTHOR_EMAIL,
  },
): string {
  const subject = (
    prTitle.trim() || `chore(${job.issueIdentifier.toLowerCase()}): ${job.title}`
  ).slice(0, 100);
  const body = summary ? `\n\n${summary}` : '';
  const trailers = [`Ref: ${job.issueIdentifier}`];
  if (coauthor.name && coauthor.email) {
    trailers.push(`Co-authored-by: ${coauthor.name} <${coauthor.email}>`);
  }
  return `${subject}${body}\n\n${trailers.join('\n')}`;
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
