import { type Context, Hono, type Next } from 'hono';
import { getAgent } from '../agent.js';
import { env } from '../env.js';
import { isPaused, setPaused } from '../killswitch.js';
import { logger } from '../logger.js';
import { ACTIVE_STATUSES, countRunsByStatus, listRunsForCard } from '../runs.js';

export const adminRoute = new Hono();

/** Protege os controles operacionais com o token interno compartilhado. */
async function requireAdmin(c: Context, next: Next) {
  if (c.req.header('authorization') !== `Bearer ${env.RUNNER_AUTH_TOKEN}`) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  await next();
}

adminRoute.use('/admin/*', requireAdmin);

/** Liga o kill switch: para de aceitar e adia os runs (MAC-32). */
adminRoute.post('/admin/pause', async (c) => {
  await setPaused(true);
  logger.warn('KILL SWITCH ligado — agentes pausados');
  return c.json({ paused: true });
});

/** Desliga o kill switch: volta a processar. */
adminRoute.post('/admin/resume', async (c) => {
  await setPaused(false);
  logger.warn('kill switch desligado — agentes retomados');
  return c.json({ paused: false });
});

adminRoute.get('/admin/status', async (c) => {
  return c.json({ paused: await isPaused() });
});

/** Snapshot de saúde dos runners conhecidos (MAC-39). */
adminRoute.get('/admin/runners', async (c) => {
  const { workerManager } = await getAgent();
  return c.json({ runners: await workerManager.probeAll() });
});

/** Observabilidade de concorrência (MAC-47): limite + runs ativos por status. */
adminRoute.get('/admin/concurrency', async (c) => {
  const byStatus = await countRunsByStatus();
  const active = ACTIVE_STATUSES.reduce((sum, s) => sum + (byStatus[s] ?? 0), 0);
  return c.json({ limit: env.AGENT_MAX_CONCURRENCY, active, byStatus });
});

adminRoute.get('/admin/card-runs', async (c) => {
  const provider = c.req.query('provider');
  const cardId = c.req.query('cardId');
  const limit = Number(c.req.query('limit') ?? 20);

  if (!provider || !cardId) {
    return c.json({ error: 'provider and cardId are required' }, 400);
  }
  if (provider !== 'plane' && provider !== 'linear') {
    return c.json({ error: 'provider must be plane or linear' }, 400);
  }

  const runs = await listRunsForCard(
    provider,
    cardId,
    Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 100) : 20,
  );
  return c.json({ runs });
});
