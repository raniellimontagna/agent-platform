import { serve } from '@hono/node-server';
import { Hono } from 'hono';

import { env } from './env';
import { logger } from './logger';
import { healthRoutes } from './routes/health';
import { runsRoutes } from './routes/runs';
import { versionRoutes } from './routes/version';
import { webhooksRoutes } from './routes/webhooks';

export const app = new Hono();

app.route('/health', healthRoutes);
app.route('/runs', runsRoutes);
app.route('/version', versionRoutes);
app.route('/webhooks', webhooksRoutes);

serve(
  {
    fetch: app.fetch,
    port: env.PORT,
  },
  (info) => {
    logger.info({ port: info.port }, 'orchestrator api listening');
  },
);
