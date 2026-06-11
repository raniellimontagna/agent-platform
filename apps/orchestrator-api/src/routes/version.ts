import { readFileSync } from 'node:fs';
import { Hono } from 'hono';

export const readApplicationVersion = () => {
  const packageJsonPath = new URL('../../package.json', import.meta.url);
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
    version?: string;
  };

  if (!packageJson.version) {
    throw new Error('Application version not found');
  }

  return packageJson.version;
};

export const versionRoutes = new Hono();

versionRoutes.get('/', (c) => {
  try {
    const version = readApplicationVersion();
    return c.json({ version }, 200);
  } catch {
    return c.json({ error: 'Unable to read application version' }, 500);
  }
});
