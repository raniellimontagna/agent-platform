import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { countRunsByStatus, listRunsForCard } from '../runs.js';
import { adminRoute } from './admin.js';

vi.mock('../runs.js', () => ({
  countRunsByStatus: vi.fn(),
  listRunsForCard: vi.fn(),
  ACTIVE_STATUSES: ['pending', 'planning', 'awaiting_approval', 'executing', 'reviewing'],
}));
vi.mock('../env.js', () => ({ env: { RUNNER_AUTH_TOKEN: 'secret', AGENT_MAX_CONCURRENCY: 3 } }));
vi.mock('../killswitch.js', () => ({ isPaused: vi.fn(), setPaused: vi.fn() }));
vi.mock('../agent.js', () => ({ getAgent: vi.fn() }));

const app = new Hono();
app.route('/', adminRoute);
const auth = { authorization: 'Bearer secret' };

beforeEach(() => vi.clearAllMocks());

describe('GET /admin/concurrency', () => {
  it('401 sem bearer', async () => {
    const res = await app.request('/admin/concurrency');
    expect(res.status).toBe(401);
  });

  it('devolve limit, active e byStatus', async () => {
    vi.mocked(countRunsByStatus).mockResolvedValue({ executing: 2, completed: 5, planning: 1 });
    const res = await app.request('/admin/concurrency', { headers: auth });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      limit: number;
      active: number;
      byStatus: Record<string, number>;
    };
    expect(body.limit).toBe(3);
    expect(body.active).toBe(3); // executing 2 + planning 1
    expect(body.byStatus).toEqual({ executing: 2, completed: 5, planning: 1 });
  });
});

describe('GET /admin/card-runs', () => {
  it('401 sem bearer', async () => {
    const res = await app.request('/admin/card-runs?provider=plane&cardId=card-1');
    expect(res.status).toBe(401);
  });

  it('exige provider e cardId', async () => {
    const res = await app.request('/admin/card-runs?provider=plane', { headers: auth });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'provider and cardId are required' });
  });

  it('devolve runs recentes para auditoria de webhook/card', async () => {
    vi.mocked(listRunsForCard).mockResolvedValue([
      {
        id: 'run-1',
        cardProvider: 'plane',
        cardId: 'card-1',
        cardIdentifier: 'AGP-34',
        status: 'completed',
        title: 'Coleta',
        branch: 'agent/agp-34',
        prUrl: null,
        testsPassed: true,
        error: null,
        createdAt: new Date('2026-06-21T23:50:02.000Z'),
        updatedAt: new Date('2026-06-21T23:51:09.000Z'),
      },
    ] as never);

    const res = await app.request('/admin/card-runs?provider=plane&cardId=card-1', {
      headers: auth,
    });

    expect(res.status).toBe(200);
    expect(listRunsForCard).toHaveBeenCalledWith('plane', 'card-1', 20);
    await expect(res.json()).resolves.toEqual({
      runs: [
        {
          id: 'run-1',
          cardProvider: 'plane',
          cardId: 'card-1',
          cardIdentifier: 'AGP-34',
          status: 'completed',
          title: 'Coleta',
          branch: 'agent/agp-34',
          prUrl: null,
          testsPassed: true,
          error: null,
          createdAt: '2026-06-21T23:50:02.000Z',
          updatedAt: '2026-06-21T23:51:09.000Z',
        },
      ],
    });
  });
});
