import { Hono } from 'hono';
import { env } from '../env.js';
import { reportResult, runJob } from '../executor/runJob.js';
import { logger } from '../logger.js';
import { jobSchema } from '../types.js';

export const jobs = new Hono();

/** Autentica chamadas do orquestrador via bearer token compartilhado. */
jobs.use('/jobs/*', async (c, next) => {
  const auth = c.req.header('authorization');
  if (auth !== `Bearer ${env.RUNNER_AUTH_TOKEN}`) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  await next();
});

jobs.post('/jobs', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = jobSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'invalid job', issues: parsed.error.issues }, 400);
  }

  const job = parsed.data;
  logger.info({ runId: job.runId, issue: job.issueIdentifier }, 'job accepted');

  // Executa de forma assíncrona; resultado volta ao orquestrador via callback.
  void runJob(job).then(reportResult);

  return c.json({ accepted: true, runId: job.runId }, 202);
});
