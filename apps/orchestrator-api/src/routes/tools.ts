import { type Context, Hono, type Next } from 'hono';
import { z } from 'zod';
import { env } from '../env.js';
import { logger } from '../logger.js';
import {
  ToolExistsError,
  createTool,
  createToolSchema,
  getTool,
  listTools,
  updateToolStatus,
} from '../tools.js';

export const toolsRoute = new Hono();

async function requireAuth(c: Context, next: Next) {
  if (c.req.header('authorization') !== `Bearer ${env.RUNNER_AUTH_TOKEN}`) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  await next();
}

// Escritas exigem bearer; leituras são abertas (rede interna, igual agents/runs).
toolsRoute.post('/tools', requireAuth);
toolsRoute.patch('/tools/:id', requireAuth);

const statusSchema = z.enum(['active', 'deprecated']).optional();
const riskSchema = z.enum(['safe', 'caution', 'dangerous']).optional();
const patchSchema = z.object({ status: z.enum(['active', 'deprecated']) });

/** Lista o catálogo (descoberta). Filtra por key/status/risk. */
toolsRoute.get('/tools', async (c) => {
  const key = c.req.query('key');
  const status = statusSchema.safeParse(c.req.query('status') ?? undefined);
  if (!status.success) return c.json({ error: 'status inválido' }, 400);
  const risk = riskSchema.safeParse(c.req.query('risk') ?? undefined);
  if (!risk.success) return c.json({ error: 'risk inválido' }, 400);
  return c.json({ tools: await listTools({ key, status: status.data, risk: risk.data }) });
});

/** Detalhe de uma tool. */
toolsRoute.get('/tools/:id', async (c) => {
  const row = await getTool(c.req.param('id'));
  if (!row) return c.json({ error: 'not found' }, 404);
  return c.json(row);
});

/** Registra uma tool/versão. */
toolsRoute.post('/tools', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = createToolSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'payload inválido', issues: parsed.error.issues }, 400);
  try {
    const row = await createTool(parsed.data);
    return c.json(row, 201);
  } catch (err) {
    if (err instanceof ToolExistsError) return c.json({ error: 'tool already exists' }, 409);
    logger.error({ err }, 'failed to create tool');
    return c.json({ error: 'internal server error' }, 500);
  }
});

/** Muda o status de uma tool (ex. deprecate). */
toolsRoute.patch('/tools/:id', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'status inválido' }, 400);
  const row = await updateToolStatus(c.req.param('id'), parsed.data.status);
  if (!row) return c.json({ error: 'not found' }, 404);
  return c.json(row);
});
