import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createSchedule,
  deleteSchedule,
  getSchedule,
  listSchedules,
  updateSchedule,
} from '../schedules.js';
import { removeScheduleJob, upsertScheduleJob } from '../scheduleQueue.js';
import { schedulesRoute } from './schedules.js';

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
vi.mock('../env.js', () => ({ env: { RUNNER_AUTH_TOKEN: 'tok', SCHEDULER_TZ: 'UTC' } }));

const auth = { authorization: 'Bearer tok' };
const app = new Hono();
app.route('/', schedulesRoute);

beforeEach(() => vi.clearAllMocks());

describe('POST /schedules', () => {
  it('401 sem token', async () => {
    const res = await app.request('/schedules', { method: 'POST', body: '{}' });
    expect(res.status).toBe(401);
  });

  it('400 com cron inválido', async () => {
    const res = await app.request('/schedules', {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'x', cron: 'nope', title: 't', description: 'd' }),
    });
    expect(res.status).toBe(400);
    expect(createSchedule).not.toHaveBeenCalled();
  });

  it('cria e registra o scheduler', async () => {
    vi.mocked(createSchedule).mockResolvedValue({ id: 's1', cron: '0 9 * * 1', tz: 'UTC', enabled: true } as never);
    const res = await app.request('/schedules', {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'x', cron: '0 9 * * 1', title: 't', description: 'd' }),
    });
    expect(res.status).toBe(201);
    expect(upsertScheduleJob).toHaveBeenCalledWith({ id: 's1', cron: '0 9 * * 1', tz: 'UTC' });
  });
});

describe('GET /schedules/:id', () => {
  it('404 quando não existe', async () => {
    vi.mocked(getSchedule).mockResolvedValue(null);
    const res = await app.request('/schedules/missing', { headers: auth });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /schedules/:id', () => {
  it('remove row + scheduler', async () => {
    vi.mocked(deleteSchedule).mockResolvedValue(true);
    const res = await app.request('/schedules/s1', { method: 'DELETE', headers: auth });
    expect(res.status).toBe(204);
    expect(removeScheduleJob).toHaveBeenCalledWith('s1');
  });
});
