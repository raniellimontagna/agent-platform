import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { db } from '../db/client.js';

export const health = new Hono();

health.get('/health', (c) => {
  return c.json({ status: 'ok', uptime: process.uptime() });
});

health.get('/health/ready', async (c) => {
  try {
    await db.execute(sql`select 1`);
    return c.json({ status: 'ready', db: 'up' });
  } catch {
    return c.json({ status: 'not_ready', db: 'down' }, 503);
  }
});
