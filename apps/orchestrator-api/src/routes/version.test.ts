import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Hono } from 'hono';
import { versionRoute } from './version.js';

const packageJsonPath = new URL('../../package.json', import.meta.url);
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as {
  version: string;
};

test('GET /version returns the package version', async () => {
  const app = new Hono();
  app.route('/', versionRoute);

  const response = await app.request('/version');

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    version: packageJson.version,
  });
});
