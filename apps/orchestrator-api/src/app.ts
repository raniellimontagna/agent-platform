import { Hono, type MiddlewareHandler } from 'hono';
import { logger } from './logger.js';
import { adminRoute } from './routes/admin.js';
import { agentsRoute } from './routes/agents.js';
import { artifactsRoute } from './routes/artifacts.js';
import { health } from './routes/health.js';
import { registryRoute } from './routes/registry.js';
import { runsRoute } from './routes/runs.js';
import { schedulesRoute } from './routes/schedules.js';
import { statsRoute } from './routes/stats.js';
import { toolsRoute } from './routes/tools.js';
import { webhooks } from './routes/webhooks.js';
import { isUuid } from './uuid.js';

/**
 * Monta o app Hono com rotas e middlewares. Separado do bootstrap (index.ts)
 * pra ser testável sem subir servidor/workers.
 */
export function buildApp(): Hono {
  const app = new Hono();

  // MAC-64: rotas `:id` batem em colunas uuid — id não-uuid faria o cast do
  // Postgres lançar (→ 500). Rejeita cedo com 404 (id inválido = não encontrado).
  // Registrar nos padrões `:id` reais: o Hono só popula `c.req.param('id')`
  // quando o path do middleware tem o segmento nomeado (`*` não tem → undefined).
  const uuidGuard: MiddlewareHandler = async (c, next) => {
    const id = c.req.param('id');
    if (id !== undefined && !isUuid(id)) {
      return c.json({ error: 'not found' }, 404);
    }
    await next();
  };
  for (const pattern of [
    '/runs/:id',
    '/runs/:id/*',
    '/artifacts/:id',
    '/schedules/:id',
    '/schedules/:id/*',
    '/agents/:id',
    '/agents/:id/*',
    '/tools/:id',
    '/tools/:id/*',
  ]) {
    app.use(pattern, uuidGuard);
  }

  app.route('/', health);
  app.route('/', registryRoute);
  app.route('/', webhooks);
  app.route('/', runsRoute);
  app.route('/', statsRoute);
  app.route('/', adminRoute);
  app.route('/', schedulesRoute);
  app.route('/', artifactsRoute);
  app.route('/', agentsRoute);
  app.route('/', toolsRoute);

  app.notFound((c) => c.json({ error: 'not found' }, 404));

  app.onError((err, c) => {
    logger.error({ err }, 'unhandled error');
    return c.json({ error: 'internal server error' }, 500);
  });

  return app;
}
