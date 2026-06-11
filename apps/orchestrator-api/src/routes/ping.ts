import { Hono } from 'hono';

export const ping = new Hono();

ping.get('/ping', (c) => {
  return c.json({ pong: true, time: new Date().toISOString() });
});
