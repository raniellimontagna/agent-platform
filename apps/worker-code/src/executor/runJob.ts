import { createLlmClient } from '@agent-platform/llm';
import { env } from '../env.js';
import { logger } from '../logger.js';
import type { CommandResult, Job, JobResult } from '../types.js';
import { applyFix, generateAndApplyCode } from './codegen.js';
import { commitAll, diffAgainst, pushBranch } from './git.js';
import { generateHiggsfieldImage, parsePreferredModels } from './higgsfieldTool.js';
import { isDataCollectorJob, runDataCollectorJob } from './jobDispatch.js';
import {
  DEFAULT_LANDING_HERO_ASSET_PATH,
  buildLandingMediaPrompt,
  landingHeroAssetPathForArtifact,
  landingMediaContext,
  restoreLandingMediaAsset,
  shouldAutoGenerateLandingMedia,
} from './jobMedia.js';
import {
  buildCommitMessage,
  commitErrorResult,
  summarizeSandbox,
} from './jobResult.js';
import { runGuarded, runLandingAwareValidation } from './jobValidation.js';
import { summarizeFailureTail } from './validation.js';
import { cleanupWorktree, prepareWorktree } from './worktree.js';

export {
  buildLandingMediaPrompt,
  landingHeroAssetPathForArtifact,
  landingMediaContext,
  restoreLandingMediaAsset,
  shouldAutoGenerateLandingMedia,
} from './jobMedia.js';
export { buildCommitMessage, commitErrorResult, reportResult } from './jobResult.js';
export { summarizeFailureTail } from './validation.js';

const llm = createLlmClient({
  baseUrl: env.LITELLM_BASE_URL,
  apiKey: env.LITELLM_API_KEY,
  timeoutMs: env.LLM_TIMEOUT_MS,
  maxRetries: env.LLM_MAX_RETRIES,
});

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
    if (isDataCollectorJob(job)) {
      log.info('running data collector research job');
      return await runDataCollectorJob(job);
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
      let landingMediaArtifactPath: string | undefined;
      let landingMediaAssetPath = DEFAULT_LANDING_HERO_ASSET_PATH;
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
          landingMediaArtifactPath = media.artifactPath;
          landingMediaAssetPath = landingHeroAssetPathForArtifact(media.artifactPath);
          await restoreLandingMediaAsset(dir, landingMediaArtifactPath, landingMediaAssetPath);
          plan = `${job.plan}\n\n${landingMediaContext(landingMediaAssetPath)}`;
          log.info(
            {
              model: media.model,
              costCredits: media.costCredits,
              assetPath: landingMediaAssetPath,
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
      if (landingMediaArtifactPath) {
        await restoreLandingMediaAsset(dir, landingMediaArtifactPath, landingMediaAssetPath);
      }
      base.summary = gen.summary;
      base.filesChanged = landingMediaArtifactPath
        ? [...new Set([...gen.filesChanged, landingMediaAssetPath])]
        : gen.filesChanged;
      base.costUsd = gen.costUsd;
      base.prTitle = gen.prTitle;

      // Self-correction (fix intra-run): valida no worktree; se falhar, corrige e
      // revalida até passar ou esgotar AGENT_MAX_FIX_ATTEMPTS. O mesmo orçamento
      // cobre falhas de hook/pre-commit no `git commit`: nesse caso o erro também
      // vira feedback para o modelo antes de desistir.
      let validation = await runLandingAwareValidation(job, dir, base.filesChanged, log);
      let fixAttempts = 0;
      // Acumula os arquivos tocados ao longo das tentativas — um fix pode criar um
      // arquivo novo cujo erro só aparece na revalidação seguinte; sem isso a próxima
      // tentativa releria só o conjunto original e ficaria cega a ele.
      let touched = base.filesChanged;
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
          if (landingMediaArtifactPath) {
            await restoreLandingMediaAsset(dir, landingMediaArtifactPath, landingMediaAssetPath);
            touched = [...new Set([...touched, landingMediaAssetPath])];
          }
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
          validation = await runLandingAwareValidation(job, dir, touched, log);
        }
      };

      await fixValidationFailures();
      base.fixAttempts = fixAttempts;
      base.filesChanged = touched;
      if (!validation.passed) {
        commands.push(...validation.results);
        base.sandbox = summarizeSandbox(commands);
        base.testsPassed = false;
        base.error = validation.failureTail || 'validation failed';
        log.warn({ fixAttempts }, 'validation still failed after self-correction');
        return { ...base, status: 'failed' };
      }

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
        validation = await runLandingAwareValidation(job, dir, touched, log);
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
