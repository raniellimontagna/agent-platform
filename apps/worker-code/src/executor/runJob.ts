import { copyFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createLlmClient } from '@agent-platform/llm';
import type { Logger } from 'pino';
import { env } from '../env.js';
import { logger } from '../logger.js';
import type { CommandResult, Job, JobResult } from '../types.js';
import { applyFix, generateAndApplyCode } from './codegen.js';
import { checkCommand } from './commandPolicy.js';
import { DATA_COLLECTOR_AGENT_KEY, runFirecrawlResearchJob } from './firecrawlResearch.js';
import { commitAll, diffAgainst, pushBranch } from './git.js';
import { generateHiggsfieldImage, parsePreferredModels } from './higgsfieldTool.js';
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

const LANDING_PAGE_AGENT_KEY = 'landing-page-agent';
const LANDING_HERO_ASSET_PATH = 'public/generated/higgsfield-hero.jpg';

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

export function shouldAutoGenerateLandingMedia(job: Job): boolean {
  if (!env.HIGGSFIELD_AUTO_GENERATE_LANDING_MEDIA) return false;
  if (job.reviewFeedback?.trim()) return false;
  if (job.agentKey !== LANDING_PAGE_AGENT_KEY) return false;
  return (
    job.agentCapabilities.includes('generative-media') ||
    job.agentCapabilities.includes('higgsfield')
  );
}

export function buildLandingMediaPrompt(job: Job): string {
  return [
    'Create one high-conversion landing page hero image.',
    `Business/request: ${job.title}`,
    job.description ? `Context: ${job.description}` : '',
    job.plan ? `Approved plan: ${job.plan}` : '',
    'Composition: premium editorial web hero, clear subject, useful negative space for HTML headline overlay, realistic product/service context, polished lighting, no text in image, no logos unless explicitly provided.',
    'Output: wide 16:9 image suitable for a modern Astro + React landing page.',
  ]
    .filter(Boolean)
    .join('\n');
}

export function landingMediaContext(assetPath = LANDING_HERO_ASSET_PATH): string {
  const publicPath = assetPath.replace(/^public\//, '/');
  return [
    '## Generated Higgsfield Media',
    '',
    `A Higgsfield hero image has already been generated and copied to \`${assetPath}\`.`,
    `Use it in the landing page as \`${publicPath}\` for the primary hero/visual section.`,
    'Do not hotlink the external Higgsfield result URL. Keep meaningful alt text and explicit image dimensions/aspect ratio.',
  ].join('\n');
}

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

type CommitAttempt =
  | Awaited<ReturnType<typeof commitAll>>
  | {
      failure: CommandResult;
    };

async function tryCommitAll(dir: string, message: string): Promise<CommitAttempt> {
  try {
    return await commitAll(dir, message);
  } catch (err) {
    return { failure: commitErrorResult(err) };
  }
}

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
    if (job.agentKey === DATA_COLLECTOR_AGENT_KEY) {
      log.info('running data collector research job');
      return await runFirecrawlResearchJob(job, {
        apiKey: env.FIRECRAWL_API_KEY,
        baseUrl: env.FIRECRAWL_BASE_URL,
        timeoutMs: env.FIRECRAWL_TIMEOUT_MS,
      });
    }

    const reviseMode = Boolean(job.reviewFeedback?.trim());
    if (reviseMode) log.info('modo revisão (MAC-59): partindo da branch de trabalho');
    log.info('preparing worktree');
    const dir = await prepareWorktree({
      runId: job.runId,
      repoUrl: job.repoUrl,
      baseBranch: job.baseBranch,
      branch: job.branch,
      checkoutOnly: job.checkoutOnly,
      revise: reviseMode,
    });

    // Fluxo de code-gen (MAC-17): há plano aprovado.
    if (job.plan.trim()) {
      let plan = job.plan;
      if (shouldAutoGenerateLandingMedia(job)) {
        try {
          log.info('generating landing hero media with Higgsfield');
          const media = await generateHiggsfieldImage(
            {
              prompt: buildLandingMediaPrompt(job),
              aspectRatio: '16:9',
              outputFilename: 'higgsfield-hero.jpg',
              runId: job.runId,
            },
            {
              artifactsDir: env.RUNNER_ARTIFACTS_DIR,
              preferredImageModels: parsePreferredModels(env.HIGGSFIELD_PREFERRED_IMAGE_MODELS),
              timeout: env.HIGGSFIELD_GENERATE_TIMEOUT,
              interval: env.HIGGSFIELD_POLL_INTERVAL,
            },
          );
          commands.push(...media.commands);
          const destination = join(dir, LANDING_HERO_ASSET_PATH);
          await mkdir(join(dir, 'public/generated'), { recursive: true });
          await copyFile(media.artifactPath, destination);
          plan = `${job.plan}\n\n${landingMediaContext(LANDING_HERO_ASSET_PATH)}`;
          log.info(
            {
              model: media.model,
              costCredits: media.costCredits,
              assetPath: LANDING_HERO_ASSET_PATH,
            },
            'landing hero media generated',
          );
        } catch (err) {
          log.warn({ err }, 'Higgsfield landing media generation failed; continuing without asset');
        }
      }
      const gen = await generateAndApplyCode({
        llm,
        dir,
        title: job.title,
        description: job.description,
        plan,
        lessons: job.lessons,
        reviewFeedback: job.reviewFeedback,
        agentKey: job.agentKey,
        agentCapabilities: job.agentCapabilities,
        log,
      });
      base.summary = gen.summary;
      base.filesChanged = gen.filesChanged;
      base.costUsd = gen.costUsd;
      base.prTitle = gen.prTitle;

      // Self-correction (fix intra-run): valida no worktree; se falhar, corrige e
      // revalida até passar ou esgotar AGENT_MAX_FIX_ATTEMPTS. O mesmo orçamento
      // cobre falhas de hook/pre-commit no `git commit`: nesse caso o erro também
      // vira feedback para o modelo antes de desistir.
      let validation = await runValidation(job.commands, dir, job.runId, log);
      let fixAttempts = 0;
      // Acumula os arquivos tocados ao longo das tentativas — um fix pode criar um
      // arquivo novo cujo erro só aparece na revalidação seguinte; sem isso a próxima
      // tentativa releria só o conjunto original e ficaria cega a ele.
      let touched = gen.filesChanged;
      const applySelfCorrection = async (failureTail: string, reason: string) => {
        fixAttempts++;
        log.info({ attempt: fixAttempts, reason }, 'tentando auto-correção');
        try {
          const fix = await applyFix({
            llm,
            dir,
            filesChanged: touched,
            failureTail,
            plan,
            title: job.title,
            agentKey: job.agentKey,
            agentCapabilities: job.agentCapabilities,
            log,
          });
          base.costUsd = (base.costUsd ?? 0) + fix.costUsd;
          touched = [...new Set([...touched, ...fix.filesChanged])];
          return true;
        } catch (err) {
          log.warn({ err, attempt: fixAttempts }, 'fix falhou — encerrando o loop');
          return false;
        }
      };
      const fixValidationFailures = async () => {
        while (!validation.passed && fixAttempts < env.AGENT_MAX_FIX_ATTEMPTS) {
          const fixed = await applySelfCorrection(validation.failureTail, 'validation failed');
          if (!fixed) break;
          validation = await runValidation(job.commands, dir, job.runId, log);
        }
      };

      await fixValidationFailures();
      base.fixAttempts = fixAttempts;
      base.filesChanged = touched;

      // Commit do estado final + push único. Se hooks de commit falharem, tenta
      // corrigir usando a saída do próprio git commit como diagnóstico e revalida.
      const message = buildCommitMessage(job, gen.prTitle, gen.summary);
      let commitFailure: CommandResult | undefined;
      let commit = await tryCommitAll(dir, message);
      while ('failure' in commit && fixAttempts < env.AGENT_MAX_FIX_ATTEMPTS) {
        commitFailure = commit.failure;
        const fixed = await applySelfCorrection(
          summarizeFailureTail([commit.failure]),
          'git commit failed',
        );
        if (!fixed) break;
        validation = await runValidation(job.commands, dir, job.runId, log);
        await fixValidationFailures();
        base.fixAttempts = fixAttempts;
        base.filesChanged = touched;
        commit = await tryCommitAll(dir, message);
      }

      if ('failure' in commit) {
        commands.push(...validation.results, commit.failure);
        base.sandbox = summarizeSandbox(commands);
        base.testsPassed = validation.passed;
        base.error = commit.failure.stderr || commit.failure.stdout || 'git commit failed';
        return { ...base, status: 'failed' };
      }
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
      if (commitFailure) {
        log.info({ attempts: fixAttempts }, 'git commit passou após auto-correção');
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
