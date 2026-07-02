import { Hono } from 'hono';
import { z } from 'zod';
import {
  AgentExistsError,
  createAgent,
  createAgentSchema,
  getAgent,
  listAgents,
  updateAgentStatus,
} from '../agents.js';
import { logger } from '../logger.js';
import { requireRunnerAuth } from './routeAuth.js';

export const agentsRoute = new Hono();

// Escritas exigem bearer; leituras são abertas (rede interna, igual runs/artifacts).
agentsRoute.post('/agents', requireRunnerAuth);
agentsRoute.patch('/agents/:id', requireRunnerAuth);

const patchSchema = z.object({ status: z.enum(['active', 'deprecated']) });
const statusSchema = z.enum(['active', 'deprecated']).optional();

/** Lista o catálogo (descoberta). Filtra por key/status. */
agentsRoute.get('/agents', async (c) => {
  const key = c.req.query('key');
  const parsedStatus = statusSchema.safeParse(c.req.query('status') ?? undefined);
  if (!parsedStatus.success) return c.json({ error: 'status inválido' }, 400);
  return c.json({ agents: await listAgents({ key, status: parsedStatus.data }) });
});

/** Detalhe de um agente. */
agentsRoute.get('/agents/:id', async (c) => {
  const row = await getAgent(c.req.param('id'));
  if (!row) return c.json({ error: 'not found' }, 404);
  return c.json(row);
});

/** Registra um agente/versão. */
agentsRoute.post('/agents', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = createAgentSchema.safeParse(body);
  if (!parsed.success)
    return c.json({ error: 'payload inválido', issues: parsed.error.issues }, 400);
  try {
    const row = await createAgent(parsed.data);
    return c.json(row, 201);
  } catch (err) {
    if (err instanceof AgentExistsError) return c.json({ error: 'agent already exists' }, 409);
    logger.error({ err }, 'failed to create agent');
    return c.json({ error: 'internal server error' }, 500);
  }
});

/** Muda o status de um agente (ex. deprecate). */
agentsRoute.patch('/agents/:id', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'status inválido' }, 400);
  const row = await updateAgentStatus(c.req.param('id'), parsed.data.status);
  if (!row) return c.json({ error: 'not found' }, 404);
  return c.json(row);
});
