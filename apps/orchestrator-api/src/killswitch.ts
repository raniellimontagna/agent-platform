import { agentQueue } from './queue.js';

/**
 * Kill switch global (MAC-32). Flag em Redis (reusa a conexão do BullMQ) — flip
 * instantâneo e compartilhado entre instâncias, sem migration. Quando ligado, o
 * webhook para de enfileirar e o worker adia os jobs (interrupção segura: o
 * passo em andamento termina, nenhum novo começa).
 */
const PAUSED_KEY = 'agents:paused';

export async function isPaused(): Promise<boolean> {
  const client = await agentQueue.client;
  return (await client.get(PAUSED_KEY)) === '1';
}

export async function setPaused(paused: boolean): Promise<void> {
  const client = await agentQueue.client;
  if (paused) await client.set(PAUSED_KEY, '1');
  else await client.del(PAUSED_KEY);
}
