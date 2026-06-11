import { Hono } from 'hono';
import { logger } from '../logger.js';
import { agentQueue } from '../queue.js';
import { getRun, updateRunStatus } from '../runs.js';

// Rede interna (VPN/vmbr1). Aprovação dispara execução de código — quando
// houver ingress externo (Tailscale), proteger com token de admin.
export const runsRoute = new Hono();

runsRoute.get('/runs/:id', async (c) => {
  const run = await getRun(c.req.param('id'));
  if (!run) return c.json({ error: 'not found' }, 404);
  return c.json(run);
});

/** Aprova um run pausado e retoma o grafo (MAC-22). */
runsRoute.post('/runs/:id/approve', async (c) => {
  const id = c.req.param('id');
  const run = await getRun(id);
  if (!run) return c.json({ error: 'not found' }, 404);
  if (run.status !== 'awaiting_approval') {
    return c.json({ error: `run não está aguardando aprovação (status: ${run.status})` }, 409);
  }

  await updateRunStatus(id, 'executing');
  await agentQueue.add('resume', { kind: 'resume', runId: id });
  logger.info({ runId: id }, 'run approved, resuming');
  return c.json({ ok: true, runId: id, resumed: true });
});

/** Reprova um run pausado (encerra). */
runsRoute.post('/runs/:id/reject', async (c) => {
  const id = c.req.param('id');
  const run = await getRun(id);
  if (!run) return c.json({ error: 'not found' }, 404);

  await updateRunStatus(id, 'cancelled');
  logger.info({ runId: id }, 'run rejected');
  return c.json({ ok: true, runId: id, cancelled: true });
});
