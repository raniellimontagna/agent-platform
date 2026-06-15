import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from './app.js';
import { listArtifacts } from './artifacts.js';
import { getRun } from './runs.js';

vi.mock('./artifacts.js', () => ({ listArtifacts: vi.fn(), getArtifact: vi.fn() }));
vi.mock('./agents.js', async (orig) => ({
  ...(await orig<typeof import('./agents.js')>()),
  listAgents: vi.fn(),
  getAgent: vi.fn(),
  createAgent: vi.fn(),
  updateAgentStatus: vi.fn(),
}));
vi.mock('./runs.js', () => ({
  getRun: vi.fn(),
  listRuns: vi.fn(),
  listRunSteps: vi.fn(),
  listApprovals: vi.fn(),
  listRunStepCosts: vi.fn(),
  resolveApproval: vi.fn(),
  updateRunStatus: vi.fn(),
  runStats: vi.fn(),
}));

const app = buildApp();

beforeEach(() => vi.clearAllMocks());

describe('guard de uuid (MAC-64)', () => {
  it('404 sem tocar no data layer quando o :id não é uuid', async () => {
    // se o guard NÃO disparar, a rota tentaria o data layer (mock truthy → 200)
    vi.mocked(getRun).mockResolvedValue({ id: 'x' } as never);
    vi.mocked(listArtifacts).mockResolvedValue([] as never);

    const res = await app.request('/runs/nao-existe/artifacts');

    expect(res.status).toBe(404);
    expect(getRun).not.toHaveBeenCalled();
    expect(listArtifacts).not.toHaveBeenCalled();
  });

  it('404 para :id não-uuid em /runs/:id', async () => {
    vi.mocked(getRun).mockResolvedValue({ id: 'x' } as never);
    const res = await app.request('/runs/nao-existe');
    expect(res.status).toBe(404);
    expect(getRun).not.toHaveBeenCalled();
  });

  it('deixa passar uuid válido (chega no data layer)', async () => {
    vi.mocked(getRun).mockResolvedValue(null);
    const res = await app.request('/runs/00000000-0000-4000-8000-000000000000');
    expect(res.status).toBe(404); // run inexistente → 404 da rota
    expect(getRun).toHaveBeenCalledTimes(1);
  });

  it('404 para :id não-uuid em /agents/:id', async () => {
    const res = await app.request('/agents/nao-uuid');
    expect(res.status).toBe(404);
  });
});
