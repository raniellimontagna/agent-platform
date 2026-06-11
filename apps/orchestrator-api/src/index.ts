import { Hono } from 'hono';
import { logger as honoLogger } from 'hono/logger';
import { env } from './env';
import { logger } from './logger';
import { healthRoute } from './routes/health';
import { runsRoute } from './routes/runs';
import { versionRoute } from './routes/version';
import { webhooksRoute } from './routes/webhooks';

const app = new Hono();

app.use('*', honoLogger((message) => logger.info(message)));

app.get('/', (c) => c.json({ ok: true, service: 'orchestrator-api' }));
app.route('/health', healthRoute);
app.route('/version', versionRoute);
app.route('/webhooks', webhooksRoute);
app.route('/runs', runsRoute);

export default {
  port: env.PORT,
  fetch: app.fetch
};
