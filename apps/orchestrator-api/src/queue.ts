import { type ConnectionOptions, Queue } from 'bullmq';
import type { CardProvider } from '@agent-platform/cards';
import { env } from './env.js';

/**
 * Opções de conexão Redis para o BullMQ (ele cria o client internamente,
 * evitando conflito de versão de ioredis). maxRetriesPerRequest: null é
 * exigido por workers do BullMQ.
 */
const redisUrl = new URL(env.REDIS_URL);
export const connection: ConnectionOptions = {
  host: redisUrl.hostname,
  port: Number(redisUrl.port) || 6379,
  maxRetriesPerRequest: null,
};

/** `plan`: roda planning e pausa na aprovação. `resume`: retoma após aprovado. */
export type AgentJobData =
  | {
      kind: 'plan';
      runId: string;
      issueId: string;
      cardProvider?: CardProvider;
      cardId?: string;
      context?: string;
    }
  | { kind: 'resume'; runId: string };

export const AGENT_QUEUE = 'agent-runs';

/**
 * Prioridade dos jobs (BullMQ: menor = mais prioritário). `resume` (run já
 * aprovado pelo humano) passa na frente de `plan` (MAC-37).
 */
export const JOB_PRIORITY = { resume: 1, plan: 2 } as const;

/**
 * Fila que desacopla o webhook da execução longa do grafo (MAC-37).
 * - Retry: `attempts` com backoff exponencial. É seguro porque o checkpointer
 *   do LangGraph retoma do último nó concluído (não repete efeitos colaterais).
 * - Priorização: ver JOB_PRIORITY.
 */
export const agentQueue = new Queue<AgentJobData, unknown, string>(AGENT_QUEUE, {
  connection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 5_000 },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});
