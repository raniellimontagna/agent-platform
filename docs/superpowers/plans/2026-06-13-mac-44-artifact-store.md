# MAC-44 Artifact Store — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guardar de forma durável e queryável os artefatos de cada run (plan, patch, review, validation, summary) no Postgres, capturados no worker e expostos via REST.

**Architecture:** Tabela `artifacts` (Postgres) com FK ON DELETE CASCADE pro run. Data layer `artifacts.ts` (`saveArtifacts`/`listArtifacts`/`getArtifact`). Captura não-fatal no `worker.ts` ao fim de cada job (plan job → plan; resume job → patch/review/validation/summary). REST `GET /runs/:id/artifacts` + `GET /artifacts/:id`.

**Tech Stack:** TypeScript (ESM, NodeNext), Drizzle (Postgres), Hono, vitest. Monorepo pnpm. App: `apps/orchestrator-api`.

**Spec:** `docs/superpowers/specs/2026-06-13-mac-44-artifact-store-design.md`

**Convenções:** trabalha-se direto na `main` (commit+push por task). Prefixar comandos com `rtk`. ESM imports com `.js`. vitest (`pnpm test`). Rotas de `runs` são SEM auth (rede isolada) — artifacts segue igual.

---

## File Structure

- `apps/orchestrator-api/src/db/schema.ts` — **MODIFY**: enum `artifact_kind` + tabela `artifacts`.
- `apps/orchestrator-api/drizzle/0004_*.sql` — **CREATE** (drizzle-kit generate).
- `apps/orchestrator-api/src/artifacts.ts` — **CREATE**: data layer.
- `apps/orchestrator-api/src/artifacts.test.ts` — **CREATE**: teste de `saveArtifacts`.
- `apps/orchestrator-api/src/worker.ts` — **MODIFY**: captura (plan/resume) + ajuste do tipo `result`.
- `apps/orchestrator-api/src/routes/artifacts.ts` — **CREATE**: REST.
- `apps/orchestrator-api/src/routes/artifacts.test.ts` — **CREATE**: testes de rota.
- `apps/orchestrator-api/src/index.ts` — **MODIFY**: registra a rota.

---

## Task 1: Schema — enum + tabela `artifacts` + migration

**Files:**
- Modify: `apps/orchestrator-api/src/db/schema.ts`
- Create: `apps/orchestrator-api/drizzle/0004_*.sql` (gerado)

- [ ] **Step 1: Adicionar enum + tabela**

Em `apps/orchestrator-api/src/db/schema.ts`, após a tabela `lessons` (e antes do bloco final de `export type ...`), adicione:
```ts
export const artifactKind = pgEnum('artifact_kind', [
  'plan',
  'patch',
  'review',
  'validation',
  'summary',
]);

/** Artefatos produzidos por um run, guardados de forma durável (MAC-44). */
export const artifacts = pgTable('artifacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  runId: uuid('run_id')
    .notNull()
    .references(() => runs.id, { onDelete: 'cascade' }),
  kind: artifactKind('kind').notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```

E no bloco de `export type` no final do arquivo, adicione:
```ts
export type Artifact = typeof artifacts.$inferSelect;
export type NewArtifact = typeof artifacts.$inferInsert;
```

- [ ] **Step 2: Gerar a migration**

Run: `DATABASE_URL=postgres://x rtk pnpm --filter @agent-platform/orchestrator-api db:generate`
Expected: cria `apps/orchestrator-api/drizzle/0004_*.sql` com `CREATE TYPE "artifact_kind"` + `CREATE TABLE "artifacts"` (FK `run_id` → `runs` `ON DELETE cascade`). (DATABASE_URL só satisfaz o config; generate não conecta.)

- [ ] **Step 3: Verify build**

Run: `rtk pnpm --filter @agent-platform/orchestrator-api build`
Expected: tsc OK.

- [ ] **Step 4: Commit**

```bash
rtk git add apps/orchestrator-api/src/db/schema.ts apps/orchestrator-api/drizzle
rtk git commit -m "feat(api): schema do artifact store (tabela artifacts) (MAC-44)"
```

---

## Task 2: Data layer `artifacts.ts`

**Files:**
- Create: `apps/orchestrator-api/src/artifacts.ts`
- Test: `apps/orchestrator-api/src/artifacts.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/orchestrator-api/src/artifacts.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const insertValues = vi.fn();
const insert = vi.fn(() => ({ values: insertValues }));

vi.mock('./db/client.js', () => ({
  db: { insert: (...a: unknown[]) => insert(...a) },
  schema: { artifacts: { __table: 'artifacts' } },
}));

import { saveArtifacts } from './artifacts.js';

beforeEach(() => {
  vi.clearAllMocks();
  insertValues.mockResolvedValue(undefined);
});

describe('saveArtifacts', () => {
  it('grava só os kinds não-vazios', async () => {
    await saveArtifacts('run-1', { plan: 'P', patch: '', review: undefined, summary: 'S' });
    expect(insert).toHaveBeenCalledTimes(1);
    const rows = insertValues.mock.calls[0][0];
    expect(rows).toEqual([
      { runId: 'run-1', kind: 'plan', content: 'P' },
      { runId: 'run-1', kind: 'summary', content: 'S' },
    ]);
  });

  it('não chama insert quando tudo vazio', async () => {
    await saveArtifacts('run-1', { plan: '', patch: undefined });
    expect(insert).not.toHaveBeenCalled();
  });

  it('trata content só-espaços como vazio', async () => {
    await saveArtifacts('run-1', { plan: '   ' });
    expect(insert).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk vitest run apps/orchestrator-api/src/artifacts.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Write implementation**

Create `apps/orchestrator-api/src/artifacts.ts`:
```ts
import { desc, eq } from 'drizzle-orm';
import { db, schema } from './db/client.js';

export type ArtifactKind = (typeof schema.artifactKind.enumValues)[number];

/**
 * Grava os artefatos de um run (MAC-44). Insere uma linha por kind cujo content
 * é não-vazio (trim); map todo vazio → no-op. Insert em lote (uma query).
 */
export async function saveArtifacts(
  runId: string,
  parts: Partial<Record<ArtifactKind, string | undefined>>,
): Promise<void> {
  const rows = (Object.entries(parts) as [ArtifactKind, string | undefined][])
    .filter(([, content]) => content?.trim())
    .map(([kind, content]) => ({ runId, kind, content: content as string }));
  if (rows.length === 0) return;
  await db.insert(schema.artifacts).values(rows);
}

/** Metadados dos artefatos de um run (sem content), mais recentes por último. */
export async function listArtifacts(runId: string) {
  return db
    .select({
      id: schema.artifacts.id,
      kind: schema.artifacts.kind,
      createdAt: schema.artifacts.createdAt,
    })
    .from(schema.artifacts)
    .where(eq(schema.artifacts.runId, runId))
    .orderBy(schema.artifacts.createdAt);
}

/** Um artefato com content (null se não existe). */
export async function getArtifact(id: string) {
  const [row] = await db.select().from(schema.artifacts).where(eq(schema.artifacts.id, id)).limit(1);
  return row ?? null;
}
```

(Nota: `desc` importado caso precise; se o lint reclamar de import não-usado, remova `desc` — a ordenação aqui é ascendente por `createdAt`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `rtk vitest run apps/orchestrator-api/src/artifacts.test.ts`
Expected: PASS (3 testes). Se o build reclamar do import `desc` não-usado, remova-o do import (`import { eq } from 'drizzle-orm';`).

- [ ] **Step 5: Verify build**

Run: `rtk pnpm --filter @agent-platform/orchestrator-api build`
Expected: tsc OK.

- [ ] **Step 6: Commit**

```bash
rtk git add apps/orchestrator-api/src/artifacts.ts apps/orchestrator-api/src/artifacts.test.ts
rtk git commit -m "feat(api): data layer do artifact store (saveArtifacts/list/get) (MAC-44)"
```

---

## Task 3: Captura no `worker.ts`

**Files:**
- Modify: `apps/orchestrator-api/src/worker.ts`

- [ ] **Step 1: Importar `saveArtifacts`**

Em `apps/orchestrator-api/src/worker.ts`, adicione o import (junto dos outros locais):
```ts
import { saveArtifacts } from './artifacts.js';
```

- [ ] **Step 2: Estender o tipo inline de `result`**

O `let result: {...}` (logo após `const startedAt = new Date();`) não lista `plan`/`diff`/`summary`. Adicione esses três campos ao objeto de tipo. Troque:
```ts
      let result: {
        status?: string;
        planCostUsd?: number;
        codeCostUsd?: number;
        reviewCostUsd?: number;
        approvalReasons?: string[];
        branch?: string;
        prUrl?: string;
        review?: string;
        testsPassed?: boolean;
        testSummary?: string;
```
por (adiciona `plan`, `diff`, `summary` no topo do objeto):
```ts
      let result: {
        status?: string;
        plan?: string;
        diff?: string;
        summary?: string;
        planCostUsd?: number;
        codeCostUsd?: number;
        reviewCostUsd?: number;
        approvalReasons?: string[];
        branch?: string;
        prUrl?: string;
        review?: string;
        testsPassed?: boolean;
        testSummary?: string;
```
(NÃO remova nenhum campo existente — só adicionar os três.)

- [ ] **Step 3: Capturar os artefatos (não-fatal)**

Logo após o bloco do Memory Layer (o `if (reproved || testsFailed) {...}` que termina o handler), e ANTES do fechamento da função do worker, adicione:
```ts
      // Artifact Store (MAC-44): guarda os artefatos do run de forma durável.
      // Split por tipo de job evita duplicar o `plan` (reaparece no estado final
      // do resume). Não-fatal: falha aqui não derruba o run.
      try {
        if (job.data.kind === 'plan') {
          await saveArtifacts(runId, { plan: result.plan });
        } else {
          await saveArtifacts(runId, {
            patch: result.diff,
            review: result.review,
            validation: result.testSummary,
            summary: result.summary,
          });
        }
      } catch (err) {
        log.warn({ err }, 'falha ao salvar artefatos (não-fatal)');
      }
```
(`saveArtifacts` ignora campos vazios, então um resume sem diff/review não grava lixo. Confirme que esse bloco fica dentro do callback do `Worker` onde `job`, `runId`, `result` e `log` estão no escopo — é o mesmo escopo do bloco de Memory Layer.)

- [ ] **Step 4: Verify build + tests**

Run: `rtk pnpm --filter @agent-platform/orchestrator-api build && rtk vitest run apps/orchestrator-api`
Expected: tsc OK; testes passam.

- [ ] **Step 5: Commit**

```bash
rtk git add apps/orchestrator-api/src/worker.ts
rtk git commit -m "feat(api): captura artefatos do run no worker (MAC-44)"
```

---

## Task 4: REST `GET /runs/:id/artifacts` + `GET /artifacts/:id`

**Files:**
- Create: `apps/orchestrator-api/src/routes/artifacts.ts`
- Test: `apps/orchestrator-api/src/routes/artifacts.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/orchestrator-api/src/routes/artifacts.test.ts`:
```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk vitest run apps/orchestrator-api/src/routes/artifacts.test.ts`
Expected: FAIL — `artifactsRoute` não existe.

- [ ] **Step 3: Write implementation**

Create `apps/orchestrator-api/src/routes/artifacts.ts`:
```ts
import { Hono } from 'hono';
import { getArtifact, listArtifacts } from '../artifacts.js';

// Sem auth — mesma rede interna das rotas de runs (MAC-44).
export const artifactsRoute = new Hono();

/** Lista os artefatos de um run (metadados, sem content). */
artifactsRoute.get('/runs/:id/artifacts', async (c) => {
  return c.json({ artifacts: await listArtifacts(c.req.param('id')) });
});

/** Um artefato com content. */
artifactsRoute.get('/artifacts/:id', async (c) => {
  const artifact = await getArtifact(c.req.param('id'));
  if (!artifact) return c.json({ error: 'not found' }, 404);
  return c.json(artifact);
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `rtk vitest run apps/orchestrator-api/src/routes/artifacts.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
rtk git add apps/orchestrator-api/src/routes/artifacts.ts apps/orchestrator-api/src/routes/artifacts.test.ts
rtk git commit -m "feat(api): rotas REST do artifact store (MAC-44)"
```

---

## Task 5: Wiring no `index.ts`

**Files:**
- Modify: `apps/orchestrator-api/src/index.ts`

- [ ] **Step 1: Registrar a rota**

Em `apps/orchestrator-api/src/index.ts`, adicione o import (com os outros de rotas):
```ts
import { artifactsRoute } from './routes/artifacts.js';
```
E após `app.route('/', statsRoute);` (ou junto das outras chamadas `app.route`), adicione:
```ts
app.route('/', artifactsRoute);
```

- [ ] **Step 2: Verify build + tests**

Run: `rtk pnpm --filter @agent-platform/orchestrator-api build && rtk vitest run apps/orchestrator-api`
Expected: tsc OK; testes passam.

- [ ] **Step 3: Commit**

```bash
rtk git add apps/orchestrator-api/src/index.ts
rtk git commit -m "feat(api): registra rota do artifact store (MAC-44)"
```

---

## Task 6: Build + suite + push

**Files:** nenhum (verificação final).

- [ ] **Step 1: Build completo**

Run: `rtk pnpm -r build`
Expected: todos os pacotes OK.

- [ ] **Step 2: Suite completa**

Run: `rtk pnpm test`
Expected: PASS — os ~91 atuais + 6 novos (artifacts data 3, route 3) ≈ 97. Sem regressão.

- [ ] **Step 3: Push**

```bash
rtk git push
```

- [ ] **Step 4: Nota de deploy/E2E (manual, fora daqui)**

- **Migration `0004`** aplicada pelo `deploy.sh orchestrator` (roda `db:deploy`). Runners NÃO mudam.
- Redeploy `orchestrator`.
- **E2E:** disparar/usar um run; depois `GET /runs/:id/artifacts` (lista plan/patch/review/validation/summary conforme o run avançou) e `GET /artifacts/:id` (content). Run parado em awaiting → só `plan`.

---

## Self-Review (preenchido)

**Cobertura do spec:**
- Tabela `artifacts` + enum + CASCADE + migration → Task 1. ✅
- Data layer (saveArtifacts só não-vazios / listArtifacts sem content / getArtifact) → Task 2. ✅
- Captura não-fatal no worker (plan job → plan; resume job → patch/review/validation/summary) + ajuste do tipo result → Task 3. ✅
- REST lista (sem content) + content por id (404) → Task 4. ✅
- Wiring → Task 5. ✅
- 5 kinds (plan/patch/review/validation/summary) → Task 1 enum + Task 3 captura. ✅

**Placeholders:** nenhum — todo passo tem código/comando. (A nota do import `desc` é uma instrução condicional concreta, não placeholder.)

**Consistência de tipos:** `ArtifactKind` derivado do enum (Task 2) bate com os kinds do schema (Task 1). `saveArtifacts(runId, parts)` (Task 2) chamado com os campos certos no worker (Task 3). `listArtifacts`/`getArtifact` (Task 2) usados nas rotas (Task 4) e mockados no teste com o mesmo shape. `artifactsRoute` (Task 4) registrado na Task 5.
