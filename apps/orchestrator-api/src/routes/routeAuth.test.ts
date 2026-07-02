import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAgent, listAgents, updateAgentStatus } from '../agents.js';
import { listRunsBySchedule } from '../runs.js';
import { listSchedules } from '../schedules.js';
import { createTool, listTools, updateToolStatus } from '../tools.js';
import { agentsRoute } from './agents.js';
import { requireRunnerAuth } from './routeAuth.js';
import { schedulesRoute } from './schedules.js';
import { toolsRoute } from './tools.js';

vi.mock('../env.js', () => ({ env: { RUNNER_AUTH_TOKEN: 'secret', SCHEDULER_TZ: 'UTC' } }));

vi.mock('../agents.js', async (orig) => ({
  ...(await orig<typeof import('../agents.js')>()),
  listAgents: vi.fn(),
  getAgent: vi.fn(),
  createAgent: vi.fn(),
  updateAgentStatus: vi.fn(),
}));

vi.mock('../tools.js', async (orig) => ({
  ...(await orig<typeof import('../tools.js')>()),
  listTools: vi.fn(),
  getTool: vi.fn(),
  createTool: vi.fn(),
  updateToolStatus: vi.fn(),
}));

vi.mock('../schedules.js', () => ({
  createSchedule: vi.fn(),
  listSchedules: vi.fn(),
  getSchedule: vi.fn(),
  updateSchedule: vi.fn(),
  deleteSchedule: vi.fn(),
}));

vi.mock('../scheduleQueue.js', () => ({
  upsertScheduleJob: vi.fn(),
  removeScheduleJob: vi.fn(),
}));

vi.mock('../runs.js', () => ({ listRunsBySchedule: vi.fn() }));

function buildProtectedApp(handler = vi.fn((c) => c.json({ ok: true }))) {
  const app = new Hono();
  app.use('/protected', requireRunnerAuth);
  app.get('/protected', handler);
  return { app, handler };
}

const routesApp = new Hono();
routesApp.route('/', agentsRoute);
routesApp.route('/', toolsRoute);
routesApp.route('/', schedulesRoute);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('requireRunnerAuth', () => {
  it('rejects missing authorization headers with the shared 401 body', async () => {
    const { app, handler } = buildProtectedApp();

    const res = await app.request('/protected');

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'unauthorized' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('rejects wrong authorization headers without calling next', async () => {
    const { app, handler } = buildProtectedApp();

    const res = await app.request('/protected', {
      headers: { authorization: 'bearer secret' },
    });

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'unauthorized' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('calls next only when the bearer header exactly matches RUNNER_AUTH_TOKEN', async () => {
    const { app, handler } = buildProtectedApp();

    const res = await app.request('/protected', {
      headers: { authorization: 'Bearer secret' },
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(handler).toHaveBeenCalledOnce();
  });
});

describe('runner route auth coverage', () => {
  it('keeps GET /agents open while protecting agent writes', async () => {
    vi.mocked(listAgents).mockResolvedValue([] as never);

    const getRes = await routesApp.request('/agents');
    const postRes = await routesApp.request('/agents', { method: 'POST', body: '{}' });
    const patchRes = await routesApp.request('/agents/a1', { method: 'PATCH', body: '{}' });

    expect(getRes.status).toBe(200);
    expect(listAgents).toHaveBeenCalledWith({ key: undefined, status: undefined });
    expect(postRes.status).toBe(401);
    expect(patchRes.status).toBe(401);
    expect(createAgent).not.toHaveBeenCalled();
    expect(updateAgentStatus).not.toHaveBeenCalled();
  });

  it('keeps GET /tools open while protecting tool writes', async () => {
    vi.mocked(listTools).mockResolvedValue([] as never);

    const getRes = await routesApp.request('/tools');
    const postRes = await routesApp.request('/tools', { method: 'POST', body: '{}' });
    const patchRes = await routesApp.request('/tools/t1', { method: 'PATCH', body: '{}' });

    expect(getRes.status).toBe(200);
    expect(listTools).toHaveBeenCalledWith({ key: undefined, status: undefined, risk: undefined });
    expect(postRes.status).toBe(401);
    expect(patchRes.status).toBe(401);
    expect(createTool).not.toHaveBeenCalled();
    expect(updateToolStatus).not.toHaveBeenCalled();
  });

  it('keeps /schedules and nested schedule routes protected', async () => {
    const listRes = await routesApp.request('/schedules');
    const runsRes = await routesApp.request('/schedules/s1/runs');

    expect(listRes.status).toBe(401);
    expect(runsRes.status).toBe(401);
    expect(listSchedules).not.toHaveBeenCalled();
    expect(listRunsBySchedule).not.toHaveBeenCalled();
  });
});
