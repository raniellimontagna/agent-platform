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
});
