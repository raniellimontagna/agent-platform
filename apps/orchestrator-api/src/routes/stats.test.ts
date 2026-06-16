import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runStats } from '../runs.js';
import { statsRoute } from './stats.js';

vi.mock('../runs.js', () => ({
  runStats: vi.fn(),
}));

describe('GET /stats', () => {
  const app = new Hono();
  app.route('/', statsRoute);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the aggregated stats summary', async () => {
    vi.mocked(runStats).mockResolvedValue({
      total_runs: 10,
      runs_by_status: {
        completed: 7,
        failed: 2,
        executing: 1,
      },
      success_rate: 70,
      total_cost_usd: 12.34,
      cost_last_24h_usd: 5.67,
      total_lessons: 8,
      avg_fix_attempts: 1.4,
    });

    const res = await app.request('/stats');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      total_runs: 10,
      runs_by_status: {
        completed: 7,
        failed: 2,
        executing: 1,
      },
      success_rate: 70,
      total_cost_usd: 12.34,
      cost_last_24h_usd: 5.67,
      total_lessons: 8,
      avg_fix_attempts: 1.4,
    });
    expect(runStats).toHaveBeenCalledTimes(1);
  });

  it('returns all expected fields with correct types', async () => {
    vi.mocked(runStats).mockResolvedValue({
      total_runs: 4,
      runs_by_status: {
        completed: 3,
        failed: 1,
      },
      success_rate: 75,
      total_cost_usd: 4.5,
      cost_last_24h_usd: 1.25,
      total_lessons: 2,
      avg_fix_attempts: 0.5,
    });

    const res = await app.request('/stats');
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toHaveProperty('total_runs');
    expect(body).toHaveProperty('runs_by_status');
    expect(body).toHaveProperty('success_rate');
    expect(body).toHaveProperty('total_cost_usd');
    expect(body).toHaveProperty('cost_last_24h_usd');
    expect(body).toHaveProperty('total_lessons');
    expect(body).toHaveProperty('avg_fix_attempts');

    expect(typeof body.total_runs).toBe('number');
    expect(typeof body.runs_by_status).toBe('object');
    expect(typeof body.success_rate).toBe('number');
    expect(typeof body.total_cost_usd).toBe('number');
    expect(typeof body.cost_last_24h_usd).toBe('number');
    expect(typeof body.total_lessons).toBe('number');
    expect(typeof body.avg_fix_attempts).toBe('number');
    expect(body.success_rate).toBe(75);
  });

  it('returns 500 when stats aggregation fails', async () => {
    vi.mocked(runStats).mockRejectedValue(new Error('db down'));

    const res = await app.request('/stats');

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'internal server error' });
  });
});
