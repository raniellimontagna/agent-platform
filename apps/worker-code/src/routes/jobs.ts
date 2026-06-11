import { type Context, Hono, type Next } from 'hono';
import { env } from '../env.js';
import { reportResult, runJob } from '../executor/runJob.js';
import { logger } from '../logger.js';
import { jobSchema } from '../types.js';

export const jobs = new Hono();

/** Autentica chamadas do orquestrador via bearer token compartilhado. */
async function requireAuth(c: Context, next: Next) {
  if (c.req.header('authorization') !== `Bearer ${env.RUNNER_AUTH_TOKEN}`) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  await next();
}

jobs.use('/jobs', requireAuth);
jobs.use('/jobs/*', requireAuth);

/** Assíncrono: aceita o job e devolve o resultado via callback (MAC-37). */
jobs.post('/jobs', async (c) => {
  const parsed = jobSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: 'invalid job', issues: parsed.error.issues }, 400);
  }
  const job = parsed.data;
  logger.info({ runId: job.runId, issue: job.issueIdentifier }, 'job accepted (async)');
  void runJob(job).then(reportResult);
  return c.json({ accepted: true, runId: job.runId }, 202);
});

/** Síncrono: roda o job e devolve o resultado na própria resposta. */
jobs.post('/jobs/sync', async (c) => {
  const parsed = jobSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: 'invalid job', issues: parsed.error.issues }, 400);
  }
  const job = parsed.data;
  logger.info({ runId: job.runId, issue: job.issueIdentifier }, 'job accepted (sync)');
  const result = await runJob(job);
  return c.json(result);
});
