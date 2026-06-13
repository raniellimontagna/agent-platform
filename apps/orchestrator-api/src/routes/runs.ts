import { Hono } from 'hono';
import { listLessons } from '../lessons.js';
import { logger } from '../logger.js';
import { JOB_PRIORITY, agentQueue } from '../queue.js';
import {
  getRun,
  listApprovals,
  listRunStepCosts,
  listRuns,
  listSteps,
  resolveApproval,
  runCostUsd,
  updateRunStatus,
} from '../runs.js';

// Rede interna (VPN/vmbr1). Aprovação dispara execução de código — quando
// houver ingress externo (Tailscale), proteger com token de admin.
export const runsRoute = new Hono();

/** Histórico de execuções (MAC-36). `?limit=` (máx 200) e `?offset=` (mín 0). */
runsRoute.get('/runs', async (c) => {
  const rawLimit = Number.parseInt(c.req.query('limit') ?? '', 10);
  const limit = Math.min(Number.isNaN(rawLimit) ? 50 : rawLimit, 200);
  const rawOffset = Number.parseInt(c.req.query('offset') ?? '', 10);
  const offset = Math.max(Number.isNaN(rawOffset) ? 0 : rawOffset, 0);
  const runs = await listRuns(limit, offset);
  return c.json({ runs, limit, offset });
});

runsRoute.get('/runs/:id', async (c) => {
  const run = await getRun(c.req.param('id'));
  if (!run) return c.json({ error: 'not found' }, 404);
  return c.json(run);
});

/** Custo agregado de um run, somando os steps (MAC-40/59). */
runsRoute.get('/runs/:id/cost', async (c) => {
  const runId = c.req.param('id');

  try {
    const run = await getRun(runId);
    if (!run) return c.json({ error: 'not found' }, 404);

    const [totalCostUsd, steps] = await Promise.all([runCostUsd(runId), listRunStepCosts(runId)]);

    return c.json({
      runId,
      totalCostUsd,
      steps,
    });
  } catch (err) {
    logger.error({ err, runId }, 'failed to get run cost');
    return c.json({ error: 'internal server error' }, 500);
  }
});

/** Etapas de um run com tempo/resultado (MAC-36). */
runsRoute.get('/runs/:id/steps', async (c) => {
  return c.json({ steps: await listSteps(c.req.param('id')) });
});

/** Aprovações de um run e seus motivos (MAC-41). */
runsRoute.get('/runs/:id/approvals', async (c) => {
  return c.json({ approvals: await listApprovals(c.req.param('id')) });
});

/** Lições acumuladas de um repo (Memory Layer, MAC-23). `?repo=owner/name`, `?limit=`. */
runsRoute.get('/lessons', async (c) => {
  const repo = c.req.query('repo');
  if (!repo) return c.json({ error: 'query `repo` obrigatória (owner/name)' }, 400);
  const limit = Math.min(Number(c.req.query('limit')) || 50, 200);
  return c.json({ lessons: await listLessons(repo, limit) });
});

/** Aprova um run pausado e retoma o grafo (MAC-22/41). */
runsRoute.post('/runs/:id/approve', async (c) => {
  const id = c.req.param('id');
  const run = await getRun(id);
  if (!run) return c.json({ error: 'not found' }, 404);
  if (run.status !== 'awaiting_approval') {
    return c.json({ error: `run não está aguardando aprovação (status: ${run.status})` }, 409);
  }

  await resolveApproval(id, 'approved', c.req.query('by') ?? 'human');
  await updateRunStatus(id, 'executing');
  await agentQueue.add('resume', { kind: 'resume', runId: id }, { priority: JOB_PRIORITY.resume });
  logger.info({ runId: id }, 'run approved, resuming');
  return c.json({ ok: true, runId: id, resumed: true });
});

/** Reprova um run pausado (encerra). */
runsRoute.post('/runs/:id/reject', async (c) => {
  const id = c.req.param('id');
  const run = await getRun(id);
  if (!run) return c.json({ error: 'not found' }, 404);

  await resolveApproval(id, 'rejected', c.req.query('by') ?? 'human');
  await updateRunStatus(id, 'cancelled');
  logger.info({ runId: id }, 'run rejected');
  return c.json({ ok: true, runId: id, cancelled: true });
});
