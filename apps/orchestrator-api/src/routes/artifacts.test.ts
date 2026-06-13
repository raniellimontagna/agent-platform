import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getArtifact, listArtifacts } from '../artifacts.js';
import { artifactsRoute } from './artifacts.js';

vi.mock('../artifacts.js', () => ({
  listArtifacts: vi.fn(),
  getArtifact: vi.fn(),
}));

const app = new Hono();
app.route('/', artifactsRoute);

beforeEach(() => vi.clearAllMocks());

describe('GET /runs/:id/artifacts', () => {
  it('lista os artefatos do run', async () => {
    vi.mocked(listArtifacts).mockResolvedValue([
      { id: 'a1', kind: 'plan', createdAt: new Date('2026-01-01') },
    ] as never);
    const res = await app.request('/runs/run-1/artifacts');
    expect(res.status).toBe(200);
    expect(listArtifacts).toHaveBeenCalledWith('run-1');
    const body = (await res.json()) as { artifacts: unknown[] };
    expect(body.artifacts).toHaveLength(1);
  });
});

describe('GET /artifacts/:id', () => {
  it('devolve o artefato com content', async () => {
    vi.mocked(getArtifact).mockResolvedValue({
      id: 'a1', runId: 'run-1', kind: 'patch', content: 'diff', createdAt: new Date('2026-01-01'),
    } as never);
    const res = await app.request('/artifacts/a1');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { content: string };
    expect(body.content).toBe('diff');
  });

  it('404 quando não existe', async () => {
    vi.mocked(getArtifact).mockResolvedValue(null);
    const res = await app.request('/artifacts/missing');
    expect(res.status).toBe(404);
  });
});
