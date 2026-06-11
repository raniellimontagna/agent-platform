import { readFileSync } from 'node:fs';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { versionRoute } from './version.js';

describe('GET /version', () => {
  it('returns the package version', async () => {
    const app = new Hono();
    app.route('/', versionRoute);

    const response = await app.request('/version');
    const body = (await response.json()) as { version: string };

    const pkg = JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url), 'utf-8'),
    ) as { version: string };

    expect(response.status).toBe(200);
    expect(body).toEqual({ version: pkg.version });
  });
});
