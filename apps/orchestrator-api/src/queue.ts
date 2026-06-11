import { type ConnectionOptions, Queue } from 'bullmq';
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

export interface AgentJobData {
  runId: string;
  issueId: string;
}

export const AGENT_QUEUE = 'agent-runs';

/** Fila que desacopla o webhook da execução longa do grafo (MAC-37). */
export const agentQueue = new Queue<AgentJobData, unknown, string>(AGENT_QUEUE, { connection });
