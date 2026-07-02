import { Hono } from 'hono';
import { isValidCron } from '../cron.js';
import { env } from '../env.js';
import { logger } from '../logger.js';
import { listRunsBySchedule } from '../runs.js';
import { removeScheduleJob, upsertScheduleJob } from '../scheduleQueue.js';
import {
  createSchedule,
  deleteSchedule,
  getSchedule,
  listSchedules,
  updateSchedule,
} from '../schedules.js';
import { requireRunnerAuth } from './routeAuth.js';

export const schedulesRoute = new Hono();

schedulesRoute.use('/schedules', requireRunnerAuth);
schedulesRoute.use('/schedules/*', requireRunnerAuth);

/** Cria um agendamento (valida cron antes de persistir). */
schedulesRoute.post('/schedules', async (c) => {
  try {
    const body = await c.req.json().catch(() => null);
    if (!body || !body.name || !body.cron || !body.title || !body.description) {
      return c.json({ error: 'name, cron, title e description são obrigatórios' }, 400);
    }
    const tz = typeof body.tz === 'string' && body.tz ? body.tz : env.SCHEDULER_TZ;
    if (!isValidCron(body.cron, tz)) {
      return c.json({ error: 'cron inválido' }, 400);
    }
    const row = await createSchedule({
      name: body.name,
      cron: body.cron,
      title: body.title,
      description: body.description,
      tz,
      autoApprove: typeof body.auto_approve === 'boolean' ? body.auto_approve : undefined,
      enabled: typeof body.enabled === 'boolean' ? body.enabled : undefined,
    });
    if (row.enabled) {
      await upsertScheduleJob({ id: row.id, cron: row.cron, tz: row.tz });
    }
    return c.json(row, 201);
  } catch (err) {
    logger.error({ err }, 'failed to create schedule');
    return c.json({ error: 'internal server error' }, 500);
  }
});

/** Lista agendamentos. */
schedulesRoute.get('/schedules', async (c) => {
  return c.json({ schedules: await listSchedules() });
});

/** Um agendamento. */
schedulesRoute.get('/schedules/:id', async (c) => {
  const row = await getSchedule(c.req.param('id'));
  if (!row) return c.json({ error: 'not found' }, 404);
  return c.json(row);
});

/** Histórico de runs de um agendamento. */
schedulesRoute.get('/schedules/:id/runs', async (c) => {
  return c.json({ runs: await listRunsBySchedule(c.req.param('id')) });
});

/** Atualiza um agendamento e reconcilia o scheduler. */
schedulesRoute.patch('/schedules/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => null);
    if (!body) return c.json({ error: 'body inválido' }, 400);
    if (body.cron !== undefined) {
      const tz = typeof body.tz === 'string' && body.tz ? body.tz : env.SCHEDULER_TZ;
      if (!isValidCron(body.cron, tz)) return c.json({ error: 'cron inválido' }, 400);
    }
    const row = await updateSchedule(id, {
      name: body.name,
      cron: body.cron,
      title: body.title,
      description: body.description,
      tz: body.tz,
      autoApprove: typeof body.auto_approve === 'boolean' ? body.auto_approve : undefined,
      enabled: typeof body.enabled === 'boolean' ? body.enabled : undefined,
    });
    if (!row) return c.json({ error: 'not found' }, 404);
    if (row.enabled) {
      await upsertScheduleJob({ id: row.id, cron: row.cron, tz: row.tz });
    } else {
      await removeScheduleJob(row.id);
    }
    return c.json(row);
  } catch (err) {
    logger.error({ err }, 'failed to update schedule');
    return c.json({ error: 'internal server error' }, 500);
  }
});

/** Remove um agendamento + o scheduler. */
schedulesRoute.delete('/schedules/:id', async (c) => {
  const id = c.req.param('id');
  const removed = await deleteSchedule(id);
  if (!removed) return c.json({ error: 'not found' }, 404);
  await removeScheduleJob(id);
  return c.body(null, 204);
});
