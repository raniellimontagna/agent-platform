# MAC-39 Worker Manager — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Orchestrator conhece N runners (env) e, ao despachar um job, escolhe um runner saudável com probe `/health` + failover; o nó `coder` deixa de falar HTTP direto e usa um `dispatch` injetado.

**Architecture:** Toda a lógica de fleet/health/failover vive num `workerManager` no orchestrator (round-robin + probe + failover só em erro de transporte). O `packages/graph` fica transport-agnostic: `coder` recebe `dispatch` injetado (igual ao `loadLessons` do MAC-23). Tipos do job/resultado são exportados do graph e reusados pelo workerManager.

**Tech Stack:** TypeScript (ESM, NodeNext), Hono, vitest, `fetch` (AbortController p/ timeout). Monorepo pnpm.

**Spec:** `docs/superpowers/specs/2026-06-13-mac-39-worker-manager-design.md`

**Convenções:** trabalha-se direto na `main` (commit+push por task). Prefixar comandos com `rtk`. ESM imports com `.js`. Testes vitest (`pnpm test`). **Ordem das tasks mantém cada commit buildando** (tipos → workerManager → refactor coder+agent juntos → admin).

---

## File Structure

- `packages/graph/src/nodes/coder.ts` — **MODIFY**: exporta `CommandResult`/`RunnerResult`; adiciona `RunnerJobBody`/`DispatchFn`; (Task 3) `CoderDeps` usa `repoUrl`+`dispatch`; coder usa `dispatch`.
- `packages/graph/src/index.ts` — **MODIFY**: exporta os tipos novos.
- `packages/graph/src/build.ts` — **MODIFY** (Task 3): `GraphDeps` troca `runner` por `runnerRepoUrl`+`dispatch`.
- `apps/orchestrator-api/src/workerManager.ts` — **CREATE**: `parseRunnerUrls`, `createWorkerManager` (`dispatch`/`probeAll`).
- `apps/orchestrator-api/src/workerManager.test.ts` — **CREATE**.
- `apps/orchestrator-api/src/env.ts` — **MODIFY**: `RUNNER_BASE_URLS` opcional.
- `apps/orchestrator-api/src/agent.ts` — **MODIFY** (Task 3): cria workerManager, injeta `dispatch`/`runnerRepoUrl`, expõe `workerManager` no `Agent`.
- `apps/orchestrator-api/src/routes/admin.ts` — **MODIFY** (Task 4): `GET /admin/runners`.
- `apps/orchestrator-api/.env.example` — **MODIFY** (Task 4): documenta `RUNNER_BASE_URLS`.

---

## Task 1: Tipos compartilhados no graph (sem mudar comportamento)

**Files:**
- Modify: `packages/graph/src/nodes/coder.ts`
- Modify: `packages/graph/src/index.ts`

- [ ] **Step 1: Exportar e adicionar os tipos**

Em `packages/graph/src/nodes/coder.ts`, troque as declarações locais:
```ts
interface CommandResult {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
}

interface RunnerResult {
```
por (adiciona `export` + os dois tipos novos antes de `RunnerResult`):
```ts
export interface CommandResult {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
}

/** Corpo do job enviado ao runner (MAC-39: despachado via dispatch injetado). */
export interface RunnerJobBody {
  runId: string;
  issueIdentifier: string;
  repoUrl: string;
  baseBranch: string;
  branch: string;
  title: string;
  description: string;
  plan: string;
  commands: string[];
  lessons: string;
  reviewFeedback: string;
}

export interface RunnerResult {
```
E logo após o fechamento da interface `RunnerResult` (a linha `}` antes de `summarizeTests`), adicione:
```ts
/** Despacha um job pro runner e devolve o resultado (impl no orchestrator). */
export type DispatchFn = (body: RunnerJobBody) => Promise<RunnerResult>;
```

(NÃO mude `RunnerConfig`, `CoderDeps` nem o corpo do coder nesta task — só exportar/adicionar tipos.)

- [ ] **Step 2: Exportar do índice do pacote**

Em `packages/graph/src/index.ts`, adicione ao final:
```ts
export type { CommandResult, RunnerResult, RunnerJobBody, DispatchFn } from './nodes/coder.js';
```

- [ ] **Step 3: Verify build + tests**

Run: `rtk pnpm --filter @agent-platform/graph build && rtk vitest run packages/graph`
Expected: tsc OK; testes do graph passam (sem mudança de comportamento).

- [ ] **Step 4: Commit**

```bash
rtk git add packages/graph/src/nodes/coder.ts packages/graph/src/index.ts
rtk git commit -m "feat(graph): exporta tipos do job/runner p/ o worker manager (MAC-39)"
```

---

## Task 2: `parseRunnerUrls` + `workerManager` (não-wired ainda)

**Files:**
- Modify: `apps/orchestrator-api/src/env.ts`
- Create: `apps/orchestrator-api/src/workerManager.ts`
- Test: `apps/orchestrator-api/src/workerManager.test.ts`

- [ ] **Step 1: env `RUNNER_BASE_URLS`**

Em `apps/orchestrator-api/src/env.ts`, logo após a linha `RUNNER_BASE_URL: z.string().url(),` adicione:
```ts
  // Worker Manager (MAC-39): lista de runners separada por vírgula (failover).
  // Ausente → usa só RUNNER_BASE_URL.
  RUNNER_BASE_URLS: z.string().optional(),
```

- [ ] **Step 2: Write the failing test**

Create `apps/orchestrator-api/src/workerManager.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { createWorkerManager, parseRunnerUrls } from './workerManager.js';

vi.mock('./logger.js', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), child: () => ({ warn: vi.fn(), info: vi.fn() }) },
}));

const body = { runId: 'r', issueIdentifier: 'MAC-1', repoUrl: 'x', baseBranch: 'main', branch: 'b', title: 't', description: 'd', plan: 'p', commands: [], lessons: '', reviewFeedback: '' };

/** Helper: resposta fake estilo fetch Response. */
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
    expect(parseRunnerUrls('http://a/, http://b , http://a', 'http://z')).toEqual(['http://a', 'http://b']);
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
    const wm = createWorkerManager({ baseUrls: ['http://a', 'http://b'], authToken: 'tok', fetchImpl });
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
    const wm = createWorkerManager({ baseUrls: ['http://a', 'http://b'], authToken: 'tok', fetchImpl });
    const r = await wm.dispatch(body);
    expect(r.status).toBe('succeeded');
  });

  it('faz failover quando o POST dá 5xx (infra)', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/health')) return res({ ok: true });
      if (url === 'http://a/jobs/sync') return res({ ok: false, status: 502 });
      return res({ json: { status: 'succeeded', branch: 'b' } });
    }) as unknown as typeof fetch;
    const wm = createWorkerManager({ baseUrls: ['http://a', 'http://b'], authToken: 'tok', fetchImpl });
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
    const wm = createWorkerManager({ baseUrls: ['http://a', 'http://b'], authToken: 'tok', fetchImpl });
    const r = await wm.dispatch(body);
    expect(r.status).toBe('failed');
    expect(posts).toBe(1);
  });

  it('lança quando todos estão fora', async () => {
    const fetchImpl = vi.fn(async () => res({ ok: false, status: 503 })) as unknown as typeof fetch;
    const wm = createWorkerManager({ baseUrls: ['http://a', 'http://b'], authToken: 'tok', fetchImpl });
    await expect(wm.dispatch(body)).rejects.toThrow();
  });
});

describe('createWorkerManager.probeAll', () => {
  it('mapeia a saúde de cada runner', async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      res({ ok: url === 'http://a/health' }),
    ) as unknown as typeof fetch;
    const wm = createWorkerManager({ baseUrls: ['http://a', 'http://b'], authToken: 'tok', fetchImpl });
    const probes = await wm.probeAll();
    expect(probes.map((p) => p.healthy)).toEqual([true, false]);
    expect(probes.map((p) => p.url)).toEqual(['http://a', 'http://b']);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `rtk vitest run apps/orchestrator-api/src/workerManager.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 4: Write implementation**

Create `apps/orchestrator-api/src/workerManager.ts`:
```ts
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
}): WorkerManager {
  const { baseUrls, authToken } = opts;
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const healthTimeoutMs = opts.healthTimeoutMs ?? 2000;
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
      try {
        res = await fetchImpl(`${url}/jobs/sync`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${authToken}` },
          body: JSON.stringify(body),
        });
      } catch (err) {
        // Erro de transporte (runner caiu no meio) → tenta o próximo.
        lastErr = err;
        logger.warn({ url, err }, 'falha de transporte — tentando próximo runner');
        continue;
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `rtk vitest run apps/orchestrator-api/src/workerManager.test.ts`
Expected: PASS (8 testes). Build: `rtk pnpm --filter @agent-platform/orchestrator-api build` → tsc OK.

- [ ] **Step 6: Commit**

```bash
rtk git add apps/orchestrator-api/src/env.ts apps/orchestrator-api/src/workerManager.ts apps/orchestrator-api/src/workerManager.test.ts
rtk git commit -m "feat(api): workerManager (parseRunnerUrls + dispatch/probeAll com failover) (MAC-39)"
```

---

## Task 3: Refactor do coder p/ `dispatch` + wiring no agent (cross-package, mantém build verde)

**Files:**
- Modify: `packages/graph/src/nodes/coder.ts`
- Modify: `packages/graph/src/build.ts`
- Modify: `apps/orchestrator-api/src/agent.ts`

- [ ] **Step 1: `CoderDeps` usa `repoUrl` + `dispatch` (coder.ts)**

Remova a interface `RunnerConfig`:
```ts
export interface RunnerConfig {
  baseUrl: string;
  authToken: string;
  /** URL de clone (já com credencial embutida, se repo privado). */
  repoUrl: string;
}
```
E troque `CoderDeps`:
```ts
export interface CoderDeps {
  linear: LinearGateway;
  runner: RunnerConfig;
  /** Comandos de validação rodados no sandbox após o push (MAC-29). */
  testCommands: string[];
  /** Carrega as lições do repo já formatadas p/ o codegen (MAC-23). Opcional. */
  loadLessons?: () => Promise<string>;
}
```
por:
```ts
export interface CoderDeps {
  linear: LinearGateway;
  /** URL de clone do repo alvo (vai no body do job). */
  repoUrl: string;
  /** Despacha o job pro runner com health/failover (MAC-39). */
  dispatch: DispatchFn;
  /** Comandos de validação rodados no sandbox após o push (MAC-29). */
  testCommands: string[];
  /** Carrega as lições do repo já formatadas p/ o codegen (MAC-23). Opcional. */
  loadLessons?: () => Promise<string>;
}
```

- [ ] **Step 2: coder usa `dispatch` em vez de `fetch` (coder.ts)**

Troque o bloco que faz a chamada HTTP:
```ts
      const lessons = deps.loadLessons ? await deps.loadLessons() : '';

      const res = await fetch(`${deps.runner.baseUrl}/jobs/sync`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${deps.runner.authToken}`,
        },
        body: JSON.stringify({
          runId: state.runId,
          issueIdentifier: state.issueIdentifier,
          repoUrl: deps.runner.repoUrl,
          baseBranch: 'main',
          branch,
          title: state.title,
          description: state.description,
          plan: state.plan,
          commands: deps.testCommands,
          lessons,
          reviewFeedback: opts.revise ? (state.reviewFeedback ?? '') : '',
        }),
      });

      if (!res.ok) {
        throw new Error(`runner respondeu ${res.status}: ${await res.text()}`);
      }

      const result = (await res.json()) as RunnerResult;
```
por:
```ts
      const lessons = deps.loadLessons ? await deps.loadLessons() : '';

      const result = await deps.dispatch({
        runId: state.runId,
        issueIdentifier: state.issueIdentifier,
        repoUrl: deps.repoUrl,
        baseBranch: 'main',
        branch,
        title: state.title,
        description: state.description,
        plan: state.plan,
        commands: deps.testCommands,
        lessons,
        reviewFeedback: opts.revise ? (state.reviewFeedback ?? '') : '',
      });
```
(O `dispatch` lança em falha de transporte/nenhum runner → cai no `catch` existente → run `failed` + comenta no Linear. O resto do nó — uso de `result`, comentário, return — não muda.)

- [ ] **Step 3: `GraphDeps` troca `runner` por `runnerRepoUrl`+`dispatch` (build.ts)**

No topo, troque o import:
```ts
import { type RunnerConfig, makeCoderNode } from './nodes/coder.js';
```
por:
```ts
import { type DispatchFn, makeCoderNode } from './nodes/coder.js';
```
Em `GraphDeps`, troque:
```ts
  runner: RunnerConfig;
```
por:
```ts
  /** URL de clone do repo alvo (vai no body do job — MAC-39). */
  runnerRepoUrl: string;
  /** Despacha o job pro runner com health/failover (MAC-39). */
  dispatch: DispatchFn;
```
E no `buildAgentGraph`, troque o `coderDeps`:
```ts
  const coderDeps = {
    linear: deps.linear,
    runner: deps.runner,
    testCommands: deps.testCommands ?? [],
    loadLessons: deps.loadLessons,
  };
```
por:
```ts
  const coderDeps = {
    linear: deps.linear,
    repoUrl: deps.runnerRepoUrl,
    dispatch: deps.dispatch,
    testCommands: deps.testCommands ?? [],
    loadLessons: deps.loadLessons,
  };
```

- [ ] **Step 4: `agent.ts` cria o workerManager e injeta (agent.ts)**

Adicione aos imports:
```ts
import { type WorkerManager, createWorkerManager, parseRunnerUrls } from './workerManager.js';
```
Troque a interface `Agent`:
```ts
export interface Agent {
  graph: AgentGraph;
  linear: LinearGateway;
  llm: LlmClient;
}
```
por:
```ts
export interface Agent {
  graph: AgentGraph;
  linear: LinearGateway;
  llm: LlmClient;
  workerManager: WorkerManager;
}
```
Em `init()`, depois do `const github = ...` (e antes de `buildAgentGraph`), adicione:
```ts
  // Worker Manager (MAC-39): fleet de runners + health/failover no dispatch.
  const workerManager = createWorkerManager({
    baseUrls: parseRunnerUrls(env.RUNNER_BASE_URLS, env.RUNNER_BASE_URL),
    authToken: env.RUNNER_AUTH_TOKEN,
  });
```
Na chamada de `buildAgentGraph`, troque o bloco:
```ts
      runner: {
        baseUrl: env.RUNNER_BASE_URL,
        authToken: env.RUNNER_AUTH_TOKEN,
        repoUrl,
      },
```
por:
```ts
      runnerRepoUrl: repoUrl,
      dispatch: workerManager.dispatch,
```
E troque o `return`:
```ts
  return { graph, linear, llm };
```
por:
```ts
  return { graph, linear, llm, workerManager };
```

- [ ] **Step 5: Verify build (todos os pacotes) + tests**

Run: `rtk pnpm -r build && rtk vitest run packages/graph apps/orchestrator-api`
Expected: build de TODOS os pacotes OK (graph + orchestrator compilam com o novo acoplamento); testes passam.

- [ ] **Step 6: Commit**

```bash
rtk git add packages/graph/src/nodes/coder.ts packages/graph/src/build.ts apps/orchestrator-api/src/agent.ts
rtk git commit -m "feat: coder usa dispatch injetado + agent monta workerManager (MAC-39)"
```

---

## Task 4: `GET /admin/runners` + `.env.example`

**Files:**
- Modify: `apps/orchestrator-api/src/routes/admin.ts`
- Modify: `apps/orchestrator-api/.env.example`

- [ ] **Step 1: Endpoint de saúde dos runners (admin.ts)**

Em `apps/orchestrator-api/src/routes/admin.ts`, adicione ao import (no topo) — junto dos imports existentes:
```ts
import { getAgent } from '../agent.js';
```
E após o handler `adminRoute.get('/admin/status', ...)`, adicione:
```ts
/** Snapshot de saúde dos runners conhecidos (MAC-39). */
adminRoute.get('/admin/runners', async (c) => {
  const { workerManager } = await getAgent();
  return c.json({ runners: await workerManager.probeAll() });
});
```
(O middleware `requireAdmin` já cobre `/admin/*`, então a rota fica protegida pelo bearer.)

- [ ] **Step 2: Documentar `RUNNER_BASE_URLS` (.env.example)**

Em `apps/orchestrator-api/.env.example`, logo após a linha do `RUNNER_BASE_URL`, adicione:
```
# Worker Manager (MAC-39): runners adicionais p/ failover, separados por vírgula.
# Ausente → usa só RUNNER_BASE_URL.
RUNNER_BASE_URLS=
```

- [ ] **Step 3: Verify build + tests**

Run: `rtk pnpm --filter @agent-platform/orchestrator-api build && rtk vitest run apps/orchestrator-api`
Expected: tsc OK; testes passam. (Confirma que o import `getAgent` em admin.ts não cria ciclo — agent.ts não importa admin.ts.)

- [ ] **Step 4: Commit**

```bash
rtk git add apps/orchestrator-api/src/routes/admin.ts apps/orchestrator-api/.env.example
rtk git commit -m "feat(api): GET /admin/runners (snapshot de saúde) (MAC-39)"
```

---

## Task 5: Build + suite + push

**Files:** nenhum (verificação final).

- [ ] **Step 1: Build completo**

Run: `rtk pnpm -r build`
Expected: todos os pacotes OK.

- [ ] **Step 2: Suite completa**

Run: `rtk pnpm test`
Expected: PASS — os ~83 atuais + 8 novos (`parseRunnerUrls` 2, `dispatch` 5, `probeAll` 1) ≈ 91. Sem regressão.

- [ ] **Step 3: Push**

```bash
rtk git push
```

- [ ] **Step 4: Nota de deploy/E2E (manual, fora daqui)**

- **Sem migration.** Só redeploy `orchestrator` (runners não mudam). `deploy.sh orchestrator`.
- **Retrocompatível:** sem `RUNNER_BASE_URLS` no `.env`, segue usando `RUNNER_BASE_URL` (1 runner). Failover só aparece com ≥2 URLs.
- **E2E:** `GET /admin/runners` (bearer) → `[{ url, healthy, ms }]`. Pra testar failover de verdade: pôr 2 URLs em `RUNNER_BASE_URLS` (a 2ª inexistente/derrubada), disparar um run e ver no log do orchestrator `runner ... não-saudável — pulando` / `failover` e o job concluir no runner saudável. Um run normal (1 runner saudável) deve seguir idêntico ao de hoje.

---

## Self-Review (preenchido)

**Cobertura do spec:**
- `RUNNER_BASE_URLS` + `parseRunnerUrls` → Task 2. ✅
- `workerManager` (dispatch round-robin + probe + failover; probeAll) → Task 2. ✅
- Failover só em transporte/5xx, não em `result.status:'failed'` (e 4xx = rejeição real) → Task 2 (dispatch + teste). ✅
- graph transport-agnostic: `dispatch` injetado, coder sem fetch direto, tipos exportados → Tasks 1 + 3. ✅
- `GET /admin/runners` → Task 4. ✅
- Wiring (agent monta workerManager, injeta, expõe no Agent) → Task 3. ✅
- `.env.example` → Task 4. ✅
- Timeout do health (2s, AbortController) → Task 2. ✅

**Placeholders:** nenhum — todo passo tem código/comando concreto.

**Consistência de tipos:** `RunnerJobBody`/`RunnerResult`/`DispatchFn` definidos na Task 1, importados pelo workerManager (Task 2) e usados pelo coder/build/agent (Task 3) com os mesmos nomes/campos. `WorkerManager`/`RunnerProbe` definidos na Task 2 e usados na Task 3 (Agent) e Task 4 (admin). `parseRunnerUrls(raw, fallback)` definido na Task 2 e chamado igual na Task 3. O body montado no coder (Task 3) bate campo-a-campo com `RunnerJobBody` (Task 1).
