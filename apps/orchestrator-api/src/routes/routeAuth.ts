import type { Context, Next } from 'hono';
import { env } from '../env.js';

export async function requireRunnerAuth(c: Context, next: Next) {
  if (c.req.header('authorization') !== `Bearer ${env.RUNNER_AUTH_TOKEN}`) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  await next();
}
