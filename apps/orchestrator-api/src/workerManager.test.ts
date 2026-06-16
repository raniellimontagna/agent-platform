import { describe, expect, it, vi } from 'vitest';
import { createWorkerManager, parseRunnerUrls } from './workerManager.js';

vi.mock('./logger.js', () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    child: () => ({ warn: vi.fn(), info: vi.fn() }),
  },
}));

const body = {
  runId: 'r',
  issueIdentifier: 'MAC-1',
  repoUrl: 'x',
  baseBranch: 'main',
  branch: 'b',
  title: 't',
  description: 'd',
  plan: 'p',
  commands: [],
  lessons: '',
  reviewFeedback: '',
};

function res(opts: { ok?: boolean; status?: number; json?: unknown; text?: string }) {
  return {
    ok: opts.ok ?? true,
    status: opts.status ?? 200,
    json: async () => opts.json,
    text: async () => opts.text ?? '',
  } as Response;
}

describe('parseRunnerUrls', () => {
  it('usa o fallback quando vazio/ausente', () => {
    expect(parseRunnerUrls(undefined, 'http://a')).toEqual(['http://a']);
    expect(parseRunnerUrls('', 'http://a')).toEqual(['http://a']);
  });
  it('split, trim, remove barra final e dedup', () => {
    expect(parseRunnerUrls('http://a/, http://b , http://a', 'http://z')).toEqual([
      'http://a',
      'http://b',
    ]);
  });
});

describe('createWorkerManager.dispatch', () => {
  it('manda no 1º saudável e não tenta os outros', async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      calls.push(url);
      if (url.endsWith('/health')) return res({ ok: true });
      return res({ json: { status: 'succeeded', branch: 'b' } });
    }) as unknown as typeof fetch;
    const wm = createWorkerManager({
      baseUrls: ['http://a', 'http://b'],
      authToken: 'tok',
      fetchImpl,
    });
    const r = await wm.dispatch(body);
    expect(r.status).toBe('succeeded');
    expect(calls).toEqual(['http://a/health', 'http://a/jobs/sync']);
  });

  it('faz failover quando o 1º está não-saudável', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url === 'http://a/health') return res({ ok: false, status: 503 });
      if (url === 'http://b/health') return res({ ok: true });
      return res({ json: { status: 'succeeded', branch: 'b' } });
    }) as unknown as typeof fetch;
    const wm = createWorkerManager({
      baseUrls: ['http://a', 'http://b'],
      authToken: 'tok',
      fetchImpl,
    });
    const r = await wm.dispatch(body);
    expect(r.status).toBe('succeeded');
  });

  it('faz failover quando o POST dá 5xx (infra)', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.endsWith('/health')) return res({ ok: true });
      if (url === 'http://a/jobs/sync') return res({ ok: false, status: 502 });
      return res({ json: { status: 'succeeded', branch: 'b' } });
    }) as unknown as typeof fetch;
    const wm = createWorkerManager({
      baseUrls: ['http://a', 'http://b'],
      authToken: 'tok',
      fetchImpl,
    });
    const r = await wm.dispatch(body);
    expect(r.status).toBe('succeeded');
  });

  it('NÃO faz failover quando o job rodou e devolveu failed', async () => {
    let posts = 0;
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.endsWith('/health')) return res({ ok: true });
      posts++;
      return res({ json: { status: 'failed', branch: 'b', error: 'boom' } });
    }) as unknown as typeof fetch;
    const wm = createWorkerManager({
      baseUrls: ['http://a', 'http://b'],
      authToken: 'tok',
      fetchImpl,
    });
    const r = await wm.dispatch(body);
    expect(r.status).toBe('failed');
    expect(posts).toBe(1);
  });

  it('aplica timeout configurável no POST síncrono do job', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn((url: string, init?: RequestInit) => {
      if (url.endsWith('/health')) return Promise.resolve(res({ ok: true }));
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    }) as unknown as typeof fetch;
    const wm = createWorkerManager({
      baseUrls: ['http://a'],
      authToken: 'tok',
      fetchImpl,
      jobTimeoutMs: 50,
    });

    const dispatched = wm.dispatch(body);
    const rejected = expect(dispatched).rejects.toThrow('aborted');
    await vi.advanceTimersByTimeAsync(50);
    await rejected;
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://a/jobs/sync',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    vi.useRealTimers();
  });

  it('lança quando todos estão fora', async () => {
    const fetchImpl = vi.fn(async () => res({ ok: false, status: 503 })) as unknown as typeof fetch;
    const wm = createWorkerManager({
      baseUrls: ['http://a', 'http://b'],
      authToken: 'tok',
      fetchImpl,
    });
    await expect(wm.dispatch(body)).rejects.toThrow();
  });
});

describe('createWorkerManager.probeAll', () => {
  it('mapeia a saúde de cada runner', async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      res({ ok: url === 'http://a/health' }),
    ) as unknown as typeof fetch;
    const wm = createWorkerManager({
      baseUrls: ['http://a', 'http://b'],
      authToken: 'tok',
      fetchImpl,
    });
    const probes = await wm.probeAll();
    expect(probes.map((p) => p.healthy)).toEqual([true, false]);
    expect(probes.map((p) => p.url)).toEqual(['http://a', 'http://b']);
  });
});
