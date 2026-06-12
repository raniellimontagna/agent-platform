export interface ClientConfig {
  baseUrl: string;
  token: string;
  /** Injetável para teste; default = fetch global. */
  fetchImpl?: typeof fetch;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`orchestrator respondeu ${status}: ${body}`);
    this.name = 'ApiError';
  }
}

export interface OrchestratorClient {
  listRuns(limit?: number): Promise<unknown>;
  getRun(id: string): Promise<unknown>;
  getRunSteps(id: string): Promise<unknown>;
  getRunApprovals(id: string): Promise<unknown>;
  listLessons(repo: string, limit?: number): Promise<unknown>;
  agentStatus(): Promise<unknown>;
  approveRun(id: string, by?: string): Promise<unknown>;
  rejectRun(id: string, by?: string): Promise<unknown>;
  pauseAgents(): Promise<unknown>;
  resumeAgents(): Promise<unknown>;
}

/** Monta `?a=b&c=d` ignorando valores undefined/vazios. */
function query(params: Record<string, string | number | undefined>): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') usp.set(k, String(v));
  }
  const s = usp.toString();
  return s ? `?${s}` : '';
}

/** Cria um cliente tipado sobre a REST API do orchestrator (Bearer em toda call). */
export function createClient(cfg: ClientConfig): OrchestratorClient {
  const doFetch = cfg.fetchImpl ?? fetch;
  const base = cfg.baseUrl.replace(/\/+$/, '');

  async function call(method: string, path: string): Promise<unknown> {
    const res = await doFetch(`${base}${path}`, {
      method,
      headers: { authorization: `Bearer ${cfg.token}` },
    });
    const text = await res.text();
    if (!res.ok) throw new ApiError(res.status, text);
    return text ? JSON.parse(text) : {};
  }

  const id = (v: string) => encodeURIComponent(v);

  return {
    listRuns: (limit) => call('GET', `/runs${query({ limit })}`),
    getRun: (runId) => call('GET', `/runs/${id(runId)}`),
    getRunSteps: (runId) => call('GET', `/runs/${id(runId)}/steps`),
    getRunApprovals: (runId) => call('GET', `/runs/${id(runId)}/approvals`),
    listLessons: (repo, limit) => call('GET', `/lessons${query({ repo, limit })}`),
    agentStatus: () => call('GET', '/admin/status'),
    approveRun: (runId, by) => call('POST', `/runs/${id(runId)}/approve${query({ by })}`),
    rejectRun: (runId, by) => call('POST', `/runs/${id(runId)}/reject${query({ by })}`),
    pauseAgents: () => call('POST', '/admin/pause'),
    resumeAgents: () => call('POST', '/admin/resume'),
  };
}
