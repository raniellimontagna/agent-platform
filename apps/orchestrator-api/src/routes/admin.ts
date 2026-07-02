import { Hono } from 'hono';
import { getAgent } from '../agent.js';
import { env } from '../env.js';
import { isPaused, setPaused } from '../killswitch.js';
import { logger } from '../logger.js';
import {
  buildMissionDetailData,
  buildRecentMissionSummaries,
  normalizeMissionLimit,
} from '../missionControlData.js';
import { renderMissionControlPage, renderMissionDetailPage } from '../missionControlRender.js';
import { listE2eMissionScenarios } from '../missionScenarios.js';
import { ACTIVE_STATUSES, countRunsByStatus, listRunsForCard } from '../runs.js';
import { requireRunnerAuth } from './routeAuth.js';

export { renderMissionControlPage, renderMissionDetailPage } from '../missionControlRender.js';

export const adminRoute = new Hono();

/** Protege os controles operacionais com o token interno compartilhado. */
adminRoute.use('/admin/*', requireRunnerAuth);

/** Liga o kill switch: para de aceitar e adia os runs (MAC-32). */
adminRoute.post('/admin/pause', async (c) => {
  await setPaused(true);
  logger.warn('KILL SWITCH ligado — agentes pausados');
  return c.json({ paused: true });
});

/** Desliga o kill switch: volta a processar. */
adminRoute.post('/admin/resume', async (c) => {
  await setPaused(false);
  logger.warn('kill switch desligado — agentes retomados');
  return c.json({ paused: false });
});

adminRoute.get('/admin/status', async (c) => {
  return c.json({ paused: await isPaused() });
});

/** Snapshot de saúde dos runners conhecidos (MAC-39). */
adminRoute.get('/admin/runners', async (c) => {
  const { workerManager } = await getAgent();
  return c.json({ runners: await workerManager.probeAll() });
});

/** Observabilidade de concorrência (MAC-47): limite + runs ativos por status. */
adminRoute.get('/admin/concurrency', async (c) => {
  const byStatus = await countRunsByStatus();
  const active = ACTIVE_STATUSES.reduce((sum, s) => sum + (byStatus[s] ?? 0), 0);
  return c.json({ limit: env.AGENT_MAX_CONCURRENCY, active, byStatus });
});

adminRoute.get('/admin/mission-control', async (c) => {
  const scenarios = listE2eMissionScenarios();
  const missions = await buildRecentMissionSummaries(20, scenarios);
  return c.html(renderMissionControlPage({ scenarios, missions }));
});

adminRoute.get('/admin/mission-control/scenarios', async (c) => {
  return c.json({ scenarios: listE2eMissionScenarios() });
});

adminRoute.get('/admin/api/mission-control/scenarios', async (c) => {
  return c.json({ scenarios: listE2eMissionScenarios() });
});

adminRoute.get('/admin/mission-control/missions', async (c) => {
  const safeLimit = normalizeMissionLimit(c.req.query('limit'));
  const missions = await buildRecentMissionSummaries(safeLimit, listE2eMissionScenarios());

  return c.json({ missions });
});

adminRoute.get('/admin/api/mission-control/missions', async (c) => {
  const safeLimit = normalizeMissionLimit(c.req.query('limit'));
  const missions = await buildRecentMissionSummaries(safeLimit, listE2eMissionScenarios());

  return c.json({ missions });
});

adminRoute.get('/admin/mission-control/missions/:runId', async (c) => {
  const detail = await buildMissionDetailData(c.req.param('runId'), listE2eMissionScenarios());
  if (!detail) return c.json({ error: 'not found' }, 404);

  return c.html(renderMissionDetailPage(detail));
});

adminRoute.get('/admin/card-runs', async (c) => {
  const provider = c.req.query('provider');
  const cardId = c.req.query('cardId');
  const limit = Number(c.req.query('limit') ?? 20);

  if (!provider || !cardId) {
    return c.json({ error: 'provider and cardId are required' }, 400);
  }
  if (provider !== 'plane' && provider !== 'linear') {
    return c.json({ error: 'provider must be plane or linear' }, 400);
  }

  const runs = await listRunsForCard(
    provider,
    cardId,
    Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 100) : 20,
  );
  return c.json({ runs });
});
