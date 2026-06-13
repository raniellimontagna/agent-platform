import { type Context, Hono, type Next } from 'hono';
import { getAgent } from '../agent.js';
import { env } from '../env.js';
import { isPaused, setPaused } from '../killswitch.js';
import { logger } from '../logger.js';

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
