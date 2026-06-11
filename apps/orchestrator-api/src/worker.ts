import { buildAgentGraph, createCheckpointer } from '@agent-platform/graph';
import { createLinearGateway } from '@agent-platform/linear';
import { createLlmClient } from '@agent-platform/llm';
import { Worker } from 'bullmq';
import { env } from './env.js';
import { logger } from './logger.js';
import { AGENT_QUEUE, type AgentJobData, connection } from './queue.js';
import { type RunStatus, updateRunStatus } from './runs.js';

/**
 * Worker que consome a fila e roda o grafo LangGraph (MAC-14). Cada run usa
 * thread_id = runId, então o checkpointer persiste e permite retomar (MAC-34).
 * O grafo pausa antes de `coding` aguardando aprovação humana (MAC-22).
 */
export async function startAgentWorker(): Promise<Worker<AgentJobData, unknown, string>> {
  const llm = createLlmClient({ baseUrl: env.LITELLM_BASE_URL, apiKey: env.LITELLM_API_KEY });
  const linear = createLinearGateway(env.LINEAR_API_KEY);
  const checkpointer = await createCheckpointer(env.DATABASE_URL);
  const graph = buildAgentGraph({ llm, linear }, checkpointer);

  const worker = new Worker<AgentJobData, unknown, string>(
    AGENT_QUEUE,
    async (job) => {
      const { runId, issueId } = job.data;
      const log = logger.child({ runId, issueId });

      const issue = await linear.getIssue(issueId);
      await updateRunStatus(runId, 'planning');

      const result = await graph.invoke(
        {
          runId,
          issueId,
          issueIdentifier: issue.identifier,
          title: issue.title,
          description: issue.description,
          status: 'planning',
        },
        { configurable: { thread_id: runId } },
      );

      const status = (result.status as RunStatus) ?? 'awaiting_approval';
      await updateRunStatus(runId, status);
      log.info({ status }, 'graph paused or finished');
    },
    { connection },
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'agent job failed');
    if (job?.data.runId) {
      void updateRunStatus(job.data.runId, 'failed', { error: String(err?.message ?? err) });
    }
  });

  logger.info('agent worker started');
  return worker;
}
