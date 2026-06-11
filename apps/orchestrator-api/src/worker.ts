import { Worker } from 'bullmq';
import { getAgent } from './agent.js';
import { isPaused } from './killswitch.js';
import { logger } from './logger.js';
import { AGENT_QUEUE, type AgentJobData, agentQueue, connection } from './queue.js';
import { type RunStatus, findResumableRuns, recordStep, updateRunStatus } from './runs.js';

/**
 * Worker que consome a fila e roda o grafo LangGraph (MAC-14). Cada run usa
 * thread_id = runId, então o checkpointer persiste e permite retomar (MAC-34).
 *
 * - kind `plan`:   roda planning → comenta plano → pausa antes de coding (MAC-22).
 * - kind `resume`: retoma após aprovação → roda coding (MAC-17) → fim.
 */
export async function startAgentWorker(): Promise<Worker<AgentJobData, unknown, string>> {
  const { graph, linear } = await getAgent();

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
        planCostUsd?: number;
        codeCostUsd?: number;
        reviewCostUsd?: number;
      };
      if (job.data.kind === 'plan') {
        const issue = await linear.getIssue(job.data.issueId);
        await updateRunStatus(runId, 'planning');
        result = await graph.invoke(
          {
            runId,
            issueId: job.data.issueId,
            issueIdentifier: issue.identifier,
            title: issue.title,
            description: issue.description,
            status: 'planning',
          },
          config,
        );
      } else {
        // Retoma a partir do checkpoint (passa null para continuar do interrupt).
        await updateRunStatus(runId, 'executing');
        result = await graph.invoke(null, config);
      }

      const status = (result.status as RunStatus) ?? 'awaiting_approval';
      await updateRunStatus(runId, status);

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
    },
    { connection },
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'agent job failed');
    if (job?.data.runId) {
      void updateRunStatus(job.data.runId, 'failed', { error: String(err?.message ?? err) });
    }
  });

  // Resume automático (MAC-34): reenfileira runs órfãos em `executing` que foram
  // interrompidos por restart — retomam do último checkpoint do LangGraph.
  const resumable = await findResumableRuns();
  for (const r of resumable) {
    logger.warn({ runId: r.id }, 'recuperando run em execução após restart');
    await agentQueue.add('resume', { kind: 'resume', runId: r.id });
  }

  logger.info({ recovered: resumable.length }, 'agent worker started');
  return worker;
}
