import { parseRepoRef } from '@agent-platform/github';
import { verdictOf } from '@agent-platform/graph';
import { distillLesson } from '@agent-platform/memory';
import { Worker } from 'bullmq';
import { getAgent } from './agent.js';
import { ensureDefaultAgent } from './agents.js';
import { hasCriticalReason, isCriticalReason } from './approvalPolicy.js';
import { saveArtifacts } from './artifacts.js';
import { env } from './env.js';
import { isPaused } from './killswitch.js';
import { saveLesson } from './lessons.js';
import { logger } from './logger.js';
import { AGENT_QUEUE, type AgentJobData, JOB_PRIORITY, agentQueue, connection } from './queue.js';
import {
  type RunStatus,
  findResumableRuns,
  getRun,
  recordApproval,
  recordStep,
  resolveApproval,
  runCostUsd,
  updateRunStatus,
} from './runs.js';
import { ensureDefaultTools } from './tools.js';

/**
 * Worker que consome a fila e roda o grafo LangGraph (MAC-14). Cada run usa
 * thread_id = runId, então o checkpointer persiste e permite retomar (MAC-34).
 *
 * - kind `plan`:   roda planning → comenta plano → pausa antes de coding (MAC-22).
 * - kind `resume`: retoma após aprovação → roda coding (MAC-17) → fim.
 */
export async function startAgentWorker(): Promise<Worker<AgentJobData, unknown, string>> {
  const { graph, linear, llm } = await getAgent();

  // MAC-42: garante o agente default no catálogo (idempotente). Não-fatal.
  try {
    await ensureDefaultAgent();
  } catch (err) {
    logger.warn({ err }, 'ensureDefaultAgent falhou (seguindo sem seed)');
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
      const log = logger.child({ runId, kind: job.data.kind });
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
        planCostUsd?: number;
        codeCostUsd?: number;
        reviewCostUsd?: number;
        approvalReasons?: string[];
        branch?: string;
        prUrl?: string;
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
      if (job.data.kind === 'plan') {
        const issue = await linear.getIssue(job.data.issueId);
        const run = await getRun(runId);
        await updateRunStatus(runId, 'planning');
        result = await graph.invoke(
          {
            runId,
            issueId: job.data.issueId,
            issueIdentifier: issue.identifier,
            title: issue.title,
            description: issue.description,
            status: 'planning',
            autoMerge: run?.autoMerge ?? false,
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
            await linear.comment(
              run.linearIssueId,
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
      });
      log.info({ status, costUsd }, 'graph step finished');

      // Cost Guard (MAC-40): run estourou o limite por task → alerta no Linear.
      const total = await runCostUsd(runId);
      if (total > env.AGENT_MAX_COST_PER_RUN_USD) {
        log.warn({ total, limit: env.AGENT_MAX_COST_PER_RUN_USD }, 'run estourou o orçamento');
        const run = await getRun(runId);
        if (run) {
          await linear.comment(
            run.linearIssueId,
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
          });
        }
      } catch (err) {
        log.warn({ err }, 'falha ao salvar artefatos (não-fatal)');
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
