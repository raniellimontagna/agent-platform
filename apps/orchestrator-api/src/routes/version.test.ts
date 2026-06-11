import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Hono } from 'hono';

import { versionRoutes } from './version';

test('GET /version returns the application version from package.json', async () => {
  const app = new Hono();
  app.route('/version', versionRoutes);

  const response = await app.request('/version');
  const body = await response.json();
  const packageJson = JSON.parse(
    readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
  ) as { version: string };

  assert.equal(response.status, 200);
  assert.deepEqual(body, { version: packageJson.version });
});
