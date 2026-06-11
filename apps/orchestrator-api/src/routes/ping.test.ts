import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { ping } from './ping.js';

describe('GET /ping', () => {
  it('returns 200 with pong and an ISO timestamp', async () => {
    const app = new Hono();
    app.route('/', ping);

    const res = await app.request('/ping');
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ pong: true });
    expect(typeof body.time).toBe('string');
    expect(new Date(body.time).toISOString()).toBe(body.time);
  });
});
