import { Hono } from 'hono';
import { logger } from '../logger.js';
import { runStats } from '../runs.js';

export const statsRoute = new Hono();

/** Resumo agregado das execuções para visão rápida via API. */
statsRoute.get('/stats', async (c) => {
  try {
    return c.json(await runStats());
  } catch (err) {
    logger.error({ err }, 'failed to fetch run stats');
    return c.json({ error: 'internal server error' }, 500);
  }
});
