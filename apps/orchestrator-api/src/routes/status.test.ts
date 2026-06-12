import { createRequire } from 'node:module';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { statusRoute } from './status.js';

const require = createRequire(import.meta.url);
const { version } = require('../../package.json') as { version: string };

describe('GET /status', () => {
  it('returns 200 with status ok and package version', async () => {
    const app = new Hono();
    app.route('/', statusRoute);

    const res = await app.request('/status');
    const body = (await res.json()) as { status: string; version: string };

    expect(res.status).toBe(200);
    expect(body).toEqual({ status: 'ok', version });
  });
});
