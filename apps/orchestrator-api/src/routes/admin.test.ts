import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { countRunsByStatus } from '../runs.js';
import { adminRoute } from './admin.js';

vi.mock('../runs.js', () => ({
  countRunsByStatus: vi.fn(),
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
    const body = (await res.json()) as { limit: number; active: number; byStatus: Record<string, number> };
    expect(body.limit).toBe(3);
    expect(body.active).toBe(3); // executing 2 + planning 1
    expect(body.byStatus).toEqual({ executing: 2, completed: 5, planning: 1 });
  });
});
