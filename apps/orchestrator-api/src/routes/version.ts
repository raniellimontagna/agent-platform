import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageJsonPath = resolve(__dirname, '../../package.json');

const packageVersionPromise = readFile(packageJsonPath, 'utf8').then((content) => {
  const pkg = JSON.parse(content) as { version: string };
  return pkg.version;
});

export const version = new Hono();

version.get('/version', async (c) => {
  const appVersion = await packageVersionPromise;
  return c.json({ version: appVersion }, 200);
});
