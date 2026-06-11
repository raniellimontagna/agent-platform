import { readFileSync } from 'node:fs';
import { Hono } from 'hono';
import { logger } from '../logger.js';

const packageJsonPath = new URL('../../package.json', import.meta.url);

function readVersion() {
  const raw = readFileSync(packageJsonPath, 'utf-8');
  const pkg = JSON.parse(raw) as { version?: string };

  if (!pkg.version) {
    throw new Error('package.json version is missing');
  }

  return pkg.version;
}

export const versionRoute = new Hono();

versionRoute.get('/version', (c) => {
  try {
    const version = readVersion();
    return c.json({ version }, 200);
  } catch (err) {
    logger.error({ err }, 'failed to read package version');
    return c.json({ error: 'internal server error' }, 500);
  }
});
