import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { health } from './health.js';

describe('health routes', () => {
  it('returns 200 and ok payload on GET /healthz', async () => {
    const app = new Hono();
    app.route('/', health);

    const res = await app.request('/healthz');
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual(
      expect.objectContaining({
        ok: true,
        uptime: expect.any(Number),
      }),
    );
  });
});
