import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { health } from './health.js';

describe('GET /healthz', () => {
  it('returns 200 with ok=true and numeric uptime', async () => {
    const app = new Hono();
    app.route('/', health);

    const res = await app.request('/healthz');
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      uptime: expect.any(Number),
    });
    expect(body.uptime).toBeGreaterThanOrEqual(0);
  });
});
