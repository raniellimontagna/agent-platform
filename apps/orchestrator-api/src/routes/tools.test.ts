import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToolExistsError, createTool, getTool, listTools, updateToolStatus } from '../tools.js';
import { toolsRoute } from './tools.js';

vi.mock('../tools.js', async (orig) => ({
  ...(await orig<typeof import('../tools.js')>()),
  listTools: vi.fn(),
  getTool: vi.fn(),
  createTool: vi.fn(),
  updateToolStatus: vi.fn(),
}));

vi.mock('../env.js', () => ({ env: { RUNNER_AUTH_TOKEN: 'secret' } }));

const app = new Hono();
app.route('/', toolsRoute);

const auth = { authorization: 'Bearer secret' };

beforeEach(() => vi.clearAllMocks());

describe('GET /tools', () => {
  it('lista (200)', async () => {
    vi.mocked(listTools).mockResolvedValue([{ id: 't1' }] as never);
    const res = await app.request('/tools');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { tools: unknown[] };
    expect(body.tools).toHaveLength(1);
  });

  it('passa filtros key/status/risk', async () => {
    vi.mocked(listTools).mockResolvedValue([] as never);
    await app.request('/tools?key=git&status=active&risk=caution');
    expect(listTools).toHaveBeenCalledWith({ key: 'git', status: 'active', risk: 'caution' });
  });

  it('400 com status inválido', async () => {
    const res = await app.request('/tools?status=garbage');
    expect(res.status).toBe(400);
    expect(listTools).not.toHaveBeenCalled();
  });

  it('400 com risk inválido', async () => {
    const res = await app.request('/tools?risk=garbage');
    expect(res.status).toBe(400);
    expect(listTools).not.toHaveBeenCalled();
  });
});

describe('GET /tools/:id', () => {
  it('200 quando existe', async () => {
    vi.mocked(getTool).mockResolvedValue({ id: 't1' } as never);
    const res = await app.request('/tools/t1');
    expect(res.status).toBe(200);
  });

  it('404 quando não existe', async () => {
    vi.mocked(getTool).mockResolvedValue(null);
    const res = await app.request('/tools/missing');
    expect(res.status).toBe(404);
  });
});

describe('POST /tools', () => {
  it('401 sem bearer', async () => {
    const res = await app.request('/tools', { method: 'POST', body: '{}' });
    expect(res.status).toBe(401);
    expect(createTool).not.toHaveBeenCalled();
  });

  it('201 com payload válido', async () => {
    vi.mocked(createTool).mockResolvedValue({ id: 't1', key: 'k', version: 'v1' } as never);
    const res = await app.request('/tools', {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ key: 'k', version: 'v1', risk: 'safe', scopes: ['exec'] }),
    });
    expect(res.status).toBe(201);
    expect(createTool).toHaveBeenCalledWith({
      key: 'k',
      version: 'v1',
      risk: 'safe',
      scopes: ['exec'],
    });
  });

  it('400 com payload inválido', async () => {
    const res = await app.request('/tools', {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ key: '', version: 'v1' }),
    });
    expect(res.status).toBe(400);
    expect(createTool).not.toHaveBeenCalled();
  });

  it('409 em (key,version) duplicado', async () => {
    vi.mocked(createTool).mockRejectedValue(new ToolExistsError());
    const res = await app.request('/tools', {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ key: 'k', version: 'v1' }),
    });
    expect(res.status).toBe(409);
  });
});

describe('PATCH /tools/:id', () => {
  it('401 sem bearer', async () => {
    const res = await app.request('/tools/t1', { method: 'PATCH', body: '{}' });
    expect(res.status).toBe(401);
  });

  it('200 muda status', async () => {
    vi.mocked(updateToolStatus).mockResolvedValue({ id: 't1', status: 'deprecated' } as never);
    const res = await app.request('/tools/t1', {
      method: 'PATCH',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'deprecated' }),
    });
    expect(res.status).toBe(200);
    expect(updateToolStatus).toHaveBeenCalledWith('t1', 'deprecated');
  });

  it('400 com status inválido', async () => {
    const res = await app.request('/tools/t1', {
      method: 'PATCH',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'lixo' }),
    });
    expect(res.status).toBe(400);
    expect(updateToolStatus).not.toHaveBeenCalled();
  });

  it('404 quando não existe', async () => {
    vi.mocked(updateToolStatus).mockResolvedValue(null);
    const res = await app.request('/tools/t1', {
      method: 'PATCH',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'active' }),
    });
    expect(res.status).toBe(404);
  });
});
