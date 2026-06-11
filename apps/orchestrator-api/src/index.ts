import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { env } from './env.js';
import { logger } from './logger.js';
import { health } from './routes/health.js';
import { webhooks } from './routes/webhooks.js';
import { startAgentWorker } from './worker.js';

const app = new Hono();

app.route('/', health);
app.route('/', webhooks);

app.notFound((c) => c.json({ error: 'not found' }, 404));

app.onError((err, c) => {
  logger.error({ err }, 'unhandled error');
  return c.json({ error: 'internal server error' }, 500);
});

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  logger.info(`orchestrator-api listening on :${info.port}`);
});

// Sobe o worker do grafo no mesmo processo (MVP). Falha aqui não derruba a API.
startAgentWorker().catch((err) => {
  logger.error({ err }, 'failed to start agent worker');
});
