import { readFileSync } from 'node:fs';
import { Hono } from 'hono';

function getPackageVersion() {
  const packageJsonPath = new URL('../../package.json', import.meta.url);
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as {
    version?: string;
  };

  return packageJson.version ?? 'unknown';
}

export const versionRoute = new Hono();

versionRoute.get('/version', (c) => {
  return c.json({ version: getPackageVersion() });
});
