import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { env } from './env.js';
import { logger } from './logger.js';
import { health } from './routes/health.js';
import { jobs } from './routes/jobs.js';

const app = new Hono();

app.route('/', health);
app.route('/', jobs);

app.notFound((c) => c.json({ error: 'not found' }, 404));

app.onError((err, c) => {
  logger.error({ err }, 'unhandled error');
  return c.json({ error: 'internal server error' }, 500);
});

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  logger.info(`worker-code listening on :${info.port}`);
});
