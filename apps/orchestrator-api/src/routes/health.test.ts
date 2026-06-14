import { describe, expect, it } from 'vitest';
import { health } from './health.js';

describe('health routes', () => {
  it('returns ready=true on GET /healthz/ready', async () => {
    const res = await health.request('http://localhost/healthz/ready');

    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toEqual({ ready: true });
    expect(typeof body.ready).toBe('boolean');
    expect(body.ready).toBe(true);
  });

  it('returns status=alive on GET /healthz/live', async () => {
    const res = await health.request('http://localhost/healthz/live');

    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toEqual({ status: 'alive' });
    expect(typeof body.status).toBe('string');
    expect(body.status).toBe('alive');
  });
});
