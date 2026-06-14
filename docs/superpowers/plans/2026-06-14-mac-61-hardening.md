# MAC-61 Hardening — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar os 4 débitos não-bloqueantes dos reviews de MAC-38/39/44: índice+unique em artifacts, índice único parcial pro overlap guard do scheduler, 404 na lista de artifacts, baseBranch configurável no coder.

**Architecture:** Code-only no `orchestrator-api` + `packages/graph`, uma migration nova (`0005`). 4 itens independentes; cada commit builda verde.

**Tech Stack:** TypeScript (ESM, NodeNext), Drizzle 0.38 (Postgres), Hono, vitest. Monorepo pnpm.

**Spec:** `docs/superpowers/specs/2026-06-14-mac-61-hardening-design.md`

**Convenções:** main direto, commit+push por task, `rtk` nos comandos, ESM `.js`, vitest (`pnpm test`).

---

## File Structure

- `apps/orchestrator-api/src/db/schema.ts` — **MODIFY**: 3º arg (índices) em `artifacts` e `runs`.
- `apps/orchestrator-api/drizzle/0005_*.sql` — **CREATE** (drizzle-kit generate; verificar/ajustar o WHERE do parcial).
- `apps/orchestrator-api/src/routes/artifacts.ts` — **MODIFY**: 404 via `getRun`.
- `apps/orchestrator-api/src/routes/artifacts.test.ts` — **MODIFY**: caso 404 + ajuste do caso lista.
- `packages/graph/src/nodes/coder.ts` — **MODIFY**: `CoderDeps.baseBranch` + uso no body.
- `packages/graph/src/build.ts` — **MODIFY**: passa `baseBranch` ao `coderDeps`.

---

## Task 1: Índices/unique no schema + migration 0005

**Files:**
- Modify: `apps/orchestrator-api/src/db/schema.ts`
- Create: `apps/orchestrator-api/drizzle/0005_*.sql` (gerado)

- [ ] **Step 1: Imports**

Em `apps/orchestrator-api/src/db/schema.ts`, troque a 1ª linha:
```ts
import { boolean, integer, jsonb, numeric, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
```
por:
```ts
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
```

- [ ] **Step 2: Índice único parcial na tabela `runs`**

A tabela `runs` é `pgTable('runs', {...})`. Adicione um 3º argumento (callback de índices) — troque o fechamento `});` da definição de `runs` por `}, (t) => [...]);` com o índice parcial. Concretamente, localize o fim da tabela `runs` (a linha `});` logo após o campo `updatedAt: ...`) e troque-a por:
```ts
  },
  (t) => [
    // MAC-61: no máx. 1 run ativo por agendamento (fecha a race do overlap guard).
    // schedule_id NULL (runs do webhook) é distinto em unique → webhook não afetado.
    uniqueIndex('runs_active_schedule_uq')
      .on(t.scheduleId)
      .where(
        sql`${t.status} in ('pending','planning','awaiting_approval','executing','reviewing')`,
      ),
  ],
);
```

- [ ] **Step 3: Índice + unique na tabela `artifacts`**

A tabela `artifacts` é `pgTable('artifacts', {...})`. Troque o fechamento `});` dela por:
```ts
  },
  (t) => [
    // MAC-61: FK não cria índice; listArtifacts filtra por run_id.
    index('artifacts_run_id_idx').on(t.runId),
    // MAC-61: 1 artefato por kind/run (reforça o no-dup do plan na borda do banco).
    uniqueIndex('artifacts_run_id_kind_uq').on(t.runId, t.kind),
  ],
);
```

- [ ] **Step 4: Gerar a migration**

Run: `DATABASE_URL=postgres://x rtk pnpm --filter @agent-platform/orchestrator-api db:generate`
Expected: cria `apps/orchestrator-api/drizzle/0005_*.sql` com `CREATE INDEX "artifacts_run_id_idx"`, `CREATE UNIQUE INDEX "artifacts_run_id_kind_uq"`, e `CREATE UNIQUE INDEX "runs_active_schedule_uq" ... WHERE ...`.

- [ ] **Step 5: Conferir o WHERE do índice parcial**

Abra o `0005_*.sql` gerado e confirme que a linha do `runs_active_schedule_uq` inclui o predicado `WHERE "status" in ('pending','planning','awaiting_approval','executing','reviewing')`. Se o drizzle-kit **não** tiver emitido o `WHERE` (índice ficou sem predicado), edite o arquivo `0005_*.sql` à mão para incluí-lo:
```sql
CREATE UNIQUE INDEX "runs_active_schedule_uq" ON "runs" ("schedule_id") WHERE "status" in ('pending','planning','awaiting_approval','executing','reviewing');
```

- [ ] **Step 6: Verify build**

Run: `rtk pnpm --filter @agent-platform/orchestrator-api build`
Expected: tsc OK.

- [ ] **Step 7: Commit**

```bash
rtk git add apps/orchestrator-api/src/db/schema.ts apps/orchestrator-api/drizzle
rtk git commit -m "feat(api): índices artifacts + unique parcial do overlap guard (MAC-61)"
```

---

## Task 2: 404 na lista de artifacts pra run inexistente

**Files:**
- Modify: `apps/orchestrator-api/src/routes/artifacts.ts`
- Modify: `apps/orchestrator-api/src/routes/artifacts.test.ts`

- [ ] **Step 1: Atualizar o teste (TDD — novo caso 404)**

Em `apps/orchestrator-api/src/routes/artifacts.test.ts`, troque o mock de `../artifacts.js` e o bloco `describe('GET /runs/:id/artifacts', ...)`.

Troque o mock no topo:
```ts
vi.mock('../artifacts.js', () => ({
  listArtifacts: vi.fn(),
  getArtifact: vi.fn(),
}));
```
por (adiciona o mock de `getRun` da `../runs.js`):
```ts
vi.mock('../artifacts.js', () => ({
  listArtifacts: vi.fn(),
  getArtifact: vi.fn(),
}));
vi.mock('../runs.js', () => ({ getRun: vi.fn() }));
```
Adicione o import (junto dos outros):
```ts
import { getRun } from '../runs.js';
```
Troque o `describe('GET /runs/:id/artifacts', ...)` inteiro por:
```ts
describe('GET /runs/:id/artifacts', () => {
  it('lista os artefatos do run existente', async () => {
    vi.mocked(getRun).mockResolvedValue({ id: 'run-1' } as never);
    vi.mocked(listArtifacts).mockResolvedValue([
      { id: 'a1', kind: 'plan', createdAt: new Date('2026-01-01') },
    ] as never);
    const res = await app.request('/runs/run-1/artifacts');
    expect(res.status).toBe(200);
    expect(listArtifacts).toHaveBeenCalledWith('run-1');
    const body = (await res.json()) as { artifacts: unknown[] };
    expect(body.artifacts).toHaveLength(1);
  });

  it('404 quando o run não existe', async () => {
    vi.mocked(getRun).mockResolvedValue(null);
    const res = await app.request('/runs/missing/artifacts');
    expect(res.status).toBe(404);
    expect(listArtifacts).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk vitest run apps/orchestrator-api/src/routes/artifacts.test.ts`
Expected: FAIL — o handler atual não checa `getRun` (o caso 404 falha; e o caso lista pode falhar por `getRun` não-mockado no handler).

- [ ] **Step 3: Implementar o 404 no handler**

Em `apps/orchestrator-api/src/routes/artifacts.ts`, adicione o import:
```ts
import { getRun } from '../runs.js';
```
E troque o handler da lista:
```ts
/** Lista os artefatos de um run (metadados, sem content). */
artifactsRoute.get('/runs/:id/artifacts', async (c) => {
  return c.json({ artifacts: await listArtifacts(c.req.param('id')) });
});
```
por:
```ts
/** Lista os artefatos de um run (metadados, sem content). */
artifactsRoute.get('/runs/:id/artifacts', async (c) => {
  const id = c.req.param('id');
  const run = await getRun(id);
  if (!run) return c.json({ error: 'not found' }, 404);
  return c.json({ artifacts: await listArtifacts(id) });
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `rtk vitest run apps/orchestrator-api/src/routes/artifacts.test.ts`
Expected: PASS (3 testes: lista existente, 404, get-by-id 404 já existente do MAC-44).

- [ ] **Step 5: Verify build**

Run: `rtk pnpm --filter @agent-platform/orchestrator-api build`
Expected: tsc OK.

- [ ] **Step 6: Commit**

```bash
rtk git add apps/orchestrator-api/src/routes/artifacts.ts apps/orchestrator-api/src/routes/artifacts.test.ts
rtk git commit -m "feat(api): 404 na lista de artifacts p/ run inexistente (MAC-61)"
```

---

## Task 3: baseBranch configurável no coder

**Files:**
- Modify: `packages/graph/src/nodes/coder.ts`
- Modify: `packages/graph/src/build.ts`

- [ ] **Step 1: `CoderDeps` ganha `baseBranch` (coder.ts)**

Em `packages/graph/src/nodes/coder.ts`, na interface `CoderDeps`, após o campo `repoUrl`, adicione:
```ts
  /** Branch base do clone/diff/PR (MAC-61: alinha coder e PR node). */
  baseBranch: string;
```
(A interface fica: `linear`, `repoUrl`, `baseBranch`, `dispatch`, `testCommands`, `loadLessons?`.)

- [ ] **Step 2: Usar `deps.baseBranch` no body (coder.ts)**

No corpo do nó, no objeto passado a `deps.dispatch({...})`, troque:
```ts
        baseBranch: 'main',
```
por:
```ts
        baseBranch: deps.baseBranch,
```

- [ ] **Step 3: `build.ts` passa `baseBranch` ao `coderDeps`**

Em `packages/graph/src/build.ts`, troque o `coderDeps`:
```ts
  const coderDeps = {
    linear: deps.linear,
    repoUrl: deps.runnerRepoUrl,
    dispatch: deps.dispatch,
    testCommands: deps.testCommands ?? [],
    loadLessons: deps.loadLessons,
  };
```
por:
```ts
  const coderDeps = {
    linear: deps.linear,
    repoUrl: deps.runnerRepoUrl,
    baseBranch: deps.baseBranch ?? 'main',
    dispatch: deps.dispatch,
    testCommands: deps.testCommands ?? [],
    loadLessons: deps.loadLessons,
  };
```
(`deps.baseBranch` já existe em `GraphDeps` e já é usado pelo PR node — mesmo default `'main'`.)

- [ ] **Step 4: Verify build + tests**

Run: `rtk pnpm --filter @agent-platform/graph build && rtk vitest run packages/graph`
Expected: tsc OK; testes do graph passam.

- [ ] **Step 5: Commit**

```bash
rtk git add packages/graph/src/nodes/coder.ts packages/graph/src/build.ts
rtk git commit -m "feat(graph): baseBranch configurável no coder (alinha com PR node) (MAC-61)"
```

---

## Task 4: Build + suite + push

**Files:** nenhum (verificação final).

- [ ] **Step 1: Build completo**

Run: `rtk pnpm -r build`
Expected: todos os pacotes OK.

- [ ] **Step 2: Suite completa**

Run: `rtk pnpm test`
Expected: PASS — os ~97 atuais + 1 novo (404 da lista de artifacts) ≈ 98. Sem regressão.

- [ ] **Step 3: Push**

```bash
rtk git push
```

- [ ] **Step 4: Nota de deploy (manual, fora daqui)**

- Migration `0005` aplicada no próximo `deploy.sh orchestrator` (junto de 0003/0004 pendentes). Runners não mudam.
- O `CREATE UNIQUE INDEX` parcial roda sobre `runs` existente — como o scheduler ainda não rodou em prod, não há `schedule_id` preenchido → criação limpa. Se algum dia houver >1 run ativo pré-existente pro mesmo schedule, o índice falha e exige limpeza manual antes.

---

## Self-Review (preenchido)

**Cobertura do spec:**
- Item 1 (artifacts índice + unique) → Task 1. ✅
- Item 2 (overlap guard índice único parcial) → Task 1 (com verificação/hand-edit do WHERE). ✅
- Item 3 (artifacts 404) → Task 2. ✅
- Item 4 (coder baseBranch) → Task 3. ✅

**Placeholders:** nenhum — a verificação do WHERE (Task 1 Step 5) é contingência concreta com o SQL exato a usar, não placeholder.

**Consistência de tipos:** `CoderDeps.baseBranch` (Task 3) batido com `deps.baseBranch` em build.ts (já existe em `GraphDeps`). `getRun` importado de `../runs.js` no handler (Task 2) e mockado no teste com o mesmo path. Nomes de índices (`runs_active_schedule_uq`, `artifacts_run_id_idx`, `artifacts_run_id_kind_uq`) consistentes entre schema e a verificação do SQL.
