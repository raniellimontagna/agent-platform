import { createRequire } from 'node:module';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { versionRoute } from './version.js';

const require = createRequire(import.meta.url);
const { version } = require('../../package.json') as { version: string };

describe('GET /version', () => {
  it('returns the current package version', async () => {
    const app = new Hono();
    app.route('/', versionRoute);

    const response = await app.request('/version');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    await expect(response.json()).resolves.toEqual({ version });
  });
});
