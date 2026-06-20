import type { CardGatewayRegistry, CardProvider } from '@agent-platform/cards';
import { parseRepoRef } from '@agent-platform/github';
import { verdictOf } from '@agent-platform/graph';
import { distillLesson } from '@agent-platform/memory';
import { Worker } from 'bullmq';
import type { Logger } from 'pino';
import { getAgent as getRuntimeAgent, resolveAgentGraph } from './agent.js';
import {
  LANDING_PAGE_AGENT_KEY,
  ensureDefaultAgents,
  getAgent as getCatalogAgent,
  resolveAgentByKey,
} from './agents.js';
import { hasCriticalReason, isCriticalReason } from './approvalPolicy.js';
import { saveArtifacts } from './artifacts.js';
import { env } from './env.js';
import { ensureGeneratedRepository, resolveGeneratedRepoTarget } from './generatedRepos.js';
import { isPaused } from './killswitch.js';
import { saveLesson } from './lessons.js';
import { logger } from './logger.js';
import {
  AGENT_QUEUE,
  type AgentJobData,
  JOB_PRIORITY,
  agentQueue,
  connection,
  resolvePlanJobCardRef,
} from './queue.js';
import {
  type RunStatus,
  createRun,
  findResumableRuns,
  getRun,
  recordApproval,
  recordStep,
  resolveApproval,
  runCostUsd,
  updateRunStatus,
} from './runs.js';
import { ensureDefaultTools } from './tools.js';
import {
  formatResearchToLandingContext,
  shouldStartResearchToLandingContinuation,
} from './workflows.js';

/**
 * Worker que consome a fila e roda o grafo LangGraph (MAC-14). Cada run usa
 * thread_id = runId, então o checkpointer persiste e permite retomar (MAC-34).
 *
 * - kind `plan`:   roda planning → comenta plano → pausa antes de coding (MAC-22).
 * - kind `resume`: retoma após aprovação → roda coding (MAC-17) → fim.
 */
export async function startAgentWorker(): Promise<Worker<AgentJobData, unknown, string>> {
  const agent = await getRuntimeAgent();
  const { cards, llm, github } = agent;

  // MAC-42/MAC-90: garante os agentes built-in no catálogo (idempotente). Não-fatal.
  try {
    await ensureDefaultAgents();
  } catch (err) {
    logger.warn({ err }, 'ensureDefaultAgents falhou (seguindo sem seed)');
  }

  // MAC-43: garante as tools default no catálogo (idempotente). Não-fatal.
  try {
    await ensureDefaultTools();
  } catch (err) {
    logger.warn({ err }, 'ensureDefaultTools falhou (seguindo sem seed)');
  }

  const worker = new Worker<AgentJobData, unknown, string>(
    AGENT_QUEUE,
    async (job) => {
      const { runId } = job.data;
      const planCard = job.data.kind === 'plan' ? resolvePlanJobCardRef(job.data) : null;
      const log = logger.child({ runId, kind: job.data.kind, ...(planCard ?? {}) });
      const config = { configurable: { thread_id: runId } };

      // Kill switch (MAC-32): pausado → reenfileira com atraso e não processa.
      // Interrupção segura: o passo em andamento termina, nenhum novo começa.
      if (await isPaused()) {
        log.warn('agents paused; deferring job');
        await agentQueue.add(job.name, job.data, { delay: 30_000 });
        return;
      }

      const startedAt = new Date();
      let result: {
        status?: string;
        plan?: string;
        diff?: string;
        summary?: string;
        research?: string;
        planCostUsd?: number;
        codeCostUsd?: number;
        reviewCostUsd?: number;
        approvalReasons?: string[];
        branch?: string;
        prUrl?: string;
        error?: string;
        review?: string;
        testsPassed?: boolean;
        testSummary?: string;
        fixAttempts?: number;
        sandbox?: {
          backend: 'process' | 'docker';
          image?: string;
          network?: string;
          commandCount: number;
          totalDurationMs: number;
          maxCommandDurationMs: number;
          failedCommand?: string;
        };
      };
      const run = await getRun(runId);
      const graphProvider =
        job.data.kind === 'plan'
          ? (toCardProvider(run?.cardProvider) ?? planCard.cardProvider)
          : (toCardProvider(run?.cardProvider) ?? 'linear');
      const graph = resolveAgentGraph(agent, graphProvider);
      if (job.data.kind === 'plan') {
        const cardId = run?.cardId ?? planCard.cardId;
        const cardGateway = cards.forProvider(graphProvider);
        const issue = await cardGateway.getCard(cardId);
        const selectedAgent = run?.agentId ? await getCatalogAgent(run.agentId) : null;
        const description = job.data.context
          ? `${issue.description}\n\n---\n\n${job.data.context}`
          : issue.description;
        await updateRunStatus(runId, 'planning');
        result = await graph.invoke(
          {
            runId,
            issueId: cardId,
            issueIdentifier: issue.identifier,
            title: issue.title,
            description,
            status: 'planning',
            autoMerge: run?.autoMerge ?? false,
            targetRepo: run?.targetRepo ?? undefined,
            agentKey: selectedAgent?.key,
            agentCapabilities: selectedAgent?.capabilities,
          },
          config,
        );
      } else {
        // Retoma a partir do checkpoint (passa null para continuar do interrupt).
        await updateRunStatus(runId, 'executing');
        result = await graph.invoke(null, config);
      }

      const status = (result.status as RunStatus) ?? 'awaiting_approval';
      const verdict = result.review ? verdictOf(result.review) : undefined;
      await updateRunStatus(runId, status, {
        branch: result.branch,
        prUrl: result.prUrl,
        error: result.error,
        testsPassed: result.testsPassed,
        verdict: verdict === '—' ? undefined : verdict,
        fixAttempts: result.fixAttempts,
        sandbox: result.sandbox,
      });

      // Approval Policies (MAC-41): ao pausar p/ aprovação, registra a solicitação.
      // Scheduler (MAC-38): run auto-aprovável segue sozinho se NÃO houver motivo
      // crítico; com motivo crítico, fica aguardando humano (approve via label).
      if (status === 'awaiting_approval') {
        const reasons = result.approvalReasons ?? ['plan'];
        await recordApproval(runId, reasons, `Motivos: ${reasons.join(', ')}`);

        const run = await getRun(runId);
        if (run?.autoApprove) {
          if (hasCriticalReason(reasons)) {
            const critical = reasons.filter(isCriticalReason);
            const runCardRef = resolveRunCardRef(run);
            await cards
              .forProvider(runCardRef.cardProvider)
              .comment(
                runCardRef.cardId,
                `## ⏸️ Agendado pausado — aprovação humana necessária\nMotivo(s): ${critical.join(', ')}. Adicione a label \`approved\` para liberar.`,
              );
            log.warn({ runId, critical }, 'agendado retido — motivo crítico');
          } else {
            await resolveApproval(runId, 'approved', 'scheduler');
            await updateRunStatus(runId, 'executing');
            await agentQueue.add(
              'resume',
              { kind: 'resume', runId },
              { priority: JOB_PRIORITY.resume },
            );
            log.info({ runId }, 'agendado auto-aprovado (sem motivo crítico)');
          }
        }
      }

      // Registra a etapa com tempo, resultado e custo (MAC-36/40). Cada job
      // contabiliza só o custo das fases que rodaram nele.
      const isPlan = job.data.kind === 'plan';
      const costUsd = isPlan
        ? result.planCostUsd
        : (result.codeCostUsd ?? 0) + (result.reviewCostUsd ?? 0);
      await recordStep({
        runId,
        type: isPlan ? 'plan' : 'code',
        status: status === 'failed' ? 'failed' : 'succeeded',
        startedAt,
        model: isPlan ? 'research' : 'strong_coder+critic',
        costUsd,
        error: status === 'failed' ? result.error : undefined,
      });
      log.info({ status, costUsd }, 'graph step finished');

      // Cost Guard (MAC-40): run estourou o limite por task → alerta na card.
      const total = await runCostUsd(runId);
      if (total > env.AGENT_MAX_COST_PER_RUN_USD) {
        log.warn({ total, limit: env.AGENT_MAX_COST_PER_RUN_USD }, 'run estourou o orçamento');
        if (run) {
          const runCardRef = resolveRunCardRef(run);
          await cards
            .forProvider(runCardRef.cardProvider)
            .comment(
              runCardRef.cardId,
              `## 💸 Alerta de custo\nRun excedeu o limite por task: ~$${total.toFixed(4)} > $${env.AGENT_MAX_COST_PER_RUN_USD}.`,
            );
        }
      }

      // Memory Layer (MAC-23): se o run falhou na revisão ou na validação, destila
      // a lição e guarda por repo — runs futuros do mesmo repo a recebem no codegen.
      const reproved = /REPROVADO/i.test(verdictOf(result.review));
      const testsFailed = result.testsPassed === false;
      if (reproved || testsFailed) {
        try {
          const ref = parseRepoRef(env.REPO_URL);
          const repo = `${ref.owner}/${ref.repo}`;
          const text = await distillLesson(llm, {
            source: reproved ? 'critic' : 'validation',
            review: result.review,
            testSummary: result.testSummary,
          });
          if (text) {
            await saveLesson({ repo, source: reproved ? 'critic' : 'validation', text, runId });
            log.info({ runId, source: reproved ? 'critic' : 'validation' }, 'lição registrada');
          }
        } catch (err) {
          log.warn({ err }, 'falha ao registrar lição (não-fatal)');
        }
      }

      // Artifact Store (MAC-44): guarda os artefatos do run de forma durável.
      // Split por tipo de job evita duplicar o `plan` (reaparece no estado final
      // do resume). Não-fatal: falha aqui não derruba o run.
      try {
        if (job.data.kind === 'plan') {
          await saveArtifacts(runId, { plan: result.plan });
        } else {
          await saveArtifacts(runId, {
            patch: result.diff,
            review: result.review,
            validation: result.testSummary,
            summary: result.summary,
            research: result.research,
          });
        }
      } catch (err) {
        log.warn({ err }, 'falha ao salvar artefatos (não-fatal)');
      }

      if (job.data.kind !== 'plan') {
        await maybeStartResearchToLandingWorkflow({
          runId,
          status,
          result,
          cards,
          github,
          log,
        });
      }
    },
    { connection, concurrency: env.AGENT_MAX_CONCURRENCY },
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, attempt: job?.attemptsMade, err }, 'agent job failed');
    // Só marca o run como falho na tentativa final (BullMQ ainda vai retentar).
    const attempts = job?.opts.attempts ?? 1;
    if (job?.data.runId && (job.attemptsMade ?? 0) >= attempts) {
      void updateRunStatus(job.data.runId, 'failed', { error: String(err?.message ?? err) });
    }
  });

  // Resume automático (MAC-34): reenfileira runs órfãos em `executing` que foram
  // interrompidos por restart — retomam do último checkpoint do LangGraph.
  const resumable = await findResumableRuns();
  for (const r of resumable) {
    logger.warn({ runId: r.id }, 'recuperando run em execução após restart');
    await agentQueue.add(
      'resume',
      { kind: 'resume', runId: r.id },
      { priority: JOB_PRIORITY.resume },
    );
  }

  logger.info({ recovered: resumable.length }, 'agent worker started');
  return worker;
}

function toCardProvider(value: string | null | undefined): CardProvider | undefined {
  return value === 'plane' || value === 'linear' ? value : undefined;
}

function resolveRunCardRef(run: NonNullable<Awaited<ReturnType<typeof getRun>>>): {
  cardProvider: CardProvider;
  cardId: string;
} {
  return {
    cardProvider: toCardProvider(run.cardProvider) ?? 'linear',
    cardId: run.cardId ?? run.linearIssueId,
  };
}

async function maybeStartResearchToLandingWorkflow(args: {
  runId: string;
  status: RunStatus;
  result: { research?: string };
  cards: CardGatewayRegistry;
  github: Awaited<ReturnType<typeof getRuntimeAgent>>['github'];
  log: Logger;
}) {
  const sourceRun = await getRun(args.runId);
  if (!sourceRun) return;
  if (
    !shouldStartResearchToLandingContinuation({
      workflow: sourceRun.workflow,
      status: args.status,
      research: args.result.research,
    })
  ) {
    return;
  }

  const landingAgent = await resolveAgentByKey(LANDING_PAGE_AGENT_KEY);
  const sourceCardProvider = toCardProvider(sourceRun.cardProvider) ?? 'linear';
  const sourceCardId = sourceRun.cardId ?? sourceRun.linearIssueId;
  const sourceGateway = args.cards.forProvider(sourceCardProvider);
  const issue = await sourceGateway.getCard(sourceCardId);
  const target = resolveGeneratedRepoTarget({
    title: sourceRun.title,
    description: issue.description,
    createRequested: sourceRun.targetRepoCreate,
    config: {
      owner: env.GENERATED_REPOS_OWNER,
      allowCreate: env.GENERATED_REPOS_ALLOW_CREATE,
      template: env.GENERATED_REPOS_TEMPLATE,
    },
  });
  const createdRepo = target
    ? await ensureGeneratedRepository({
        github: args.github,
        target,
        description: `Landing page gerada pelo agent-platform para ${sourceRun.cardIdentifier ?? sourceRun.linearIssueIdentifier}`,
        config: {
          owner: env.GENERATED_REPOS_OWNER,
          allowCreate: env.GENERATED_REPOS_ALLOW_CREATE,
          template: env.GENERATED_REPOS_TEMPLATE,
        },
      })
    : undefined;
  const landingRunId = await createRun({
    linearIssueId: sourceRun.linearIssueId,
    linearIssueIdentifier: sourceRun.linearIssueIdentifier,
    cardProvider: sourceCardProvider,
    cardId: sourceCardId,
    cardIdentifier: sourceRun.cardIdentifier ?? sourceRun.linearIssueIdentifier,
    cardProjectId: sourceRun.cardProjectId ?? undefined,
    title: `${sourceRun.title} — landing page`,
    agentId: landingAgent?.id,
    autoApprove: true,
    autoMerge: sourceRun.autoMerge,
    targetRepo: target?.fullName,
  });

  await agentQueue.add(
    'plan',
    {
      kind: 'plan',
      runId: landingRunId,
      cardProvider: sourceCardProvider,
      cardId: sourceCardId,
      context: formatResearchToLandingContext(args.result.research ?? '', args.runId),
    },
    { priority: JOB_PRIORITY.plan },
  );

  const targetLine = target
    ? `Repo alvo: \`${target.fullName}\`${createdRepo ? ` (${createdRepo.created ? 'criado' : 'já existia'})` : ''}.`
    : undefined;
  await sourceGateway.comment(
    sourceCardId,
    [
      '## 🔁 Workflow composto',
      'Coleta concluída. Iniciando etapa de landing page com o `landing-page-agent`.',
      targetLine,
      `Run de landing page: \`${landingRunId}\`.`,
    ]
      .filter(Boolean)
      .join('\n\n'),
  );
  args.log.info({ sourceRunId: args.runId, landingRunId }, 'research→landing workflow enqueued');
}
