import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { env } from './env.js';
import { logger } from './logger.js';
import { adminRoute } from './routes/admin.js';
import { health } from './routes/health.js';
import { runsRoute } from './routes/runs.js';
import { statsRoute } from './routes/stats.js';
import { webhooks } from './routes/webhooks.js';
import { startAgentWorker } from './worker.js';
import { schedulesRoute } from './routes/schedules.js';
import { artifactsRoute } from './routes/artifacts.js';
import { startScheduleWorker } from './scheduleWorker.js';
import { isUuid } from './uuid.js';

const app = new Hono();

// MAC-64: rotas `:id` batem em colunas uuid — id não-uuid faria o cast do
// Postgres lançar (→ 500). Rejeita cedo com 404 (id inválido = não encontrado).
app.use('*', async (c, next) => {
  const id = c.req.param('id');
  if (id !== undefined && !isUuid(id)) {
    return c.json({ error: 'not found' }, 404);
  }
  await next();
});

app.route('/', health);
app.route('/', webhooks);
app.route('/', runsRoute);
app.route('/', statsRoute);
app.route('/', adminRoute);
app.route('/', schedulesRoute);
app.route('/', artifactsRoute);

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

// Sobe o worker dos agendamentos (MAC-38) — disparos cron + reconciliação.
startScheduleWorker().catch((err) => {
  logger.error({ err }, 'failed to start schedule worker');
});
