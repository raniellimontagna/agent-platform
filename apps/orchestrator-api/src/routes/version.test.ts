import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { versionRoute } from './version.js';

describe('GET /version', () => {
  it('returns the version from package.json', async () => {
    const app = new Hono();
    app.route('/', versionRoute);

    const response = await app.request('/version');
    const body = await response.json();

    const packageJsonPath = new URL('../../package.json', import.meta.url);
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as {
      version: string;
    };

    expect(response.status).toBe(200);
    expect(body).toEqual({ version: packageJson.version });
  });
});
