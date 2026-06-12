import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runsRoute } from './runs.js';
import { listRuns } from '../runs.js';

vi.mock('../lessons.js', () => ({
  listLessons: vi.fn(),
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
  listRuns: vi.fn(),
  listSteps: vi.fn(),
  resolveApproval: vi.fn(),
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
