import { createLlmClient } from '@agent-platform/llm';
import type { Logger } from 'pino';
import { env } from '../env.js';
import { logger } from '../logger.js';
import type { CommandResult, Job, JobResult } from '../types.js';
import { applyFix, generateAndApplyCode } from './codegen.js';
import { checkCommand } from './commandPolicy.js';
import { commitAll, diffAgainst, pushBranch } from './git.js';
import { runSandboxedCommand } from './sandbox.js';
import { summarizeFailureTail } from './validation.js';
import { cleanupWorktree, prepareWorktree } from './worktree.js';

const llm = createLlmClient({
  baseUrl: env.LITELLM_BASE_URL,
  apiKey: env.LITELLM_API_KEY,
  timeoutMs: env.LLM_TIMEOUT_MS,
  maxRetries: env.LLM_MAX_RETRIES,
});

const COMMAND_ALLOWLIST = env.AGENT_COMMAND_ALLOWLIST.split(',')
  .map((b) => b.trim())
  .filter(Boolean);

/**
 * Roda um comando do job aplicando a allowlist (MAC-31). Comando bloqueado não
 * executa: devolve um CommandResult de auditoria (exitCode 126) com o motivo.
 */
async function runGuarded(
  command: string,
  dir: string,
  runId: string,
  log: Logger,
): Promise<CommandResult> {
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
  return runSandboxedCommand({ command, cwd: dir, runId, env });
}

export { summarizeFailureTail };

/**
 * Roda os comandos de validação no worktree. Para no primeiro que falhar (build
 * quebrado → não adianta testar). Devolve se passou tudo + o tail do erro p/ o fix.
 */
async function runValidation(
  cmds: string[],
  dir: string,
  runId: string,
  log: Logger,
): Promise<{ passed: boolean; results: CommandResult[]; failureTail: string }> {
  const results: CommandResult[] = [];
  for (const cmd of cmds) {
    log.info({ cmd }, 'running validation command');
    const result = await runGuarded(cmd, dir, runId, log);
    results.push(result);
    if (result.exitCode !== 0) {
      log.warn({ cmd, exitCode: result.exitCode }, 'validation failed');
      break;
    }
  }
  const passed = results.length === cmds.length && results.every((c) => c.exitCode === 0);
  return { passed, results, failureTail: summarizeFailureTail(results) };
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
    const reviseMode = Boolean(job.reviewFeedback?.trim());
    if (reviseMode) log.info('modo revisão (MAC-59): partindo da branch de trabalho');
    log.info('preparing worktree');
    const dir = await prepareWorktree({
      runId: job.runId,
      repoUrl: job.repoUrl,
      baseBranch: job.baseBranch,
      branch: job.branch,
      revise: reviseMode,
    });

    // Fluxo de code-gen (MAC-17): há plano aprovado.
    if (job.plan.trim()) {
      const gen = await generateAndApplyCode({
        llm,
        dir,
        title: job.title,
        description: job.description,
        plan: job.plan,
        lessons: job.lessons,
        reviewFeedback: job.reviewFeedback,
        log,
      });
      base.summary = gen.summary;
      base.filesChanged = gen.filesChanged;
      base.costUsd = gen.costUsd;
      base.prTitle = gen.prTitle;

      // Self-correction (fix intra-run): valida no worktree; se falhar, corrige e
      // revalida até passar ou esgotar AGENT_MAX_FIX_ATTEMPTS. Pusha o estado final
      // uma vez (best-effort mesmo se ainda falhar — humano decide no PR).
      let validation = await runValidation(job.commands, dir, job.runId, log);
      let fixAttempts = 0;
      // Acumula os arquivos tocados ao longo das tentativas — um fix pode criar um
      // arquivo novo cujo erro só aparece na revalidação seguinte; sem isso a próxima
      // tentativa releria só o conjunto original e ficaria cega a ele.
      let touched = gen.filesChanged;
      while (!validation.passed && fixAttempts < env.AGENT_MAX_FIX_ATTEMPTS) {
        fixAttempts++;
        log.info({ attempt: fixAttempts }, 'validação falhou — tentando corrigir');
        try {
          const fix = await applyFix({
            llm,
            dir,
            filesChanged: touched,
            failureTail: validation.failureTail,
            plan: job.plan,
            title: job.title,
            log,
          });
          base.costUsd = (base.costUsd ?? 0) + fix.costUsd;
          touched = [...new Set([...touched, ...fix.filesChanged])];
        } catch (err) {
          log.warn({ err, attempt: fixAttempts }, 'fix falhou — encerrando o loop');
          break;
        }
        validation = await runValidation(job.commands, dir, job.runId, log);
      }
      base.fixAttempts = fixAttempts;

      // Commit do estado final + push único.
      const message = buildCommitMessage(job, gen.prTitle, gen.summary);
      const commit = await commitAll(dir, message);
      if (!commit.committed) {
        if (reviseMode) {
          base.diff = await diffAgainst(dir, job.baseBranch);
          base.pushed = true;
          for (const r of validation.results) commands.push(r);
          base.sandbox = summarizeSandbox(commands);
          base.testsPassed = validation.passed;
          log.info({ branch: job.branch, fixAttempts }, 'review produced no commitable changes');
          log.info({ testsPassed: validation.passed, fixAttempts }, 'validation finished');
          return { ...base, status: 'succeeded' };
        }
        throw new Error('geração de código não produziu mudanças commitáveis');
      }
      base.commitSha = commit.sha;
      base.diff = await diffAgainst(dir, job.baseBranch);
      await pushBranch(dir, job.branch);
      base.pushed = true;
      log.info({ commitSha: commit.sha, branch: job.branch, fixAttempts }, 'pushed branch');

      for (const r of validation.results) commands.push(r);
      base.sandbox = summarizeSandbox(commands);
      base.testsPassed = validation.passed;
      log.info({ testsPassed: validation.passed, fixAttempts }, 'validation finished');

      return { ...base, status: 'succeeded' };
    }

    // Fluxo de validação de infra (sem plano): comandos são FATAIS (ciclo antigo).
    for (const cmd of job.commands) {
      log.info({ cmd }, 'running command');
      const result = await runGuarded(cmd, dir, job.runId, log);
      commands.push(result);
      if (result.exitCode !== 0) {
        log.warn({ cmd, exitCode: result.exitCode }, 'command failed');
        base.sandbox = summarizeSandbox(commands);
        return { ...base, status: 'failed' };
      }
    }

    base.sandbox = summarizeSandbox(commands);
    return { ...base, status: 'succeeded' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ err }, 'job failed');
    return { ...base, status: 'failed', error: message };
  } finally {
    try {
      await cleanupWorktree(job.runId);
    } catch (err) {
      log.warn({ err }, 'failed to cleanup worktree');
    }
  }
}

function summarizeSandbox(commands: CommandResult[]): JobResult['sandbox'] {
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
interface CommitCoauthor {
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
