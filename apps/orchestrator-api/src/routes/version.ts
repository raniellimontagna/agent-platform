import { createRequire } from 'node:module';
import { Hono } from 'hono';

const require = createRequire(import.meta.url);
const { version } = require('../../package.json') as { version: string };

export const versionRoute = new Hono();

versionRoute.get('/version', (c) => {
  return c.json({ version }, 200);
});
