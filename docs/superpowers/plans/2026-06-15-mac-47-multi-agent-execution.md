# Multi-Agent Execution (MAC-47) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Processar N runs em paralelo (concorrência configurável) com coordenação à prova de race (dedup de issue por índice), limites (max concorrência + cost guard existente) e observabilidade (runs ativos via REST/MCP/Grafana).

**Architecture:** `AGENT_MAX_CONCURRENCY` (env, default 3) vira o `concurrency` do Worker BullMQ do agente. Os guards de paralelismo já existem (branch única por run, thread_id/worktree isolados, dispatch MAC-39); reforço novo = índice único parcial `runs(linear_issue_id) WHERE ativo` (migration 0009) + webhook tratando a violação como skip. Observabilidade = `GET /admin/concurrency` + MCP `agent_concurrency` + gauge no Grafana. `isUniqueViolation` extraído pra util compartilhado.

**Tech Stack:** TypeScript, BullMQ, Drizzle ORM (Postgres), Hono, Zod, MCP SDK, Vitest, Grafana.

---

## File Structure

**Criar:**
- `apps/orchestrator-api/src/db/pgError.ts` — `isUniqueViolation` compartilhado.
- `apps/orchestrator-api/src/db/pgError.test.ts` — teste do helper.
- `apps/orchestrator-api/src/routes/admin.test.ts` — teste do `/admin/concurrency`.
- `apps/orchestrator-api/drizzle/0009_*.sql` — gerado.

**Modificar:**
- `apps/orchestrator-api/src/env.ts` — `AGENT_MAX_CONCURRENCY`.
- `apps/orchestrator-api/src/worker.ts` — `concurrency` no Worker.
- `apps/orchestrator-api/.env.example` + `infra/compose/orchestrator/docker-compose.yml` — env nova.
- `apps/orchestrator-api/src/agents.ts` + `tools.ts` — usar o `isUniqueViolation` compartilhado.
- `apps/orchestrator-api/src/db/schema.ts` — índice `runs_active_issue_uq`.
- `apps/orchestrator-api/src/routes/webhooks.ts` — captura violação no `createRun`.
- `apps/orchestrator-api/src/runs.ts` — exportar `ACTIVE_STATUSES` + `countRunsByStatus`.
- `apps/orchestrator-api/src/routes/admin.ts` — `GET /admin/concurrency`.
- `apps/mcp-server/src/client.ts` / `client.test.ts` / `tools.ts` / `README.md` — `agent_concurrency`.
- `infra/compose/observability/provisioning/dashboards/agent-runs.json` — gauge runs ativos.

---

## Task 1: Concorrência configurável

**Files:**
- Modify: `apps/orchestrator-api/src/env.ts`, `apps/orchestrator-api/src/worker.ts`, `apps/orchestrator-api/.env.example`, `infra/compose/orchestrator/docker-compose.yml`

- [ ] **Step 1: env nova**

Em `env.ts`, no `envSchema` (perto de `AGENT_MAX_COST_PER_DAY_USD`):
```ts
  // Multi-Agent Execution (MAC-47): nº de runs processados em paralelo pelo worker.
  AGENT_MAX_CONCURRENCY: z.coerce.number().default(3),
```

- [ ] **Step 2: aplicar no Worker**

Em `worker.ts`, o `new Worker(AGENT_QUEUE, async (job) => {...}, { connection });` — trocar a options final `{ connection }` por:
```ts
    { connection, concurrency: env.AGENT_MAX_CONCURRENCY },
```
(`env` já está importado em `worker.ts`.) NÃO mexer no `scheduleWorker`.

- [ ] **Step 3: .env.example + compose**

Em `apps/orchestrator-api/.env.example`, perto das `AGENT_*`:
```
# Multi-Agent Execution (MAC-47): runs em paralelo
AGENT_MAX_CONCURRENCY=3
```
Em `infra/compose/orchestrator/docker-compose.yml`, na lista `environment:` do serviço `api` (estilo map, igual às vizinhas):
```yaml
      AGENT_MAX_CONCURRENCY: ${AGENT_MAX_CONCURRENCY:-3}
```

- [ ] **Step 4: build**

Run: `rtk pnpm --filter @agent-platform/orchestrator-api build`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
rtk git add apps/orchestrator-api/src/env.ts apps/orchestrator-api/src/worker.ts apps/orchestrator-api/.env.example infra/compose/orchestrator/docker-compose.yml
rtk git commit -m "feat(multi-agent): AGENT_MAX_CONCURRENCY no worker (MAC-47)"
```

---

## Task 2: Extrair `isUniqueViolation` (util compartilhado, TDD)

**Files:**
- Create: `apps/orchestrator-api/src/db/pgError.ts`, `apps/orchestrator-api/src/db/pgError.test.ts`
- Modify: `apps/orchestrator-api/src/agents.ts`, `apps/orchestrator-api/src/tools.ts`

- [ ] **Step 1: Teste que falha** — criar `apps/orchestrator-api/src/db/pgError.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { isUniqueViolation } from './pgError.js';

describe('isUniqueViolation', () => {
  it('true para erro pg com code 23505', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true);
  });
  it('false para outro code', () => {
    expect(isUniqueViolation({ code: '23503' })).toBe(false);
  });
  it('false para não-objeto / null / sem code', () => {
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation('x')).toBe(false);
    expect(isUniqueViolation({})).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar pra ver falhar** — `rtk pnpm exec vitest run apps/orchestrator-api/src/db/pgError.test.ts` → FAIL.

- [ ] **Step 3: Criar `apps/orchestrator-api/src/db/pgError.ts`:**
```ts
/** Erro de violação de unique constraint do Postgres (code 23505). */
export function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === '23505'
  );
}
```

- [ ] **Step 4: Reusar em agents.ts e tools.ts** — em `agents.ts` e `tools.ts`, REMOVER a função local `isUniqueViolation` e importar a compartilhada:
```ts
import { isUniqueViolation } from './db/pgError.js';
```
(Conferir que o uso em `createAgent`/`createTool` continua igual.)

- [ ] **Step 5: Rodar testes** — `rtk pnpm exec vitest run apps/orchestrator-api/src/db/pgError.test.ts` → PASS (3). Build: `rtk pnpm --filter @agent-platform/orchestrator-api build` → PASS.

- [ ] **Step 6: Commit**
```bash
rtk git add apps/orchestrator-api/src/db/pgError.ts apps/orchestrator-api/src/db/pgError.test.ts apps/orchestrator-api/src/agents.ts apps/orchestrator-api/src/tools.ts
rtk git commit -m "refactor(db): extrai isUniqueViolation compartilhado (MAC-47)"
```

---

## Task 3: Dedup de issue por índice + webhook skip

**Files:**
- Modify: `apps/orchestrator-api/src/db/schema.ts`
- Create: `apps/orchestrator-api/drizzle/0009_*.sql` (gerado)
- Modify: `apps/orchestrator-api/src/routes/webhooks.ts`

- [ ] **Step 1: Índice único parcial no schema**

Em `schema.ts`, na tabela `runs`, o array `(t) => [ ... ]` já tem `runs_active_schedule_uq`. Adicionar um segundo índice:
```ts
    // MAC-47: no máx. 1 run ativo por issue (fecha a race de webhooks simultâneos).
    uniqueIndex('runs_active_issue_uq')
      .on(t.linearIssueId)
      .where(
        sql`${t.status} in ('pending','planning','awaiting_approval','executing','reviewing')`,
      ),
```

- [ ] **Step 2: Gerar migration**

Run: `rtk pnpm --filter @agent-platform/orchestrator-api db:generate`
Expected: `0009_*.sql` com `CREATE UNIQUE INDEX "runs_active_issue_uq" ON "runs" ... WHERE ...`. Sem outras mudanças.

- [ ] **Step 3: Webhook captura a violação como skip**

Em `routes/webhooks.ts`, importar o helper:
```ts
import { isUniqueViolation } from '../db/pgError.js';
```
Trocar o bloco do `createRun` (hoje `const runId = await createRun({...}); await agentQueue.add(...)`) por:
```ts
  // Cria o run e enfileira; a execução longa roda no worker (MAC-20).
  let runId: string;
  try {
    runId = await createRun({
      linearIssueId: issueId,
      linearIssueIdentifier: payload.data?.identifier ?? issueId,
      title: payload.data?.title ?? '(sem título)',
    });
  } catch (err) {
    // MAC-47: índice único de issue ativa — webhook concorrente da mesma issue.
    if (isUniqueViolation(err)) {
      logger.warn({ issue: identifier }, 'run ativo já existe (índice); ignorando duplicata');
      return c.json({ ok: true, skipped: true, reason: 'active run exists' });
    }
    throw err;
  }
  await agentQueue.add('plan', { kind: 'plan', runId, issueId }, { priority: JOB_PRIORITY.plan });
```
(Manter o `hasActiveRunForIssue` prévio como fast-path — é o backstop o índice.)

- [ ] **Step 4: build** — `rtk pnpm --filter @agent-platform/orchestrator-api build` → PASS.

- [ ] **Step 5: Commit**
```bash
rtk git add apps/orchestrator-api/src/db/schema.ts apps/orchestrator-api/drizzle/ apps/orchestrator-api/src/routes/webhooks.ts
rtk git commit -m "feat(multi-agent): índice único de issue ativa + webhook skip na race (MAC-47)"
```

---

## Task 4: `countRunsByStatus` + `GET /admin/concurrency` (TDD)

**Files:**
- Modify: `apps/orchestrator-api/src/runs.ts`, `apps/orchestrator-api/src/routes/admin.ts`
- Create: `apps/orchestrator-api/src/routes/admin.test.ts`

- [ ] **Step 1: Exportar `ACTIVE_STATUSES` + `countRunsByStatus` em `runs.ts`**

Em `runs.ts`, a const `ACTIVE_STATUSES` hoje é `const ACTIVE_STATUSES: RunStatus[] = [...]`. Trocar pra `export const ACTIVE_STATUSES: RunStatus[] = [...]`.

Garantir `sql` importado de `drizzle-orm` (já é — `runs.ts` usa `sql` no overlap index? confirmar; se não, adicionar). Adicionar a função:
```ts
/** Contagem de runs por status (MAC-47, observabilidade de concorrência). */
export async function countRunsByStatus(): Promise<Partial<Record<RunStatus, number>>> {
  const rows = await db
    .select({ status: schema.runs.status, count: sql<number>`count(*)::int` })
    .from(schema.runs)
    .groupBy(schema.runs.status);
  const out: Partial<Record<RunStatus, number>> = {};
  for (const r of rows) out[r.status as RunStatus] = r.count;
  return out;
}
```

- [ ] **Step 2: Teste que falha** — criar `apps/orchestrator-api/src/routes/admin.test.ts`:
```ts
import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { countRunsByStatus } from '../runs.js';
import { adminRoute } from './admin.js';

vi.mock('../runs.js', () => ({
  countRunsByStatus: vi.fn(),
  ACTIVE_STATUSES: ['pending', 'planning', 'awaiting_approval', 'executing', 'reviewing'],
}));
vi.mock('../env.js', () => ({ env: { RUNNER_AUTH_TOKEN: 'secret', AGENT_MAX_CONCURRENCY: 3 } }));
vi.mock('../killswitch.js', () => ({ isPaused: vi.fn(), setPaused: vi.fn() }));
vi.mock('../agent.js', () => ({ getAgent: vi.fn() }));

const app = new Hono();
app.route('/', adminRoute);
const auth = { authorization: 'Bearer secret' };

beforeEach(() => vi.clearAllMocks());

describe('GET /admin/concurrency', () => {
  it('401 sem bearer', async () => {
    const res = await app.request('/admin/concurrency');
    expect(res.status).toBe(401);
  });

  it('devolve limit, active e byStatus', async () => {
    vi.mocked(countRunsByStatus).mockResolvedValue({ executing: 2, completed: 5, planning: 1 });
    const res = await app.request('/admin/concurrency', { headers: auth });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { limit: number; active: number; byStatus: Record<string, number> };
    expect(body.limit).toBe(3);
    expect(body.active).toBe(3); // executing 2 + planning 1
    expect(body.byStatus).toEqual({ executing: 2, completed: 5, planning: 1 });
  });
});
```

- [ ] **Step 3: Rodar pra ver falhar** — `rtk pnpm exec vitest run apps/orchestrator-api/src/routes/admin.test.ts` → FAIL (rota não existe).

- [ ] **Step 4: Implementar a rota** — em `routes/admin.ts`, adicionar imports:
```ts
import { ACTIVE_STATUSES, countRunsByStatus } from '../runs.js';
```
E a rota (após `/admin/runners`):
```ts
/** Observabilidade de concorrência (MAC-47): limite + runs ativos por status. */
adminRoute.get('/admin/concurrency', async (c) => {
  const byStatus = await countRunsByStatus();
  const active = ACTIVE_STATUSES.reduce((sum, s) => sum + (byStatus[s] ?? 0), 0);
  return c.json({ limit: env.AGENT_MAX_CONCURRENCY, active, byStatus });
});
```

- [ ] **Step 5: Rodar pra ver passar** — `rtk pnpm exec vitest run apps/orchestrator-api/src/routes/admin.test.ts` → PASS (2). Build: `rtk pnpm --filter @agent-platform/orchestrator-api build` → PASS.

- [ ] **Step 6: Commit**
```bash
rtk git add apps/orchestrator-api/src/runs.ts apps/orchestrator-api/src/routes/admin.ts apps/orchestrator-api/src/routes/admin.test.ts
rtk git commit -m "feat(multi-agent): GET /admin/concurrency (limite + runs ativos) (MAC-47)"
```

---

## Task 5: MCP `agent_concurrency` (TDD)

**Files:**
- Modify: `apps/mcp-server/src/client.ts`, `apps/mcp-server/src/client.test.ts`, `apps/mcp-server/src/tools.ts`, `apps/mcp-server/README.md`

- [ ] **Step 1: Caso de teste** — em `apps/mcp-server/src/client.test.ts`, no array `cases` do teste paramétrico, adicionar:
```ts
      [(c) => c.agentConcurrency(), 'GET', 'http://orch:3000/admin/concurrency'],
```

- [ ] **Step 2: Rodar pra ver falhar** — `rtk pnpm exec vitest run apps/mcp-server/src/client.test.ts` → FAIL (`agentConcurrency` não existe).

- [ ] **Step 3: Método no client** — em `client.ts`, na interface `OrchestratorClient` (após `agentStatus`):
```ts
  agentConcurrency(): Promise<unknown>;
```
E na impl de `createClient` (após `agentStatus`):
```ts
    agentConcurrency: () => call('GET', '/admin/concurrency'),
```

- [ ] **Step 4: Rodar pra ver passar** — `rtk pnpm exec vitest run apps/mcp-server/src/client.test.ts` → PASS.

- [ ] **Step 5: Registrar a tool** — em `tools.ts`, junto das tools de leitura (após `agent_status`):
```ts
  server.tool(
    'agent_concurrency',
    'Concorrência de execução: limite configurado, runs ativos e contagem por status (MAC-47).',
    {},
    () => asTool(() => client.agentConcurrency()),
  );
```

- [ ] **Step 6: README** — em `apps/mcp-server/README.md`, adicionar `agent_concurrency` (→ `GET /admin/concurrency`) na lista de tools de leitura.

- [ ] **Step 7: Build + teste** — `rtk pnpm --filter @agent-platform/mcp-server build && rtk pnpm exec vitest run apps/mcp-server/src/client.test.ts` → PASS.

- [ ] **Step 8: Commit**
```bash
rtk git add apps/mcp-server/src/client.ts apps/mcp-server/src/client.test.ts apps/mcp-server/src/tools.ts apps/mcp-server/README.md
rtk git commit -m "feat(multi-agent): tool MCP agent_concurrency (MAC-47)"
```

---

## Task 6: Painel Grafana + suíte completa

**Files:**
- Modify: `infra/compose/observability/provisioning/dashboards/agent-runs.json`

- [ ] **Step 1: Inspecionar um painel existente**

Run: `rtk read infra/compose/observability/provisioning/dashboards/agent-runs.json`
Identificar a estrutura de um painel `stat` existente (campos `datasource` uid `orchestrator_pg`, `targets[].rawSql`, `gridPos`, `id`, `type`) pra copiar o formato.

- [ ] **Step 2: Adicionar um painel "Runs ativos agora"**

Adicionar ao array `panels` um novo painel `stat` com `id` único (maior que os existentes), `datasource` = orchestrator_pg (mesmo dos outros), `gridPos` numa posição livre, título "Runs ativos agora", e o target rawSql:
```sql
SELECT count(*) AS "ativos" FROM runs WHERE status IN ('pending','planning','awaiting_approval','executing','reviewing')
```
Espelhar EXATAMENTE a forma de um painel `stat` já presente no arquivo (datasource, fieldConfig, options, targets[].format='table'/'time_series' conforme os vizinhos). Validar que o JSON continua válido:
Run: `rtk pnpm exec node -e "JSON.parse(require('fs').readFileSync('infra/compose/observability/provisioning/dashboards/agent-runs.json','utf8')); console.log('json ok')"`
Expected: `json ok`.

- [ ] **Step 3: Suíte completa (sanity)**

Run: `rtk pnpm -r build && rtk pnpm test`
Expected: PASS (todos; ~152 + novos do MAC-47: pgError 3, admin 2, client MCP 1). Reportar a contagem.

- [ ] **Step 4: Commit**
```bash
rtk git add infra/compose/observability/provisioning/dashboards/agent-runs.json
rtk git commit -m "feat(multi-agent): painel Grafana de runs ativos (MAC-47)"
```

---

## Deploy + E2E (pós-implementação, rodado pelo usuário)

> Agrupável com MAC-42/43/45. Orchestrator-only + observability (Grafana recarrega o JSON). Runners NÃO mudam.

1. **Deploy (host 192.168.0.10):**
   ```bash
   cd ~/agent-platform && git pull && bash infra/deploy/deploy.sh orchestrator && bash infra/deploy/deploy.sh observability
   ```
   Aplica migrations pendentes (0006..0009); sobe a API com `AGENT_MAX_CONCURRENCY=3`; Grafana recarrega o dashboard.
2. **Túnel REST:** `ssh -fN -L 3000:10.10.0.11:3000 root@192.168.0.10`
3. **Verificar:**
   - `curl -H "authorization: Bearer $RUNNER_AUTH_TOKEN" http://localhost:3000/admin/concurrency` → `{limit:3, active, byStatus}`.
   - Paralelo: labelar 2-3 issues `ai-ready` quase juntas → ver runs rodando simultâneos (logs + `/admin/concurrency` active>1 + `/runs`).
   - Dedup: o índice impede 2 runs ativos da mesma issue (re-labelar a mesma issue com run ativo → skip).
   - MCP `agent_concurrency` no Claude Code.
   - Grafana: painel "Runs ativos agora" no dashboard Agent Platform.
4. **Linear:** comentar progresso na MAC-47 + mover pra Done. **Fecha a Fase 7.**

---

## Self-Review

**Spec coverage:**
- Limites (AGENT_MAX_CONCURRENCY → Worker concurrency; cost guard reusado) → Task 1. ✅
- Coordenação (índice único de issue ativa + webhook skip; guards existentes confirmados) → Task 3. ✅
- Observabilidade (`/admin/concurrency` + MCP + Grafana) → Tasks 4,5,6. ✅
- Util compartilhado `isUniqueViolation` → Task 2. ✅
- Error handling (violação → skip não-500; 401 sem bearer) → Tasks 3,4. ✅
- Testes (pgError 3, admin 2, MCP client 1, env coerção via default) → Tasks 2,4,5. ✅

**Placeholder scan:** o painel Grafana (Task 6) é o item mais "adaptar ao real" — instrução concreta (copiar forma de um painel stat existente + rawSql dado + validação de JSON). Sem placeholders de código.

**Type consistency:** `isUniqueViolation` (pgError.ts) reusado em agents/tools/webhook; `ACTIVE_STATUSES`/`countRunsByStatus` (runs.ts) usados em admin.ts; `agentConcurrency` (client) ↔ tool `agent_concurrency` ↔ `GET /admin/concurrency`; `AGENT_MAX_CONCURRENCY` (env) no worker + admin response. Nomes batem entre tasks.
