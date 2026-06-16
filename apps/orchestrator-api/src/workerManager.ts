import type { DispatchFn, RunnerResult } from '@agent-platform/graph';
import { logger } from './logger.js';

export interface RunnerProbe {
  url: string;
  healthy: boolean;
  ms: number;
}

export interface WorkerManager {
  dispatch: DispatchFn;
  probeAll(): Promise<RunnerProbe[]>;
}

/**
 * Parseia a lista de runners (env) → array limpo. Vazio/ausente cai no fallback
 * (o RUNNER_BASE_URL atual). Tira barra final e deduplica. Nunca devolve vazio.
 */
export function parseRunnerUrls(raw: string | undefined, fallback: string): string[] {
  const urls = (raw ?? '')
    .split(',')
    .map((u) => u.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  const unique = [...new Set(urls)];
  return unique.length > 0 ? unique : [fallback.replace(/\/+$/, '')];
}

/**
 * Worker Manager (MAC-39): conhece N runners e despacha o job num runner saudável
 * com probe `/health` no dispatch + failover. Failover só em erro de transporte
 * (runner fora / timeout / HTTP 5xx); um job que rodou e devolveu `failed` é
 * resultado real e NÃO é re-despachado.
 */
export function createWorkerManager(opts: {
  baseUrls: string[];
  authToken: string;
  fetchImpl?: typeof fetch;
  healthTimeoutMs?: number;
  jobTimeoutMs?: number;
}): WorkerManager {
  const { baseUrls, authToken } = opts;
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const healthTimeoutMs = opts.healthTimeoutMs ?? 2000;
  const jobTimeoutMs = opts.jobTimeoutMs ?? 900_000;
  let next = 0;

  async function isHealthy(url: string): Promise<boolean> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), healthTimeoutMs);
    try {
      const res = await fetchImpl(`${url}/health`, { signal: ctrl.signal });
      return res.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Ordem dos candidatos a partir de um índice round-robin (espalha o início). */
  function order(): string[] {
    if (baseUrls.length <= 1) return baseUrls;
    const start = next % baseUrls.length;
    next = (next + 1) % baseUrls.length;
    return [...baseUrls.slice(start), ...baseUrls.slice(0, start)];
  }

  const dispatch: DispatchFn = async (body) => {
    let lastErr: unknown;
    for (const url of order()) {
      if (!(await isHealthy(url))) {
        logger.warn({ url }, 'runner não-saudável — pulando');
        lastErr = new Error(`runner ${url} não-saudável`);
        continue;
      }

      let res: Response;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), jobTimeoutMs);
      try {
        res = await fetchImpl(`${url}/jobs/sync`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${authToken}` },
          body: JSON.stringify(body),
          signal: ctrl.signal,
        });
      } catch (err) {
        // Erro de transporte (runner caiu no meio) → tenta o próximo.
        lastErr = err;
        logger.warn({ url, err }, 'falha de transporte — tentando próximo runner');
        continue;
      } finally {
        clearTimeout(timer);
      }

      if (!res.ok) {
        if (res.status >= 500) {
          // Erro de infra do runner → failover.
          lastErr = new Error(`runner ${url} respondeu ${res.status}`);
          logger.warn({ url, status: res.status }, 'runner erro de infra — failover');
          continue;
        }
        // 4xx = rejeição real do job (não adianta tentar outro).
        throw new Error(`runner ${url} rejeitou o job: ${res.status} ${await res.text()}`);
      }

      return (await res.json()) as RunnerResult;
    }
    throw lastErr instanceof Error ? lastErr : new Error('nenhum runner saudável disponível');
  };

  async function probeAll(): Promise<RunnerProbe[]> {
    return Promise.all(
      baseUrls.map(async (url) => {
        const start = Date.now();
        const healthy = await isHealthy(url);
        return { url, healthy, ms: Date.now() - start };
      }),
    );
  }

  return { dispatch, probeAll };
}
