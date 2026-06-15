import { describe, expect, it, vi } from 'vitest';
import { ApiError, type OrchestratorClient, createClient } from './client.js';

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

  it('listLessons monta query semântica', async () => {
    const f = mockFetch(200, { lessons: [] });
    await createClient(cfg(f)).listLessons('o/r', 5, 'auth bug');
    const call = (f as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0];
    expect(call[0]).toBe('http://orch:3000/lessons?repo=o%2Fr&limit=5&query=auth+bug');
  });

  it('lança ApiError em resposta não-2xx', async () => {
    const f = mockFetch(404, 'not found');
    await expect(createClient(cfg(f)).getRun('x')).rejects.toBeInstanceOf(ApiError);
  });

  it('mapeia cada método para o verbo + rota corretos', async () => {
    const cases: [(c: OrchestratorClient) => Promise<unknown>, string, string][] = [
      [(c) => c.listRuns(), 'GET', 'http://orch:3000/runs'],
      [(c) => c.getRun('r1'), 'GET', 'http://orch:3000/runs/r1'],
      [(c) => c.getRunSteps('r1'), 'GET', 'http://orch:3000/runs/r1/steps'],
      [(c) => c.getRunApprovals('r1'), 'GET', 'http://orch:3000/runs/r1/approvals'],
      [(c) => c.listLessons('o/r'), 'GET', 'http://orch:3000/lessons?repo=o%2Fr'],
      [(c) => c.agentStatus(), 'GET', 'http://orch:3000/admin/status'],
      [(c) => c.getStats(), 'GET', 'http://orch:3000/stats'],
      [(c) => c.approveRun('r1'), 'POST', 'http://orch:3000/runs/r1/approve'],
      [(c) => c.rejectRun('r1', 'me'), 'POST', 'http://orch:3000/runs/r1/reject?by=me'],
      [(c) => c.pauseAgents(), 'POST', 'http://orch:3000/admin/pause'],
      [(c) => c.resumeAgents(), 'POST', 'http://orch:3000/admin/resume'],
      [(c) => c.listAgents(), 'GET', 'http://orch:3000/agents'],
      [(c) => c.getAgent('a1'), 'GET', 'http://orch:3000/agents/a1'],
      [(c) => c.listTools(), 'GET', 'http://orch:3000/tools'],
      [(c) => c.getTool('t1'), 'GET', 'http://orch:3000/tools/t1'],
    ];
    for (const [fn, method, url] of cases) {
      const f = mockFetch(200, {});
      await fn(createClient(cfg(f)));
      const call = (f as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0];
      expect([call[1].method, call[0]]).toEqual([method, url]);
    }
  });

  it('listAgents monta key/status na query', async () => {
    const f = mockFetch(200, { agents: [] });
    await createClient(cfg(f)).listAgents({ key: 'coder-agent', status: 'active' });
    const call = (f as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0];
    expect(call[0]).toBe('http://orch:3000/agents?key=coder-agent&status=active');
  });

  it('listTools monta key/status/risk na query', async () => {
    const f = mockFetch(200, { tools: [] });
    await createClient(cfg(f)).listTools({ key: 'git', status: 'active', risk: 'caution' });
    const call = (f as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0];
    expect(call[0]).toBe('http://orch:3000/tools?key=git&status=active&risk=caution');
  });

  it('erro de rede vira ApiError com mensagem clara', async () => {
    const f = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    await expect(createClient(cfg(f)).agentStatus()).rejects.toThrow(/inacessível/);
  });
});
