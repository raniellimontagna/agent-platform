import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { ping } from './ping.js';

describe('GET /ping', () => {
  it('returns 200 with pong true and a valid ISO timestamp', async () => {
    const app = new Hono();
    app.route('/', ping);

    const response = await app.request('/ping');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      pong: true,
      time: expect.any(String),
    });
    expect(Number.isNaN(Date.parse(body.time))).toBe(false);
    expect(new Date(body.time).toISOString()).toBe(body.time);
  });
});
