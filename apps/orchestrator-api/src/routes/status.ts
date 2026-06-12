import { createRequire } from 'node:module';
import { Hono } from 'hono';

const require = createRequire(import.meta.url);
const { version } = require('../../package.json') as { version: string };

export const statusRoute = new Hono();

statusRoute.get('/status', (c) => {
  return c.json({ status: 'ok', version });
});
