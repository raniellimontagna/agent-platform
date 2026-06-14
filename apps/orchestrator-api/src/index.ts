import { serve } from '@hono/node-server';
import { buildApp } from './app.js';
import { env } from './env.js';
import { logger } from './logger.js';
import { startAgentWorker } from './worker.js';
import { startScheduleWorker } from './scheduleWorker.js';

const app = buildApp();

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
