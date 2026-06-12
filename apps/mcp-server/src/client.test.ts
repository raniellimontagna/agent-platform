import { describe, expect, it, vi } from 'vitest';
import { ApiError, createClient } from './client.js';

function mockFetch(status: number, body: unknown) {
  return vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  })) as unknown as typeof fetch;
}

function cfg(fetchImpl: typeof fetch) {
  return { baseUrl: 'http://orch:3000/', token: 'tkn', fetchImpl };
}

describe('createClient', () => {
  it('GET /runs com limit, Bearer e baseUrl sem barra final', async () => {
    const f = mockFetch(200, { runs: [] });
    const out = await createClient(cfg(f)).listRuns(10);
    expect(out).toEqual({ runs: [] });
    const call = (f as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0];
    expect(call[0]).toBe('http://orch:3000/runs?limit=10');
    expect(call[1].method).toBe('GET');
    expect((call[1].headers as Record<string, string>).authorization).toBe('Bearer tkn');
  });

  it('approveRun faz POST com query by', async () => {
    const f = mockFetch(200, { ok: true });
    await createClient(cfg(f)).approveRun('abc', 'claude');
    const call = (f as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0];
    expect(call[0]).toBe('http://orch:3000/runs/abc/approve?by=claude');
    expect(call[1].method).toBe('POST');
  });

  it('omite query quando o parâmetro é undefined', async () => {
    const f = mockFetch(200, {});
    await createClient(cfg(f)).listRuns();
    const call = (f as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0];
    expect(call[0]).toBe('http://orch:3000/runs');
  });

  it('listLessons monta repo na query', async () => {
    const f = mockFetch(200, { lessons: [] });
    await createClient(cfg(f)).listLessons('owner/repo');
    const call = (f as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0];
    expect(call[0]).toBe('http://orch:3000/lessons?repo=owner%2Frepo');
  });

  it('lança ApiError em resposta não-2xx', async () => {
    const f = mockFetch(404, 'not found');
    await expect(createClient(cfg(f)).getRun('x')).rejects.toBeInstanceOf(ApiError);
  });
});
