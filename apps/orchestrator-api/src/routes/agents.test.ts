import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentExistsError, createAgent, getAgent, listAgents, updateAgentStatus } from '../agents.js';
import { agentsRoute } from './agents.js';

vi.mock('../agents.js', async (orig) => ({
  ...(await orig<typeof import('../agents.js')>()),
  listAgents: vi.fn(),
  getAgent: vi.fn(),
  createAgent: vi.fn(),
  updateAgentStatus: vi.fn(),
}));

vi.mock('../env.js', () => ({ env: { RUNNER_AUTH_TOKEN: 'secret' } }));

const app = new Hono();
app.route('/', agentsRoute);

const auth = { authorization: 'Bearer secret' };

beforeEach(() => vi.clearAllMocks());

describe('GET /agents', () => {
  it('lista (200)', async () => {
    vi.mocked(listAgents).mockResolvedValue([{ id: 'a1' }] as never);
    const res = await app.request('/agents');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { agents: unknown[] };
    expect(body.agents).toHaveLength(1);
  });

  it('passa filtros key/status', async () => {
    vi.mocked(listAgents).mockResolvedValue([] as never);
    await app.request('/agents?key=coder-agent&status=active');
    expect(listAgents).toHaveBeenCalledWith({ key: 'coder-agent', status: 'active' });
  });
});

describe('GET /agents/:id', () => {
  it('200 quando existe', async () => {
    vi.mocked(getAgent).mockResolvedValue({ id: 'a1' } as never);
    const res = await app.request('/agents/a1');
    expect(res.status).toBe(200);
  });

  it('404 quando não existe', async () => {
    vi.mocked(getAgent).mockResolvedValue(null);
    const res = await app.request('/agents/missing');
    expect(res.status).toBe(404);
  });
});

describe('POST /agents', () => {
  it('401 sem bearer', async () => {
    const res = await app.request('/agents', { method: 'POST', body: '{}' });
    expect(res.status).toBe(401);
    expect(createAgent).not.toHaveBeenCalled();
  });

  it('201 com payload válido', async () => {
    vi.mocked(createAgent).mockResolvedValue({ id: 'a1', key: 'k', version: 'v1' } as never);
    const res = await app.request('/agents', {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ key: 'k', version: 'v1', capabilities: ['x'] }),
    });
    expect(res.status).toBe(201);
    expect(createAgent).toHaveBeenCalledWith({ key: 'k', version: 'v1', capabilities: ['x'] });
  });

  it('400 com payload inválido', async () => {
    const res = await app.request('/agents', {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ key: '', version: 'v1' }),
    });
    expect(res.status).toBe(400);
    expect(createAgent).not.toHaveBeenCalled();
  });

  it('409 em (key,version) duplicado', async () => {
    vi.mocked(createAgent).mockRejectedValue(new AgentExistsError());
    const res = await app.request('/agents', {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ key: 'k', version: 'v1' }),
    });
    expect(res.status).toBe(409);
  });
});

describe('PATCH /agents/:id', () => {
  it('401 sem bearer', async () => {
    const res = await app.request('/agents/a1', { method: 'PATCH', body: '{}' });
    expect(res.status).toBe(401);
  });

  it('200 muda status', async () => {
    vi.mocked(updateAgentStatus).mockResolvedValue({ id: 'a1', status: 'deprecated' } as never);
    const res = await app.request('/agents/a1', {
      method: 'PATCH',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'deprecated' }),
    });
    expect(res.status).toBe(200);
    expect(updateAgentStatus).toHaveBeenCalledWith('a1', 'deprecated');
  });

  it('400 com status inválido', async () => {
    const res = await app.request('/agents/a1', {
      method: 'PATCH',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'lixo' }),
    });
    expect(res.status).toBe(400);
    expect(updateAgentStatus).not.toHaveBeenCalled();
  });

  it('404 quando não existe', async () => {
    vi.mocked(updateAgentStatus).mockResolvedValue(null);
    const res = await app.request('/agents/a1', {
      method: 'PATCH',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'active' }),
    });
    expect(res.status).toBe(404);
  });
});
