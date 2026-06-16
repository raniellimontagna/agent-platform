import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getRun, listRunStepCosts, listRuns } from '../runs.js';
import { runsRoute } from './runs.js';

vi.mock('../lessonLoader.js', () => ({
  retrieveLessons: vi.fn(),
}));

vi.mock('../lessons.js', () => ({
  listLessons: vi.fn(),
  searchLessons: vi.fn(),
}));

vi.mock('../logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../queue.js', () => ({
  JOB_PRIORITY: {
    resume: 1,
  },
  agentQueue: {
    add: vi.fn(),
  },
}));

vi.mock('../runs.js', () => ({
  getRun: vi.fn(),
  listApprovals: vi.fn(),
  listRunStepCosts: vi.fn(),
  listRuns: vi.fn(),
  listSteps: vi.fn(),
  resolveApproval: vi.fn(),
  runCostUsd: vi.fn(),
  updateRunStatus: vi.fn(),
}));

describe('GET /runs', () => {
  const app = new Hono();
  app.route('/', runsRoute);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listRuns).mockResolvedValue([]);
  });

  it('parses limit and offset from query and returns them in response', async () => {
    const res = await app.request('/runs?limit=10&offset=20');

    expect(res.status).toBe(200);
    expect(listRuns).toHaveBeenCalledWith(10, 20);
    await expect(res.json()).resolves.toEqual({ runs: [], limit: 10, offset: 20 });
  });

  it('uses default pagination when params are absent', async () => {
    const res = await app.request('/runs');

    expect(res.status).toBe(200);
    expect(listRuns).toHaveBeenCalledWith(50, 0);
    await expect(res.json()).resolves.toEqual({ runs: [], limit: 50, offset: 0 });
  });

  it('clamps limit to 200 and offset to minimum 0', async () => {
    const res = await app.request('/runs?limit=999&offset=-5');

    expect(res.status).toBe(200);
    expect(listRuns).toHaveBeenCalledWith(200, 0);
    await expect(res.json()).resolves.toEqual({ runs: [], limit: 200, offset: 0 });
  });

  it('parseia como inteiro, truncando frações e ignorando lixo', async () => {
    const res = await app.request('/runs?limit=10.9&offset=abc');

    expect(res.status).toBe(200);
    // limit=10.9 → 10 (parseInt); offset=abc → NaN → default 0.
    expect(listRuns).toHaveBeenCalledWith(10, 0);
    await expect(res.json()).resolves.toEqual({ runs: [], limit: 10, offset: 0 });
  });
});

describe('GET /runs/:id/cost', () => {
  const app = new Hono();
  app.route('/', runsRoute);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns aggregated run cost with steps shape', async () => {
    const steps = [
      { type: 'plan', costUsd: 0.5 },
      { type: 'code', costUsd: 0.75 },
    ];

    vi.mocked(getRun).mockResolvedValue({ id: 'run-123', status: 'completed' } as never);
    vi.mocked(listRunStepCosts).mockResolvedValue(steps as never);

    const res = await app.request('/runs/run-123/cost');

    expect(res.status).toBe(200);
    expect(getRun).toHaveBeenCalledWith('run-123');
    expect(listRunStepCosts).toHaveBeenCalledWith('run-123');
    await expect(res.json()).resolves.toEqual({
      runId: 'run-123',
      totalCostUsd: steps.reduce((sum, step) => sum + step.costUsd, 0),
      steps,
    });
  });

  it('returns 404 when run does not exist', async () => {
    vi.mocked(getRun).mockResolvedValue(null);

    const res = await app.request('/runs/missing/cost');

    expect(res.status).toBe(404);
    expect(listRunStepCosts).not.toHaveBeenCalled();
    await expect(res.json()).resolves.toEqual({ error: 'not found' });
  });

  it('returns 500 on unexpected error', async () => {
    vi.mocked(getRun).mockRejectedValue(new Error('db down'));

    const res = await app.request('/runs/run-123/cost');

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: 'internal server error' });
  });
});
