import { createLlmClient } from '@agent-platform/llm';
import type { Logger } from 'pino';
import { env } from '../env.js';
import { logger } from '../logger.js';
import type { CommandResult, Job, JobResult } from '../types.js';
import { generateAndApplyCode } from './codegen.js';
import { checkCommand } from './commandPolicy.js';
import { commitAll, diffAgainst, pushBranch } from './git.js';
import { prepareWorktree, runCommand } from './worktree.js';

const llm = createLlmClient({ baseUrl: env.LITELLM_BASE_URL, apiKey: env.LITELLM_API_KEY });

const COMMAND_ALLOWLIST = env.AGENT_COMMAND_ALLOWLIST.split(',')
  .map((b) => b.trim())
  .filter(Boolean);

/**
 * Roda um comando do job aplicando a allowlist (MAC-31). Comando bloqueado não
 * executa: devolve um CommandResult de auditoria (exitCode 126) com o motivo.
 */
async function runGuarded(command: string, dir: string, log: Logger): Promise<CommandResult> {
  const check = checkCommand(command, COMMAND_ALLOWLIST);
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
  return runCommand(command, dir);
}

/**
 * Executa um job em sandbox: prepara worktree, gera código via `strong_coder`
 * (MAC-17), commita/pusha a branch e roda os comandos de validação. Devolve o
 * resultado ao orquestrador, que abre o Draft PR (MAC-26).
 */
export async function runJob(job: Job): Promise<JobResult> {
  const log = logger.child({ runId: job.runId, issue: job.issueIdentifier });
  const commands: CommandResult[] = [];
  const base: JobResult = { runId: job.runId, status: 'failed', branch: job.branch, commands };

  try {
    log.info('preparing worktree');
    const dir = await prepareWorktree({
      runId: job.runId,
      repoUrl: job.repoUrl,
      baseBranch: job.baseBranch,
      branch: job.branch,
    });

    // Fluxo de code-gen (MAC-17): há plano aprovado.
    if (job.plan.trim()) {
      const gen = await generateAndApplyCode({
        llm,
        dir,
        title: job.title,
        description: job.description,
        plan: job.plan,
        log,
      });
      base.summary = gen.summary;
      base.filesChanged = gen.filesChanged;

      const message = buildCommitMessage(job, gen.summary);
      const commit = await commitAll(dir, message);
      if (!commit.committed) {
        throw new Error('geração de código não produziu mudanças commitáveis');
      }
      base.commitSha = commit.sha;

      base.diff = await diffAgainst(dir, job.baseBranch);
      await pushBranch(dir, job.branch);
      base.pushed = true;
      log.info({ commitSha: commit.sha, branch: job.branch }, 'pushed branch');

      // Test Runner (MAC-29): roda a validação NÃO-fatal — testes falhando não
      // derrubam o run; viram sinal no PR/revisão para a decisão humana.
      for (const cmd of job.commands) {
        log.info({ cmd }, 'running validation command');
        const result = await runGuarded(cmd, dir, log);
        commands.push(result);
        if (result.exitCode !== 0)
          log.warn({ cmd, exitCode: result.exitCode }, 'validation failed');
      }
      base.testsPassed = commands.every((c) => c.exitCode === 0);
      log.info({ testsPassed: base.testsPassed }, 'validation finished');

      return { ...base, status: 'succeeded' };
    }

    // Fluxo de validação de infra (sem plano): comandos são FATAIS (ciclo antigo).
    for (const cmd of job.commands) {
      log.info({ cmd }, 'running command');
      const result = await runGuarded(cmd, dir, log);
      commands.push(result);
      if (result.exitCode !== 0) {
        log.warn({ cmd, exitCode: result.exitCode }, 'command failed');
        return { ...base, status: 'failed' };
      }
    }

    return { ...base, status: 'succeeded' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ err }, 'job failed');
    return { ...base, status: 'failed', error: message };
  }
}

/** Monta a mensagem de commit no padrão Conventional Commits do projeto. */
function buildCommitMessage(job: Job, summary: string): string {
  const subject = `feat(${job.issueIdentifier.toLowerCase()}): ${job.title}`.slice(0, 100);
  const body = summary ? `\n\n${summary}` : '';
  return `${subject}${body}\n\nRef: ${job.issueIdentifier}`;
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
