# Tool Registry (MAC-43) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao orchestrator um catálogo versionado de ferramentas (tabela `tools` com permissões declarativas — `risk` + `scopes`), como fundação pro Multi-Agent (MAC-47) atribuir/restringir tools por agente.

**Architecture:** Espelha o Agent Registry (MAC-42): tabela `tools` (key/version/description/risk/scopes/status) + enums `tool_risk`/`tool_status`, data layer puro+DB em `tools.ts`, REST `/tools` (leituras abertas, escritas com bearer), MCP read-only (`list_tools`/`get_tool`), seed idempotente das 5 tools do allowlist no boot. SEM `runs.tool_id` e SEM env nova — o registro é só metadado; enforcement/atribuição agente↔tool é MAC-47.

**Tech Stack:** TypeScript, Drizzle ORM (Postgres), Hono, Zod, MCP SDK, Vitest.

---

## File Structure

**Modificar:**
- `apps/orchestrator-api/src/db/schema.ts` — enums `tool_risk`/`tool_status`, tabela `tools`, tipos `Tool`/`NewTool`.
- `apps/orchestrator-api/src/app.ts` — registrar `toolsRoute` + padrões `/tools/:id` no uuidGuard.
- `apps/orchestrator-api/src/app.test.ts` — mock `./tools.js` + teste uuidGuard `/tools/:id`.
- `apps/orchestrator-api/src/worker.ts` — chamar `ensureDefaultTools()` no boot (não-fatal, junto do `ensureDefaultAgent`).
- `apps/mcp-server/src/client.ts` — métodos `listTools`/`getTool`.
- `apps/mcp-server/src/tools.ts` — tools `list_tools`/`get_tool`.
- `apps/mcp-server/src/client.test.ts` — casos das 2 novas rotas.
- `apps/mcp-server/README.md` — tabela de tools.

**Criar:**
- `apps/orchestrator-api/src/tools.ts` — data layer + helper puro `pickActiveTool` + zod.
- `apps/orchestrator-api/src/tools.test.ts` — `pickActiveTool` + zod.
- `apps/orchestrator-api/src/routes/tools.ts` — REST.
- `apps/orchestrator-api/src/routes/tools.test.ts` — rotas (mock do data layer).
- `apps/orchestrator-api/drizzle/0007_*.sql` — gerado pelo drizzle-kit.

**Nota:** o `apps/orchestrator-api/src/tools.ts` é NOVO (não existe). Há um `apps/mcp-server/src/tools.ts` (pacote diferente) — sem colisão.

---

## Task 1: Schema + migration

**Files:**
- Modify: `apps/orchestrator-api/src/db/schema.ts`
- Create: `apps/orchestrator-api/drizzle/0007_*.sql` (gerado)

- [ ] **Step 1: Adicionar enums `tool_risk`/`tool_status` e tabela `tools`**

No `schema.ts`, logo após o bloco da tabela `agents` (antes dos `export type`), inserir:

```ts
export const toolRisk = pgEnum('tool_risk', ['safe', 'caution', 'dangerous']);
export const toolStatus = pgEnum('tool_status', ['active', 'deprecated']);

/** Catálogo versionado de ferramentas (MAC-43). Metadado — permissões declarativas. */
export const tools = pgTable(
  'tools',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: text('key').notNull(),
    version: text('version').notNull(),
    description: text('description'),
    risk: toolRisk('risk').notNull().default('safe'),
    scopes: jsonb('scopes')
      .notNull()
      .default(sql`'[]'::jsonb`)
      .$type<string[]>(),
    status: toolStatus('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex('tools_key_version_uq').on(t.key, t.version)],
);
```

(Imports já presentes no arquivo: `jsonb`, `pgEnum`, `pgTable`, `text`, `timestamp`, `uniqueIndex`, `uuid` de `drizzle-orm/pg-core`; `sql` de `drizzle-orm`. Nenhuma mudança de import.)

- [ ] **Step 2: Exportar os tipos**

No bloco de `export type` no fim do arquivo, adicionar:

```ts
export type Tool = typeof tools.$inferSelect;
export type NewTool = typeof tools.$inferInsert;
```

- [ ] **Step 3: Gerar a migration**

Run: `rtk pnpm --filter @agent-platform/orchestrator-api db:generate`
Expected: cria `apps/orchestrator-api/drizzle/0007_*.sql` com `CREATE TYPE tool_risk`, `CREATE TYPE tool_status`, `CREATE TABLE tools`, e o unique index `tools_key_version_uq`. Sem `ALTER TABLE runs` (não há FK). Sem erro.

- [ ] **Step 4: Conferir o build de tipos**

Run: `rtk pnpm --filter @agent-platform/orchestrator-api build`
Expected: PASS (sem erro de tipos no schema).

- [ ] **Step 5: Commit**

```bash
rtk git add apps/orchestrator-api/src/db/schema.ts apps/orchestrator-api/drizzle/
rtk git commit -m "feat(tools): tabela tools + enums tool_risk/tool_status (MAC-43)"
```

---

## Task 2: Helper puro `pickActiveTool` + zod (TDD)

**Files:**
- Create: `apps/orchestrator-api/src/tools.ts`
- Create: `apps/orchestrator-api/src/tools.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

Criar `apps/orchestrator-api/src/tools.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Tool } from './db/schema.js';
import { createToolSchema, pickActiveTool } from './tools.js';

function tool(over: Partial<Tool>): Tool {
  return {
    id: 't',
    key: 'git',
    version: 'v1',
    description: null,
    risk: 'safe',
    scopes: [],
    status: 'active',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...over,
  } as Tool;
}

describe('pickActiveTool', () => {
  it('null quando não há nenhum active', () => {
    expect(pickActiveTool([tool({ status: 'deprecated' })])).toBeNull();
    expect(pickActiveTool([])).toBeNull();
  });

  it('ignora deprecated e escolhe a active mais recente', () => {
    const old = tool({ id: 'old', version: 'v1', createdAt: new Date('2026-01-01') });
    const dep = tool({ id: 'dep', version: 'v2', status: 'deprecated', createdAt: new Date('2026-03-01') });
    const fresh = tool({ id: 'fresh', version: 'v3', createdAt: new Date('2026-02-01') });
    expect(pickActiveTool([old, dep, fresh])?.id).toBe('fresh');
  });
});

describe('createToolSchema', () => {
  it('aceita payload válido com defaults (risk safe, scopes [])', () => {
    const out = createToolSchema.parse({ key: 'git', version: 'v1' });
    expect(out.risk).toBe('safe');
    expect(out.scopes).toEqual([]);
  });

  it('rejeita key/version vazios', () => {
    expect(createToolSchema.safeParse({ key: '', version: 'v1' }).success).toBe(false);
    expect(createToolSchema.safeParse({ key: 'git', version: '' }).success).toBe(false);
  });

  it('rejeita risk inválido', () => {
    expect(createToolSchema.safeParse({ key: 'git', version: 'v1', risk: 'lixo' }).success).toBe(false);
  });

  it('rejeita scopes que não é array de strings', () => {
    expect(createToolSchema.safeParse({ key: 'git', version: 'v1', scopes: 'x' }).success).toBe(false);
    expect(createToolSchema.safeParse({ key: 'git', version: 'v1', scopes: [1] }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar pra ver falhar**

Run: `rtk pnpm exec vitest run apps/orchestrator-api/src/tools.test.ts`
Expected: FAIL (`tools.js` não existe). NOTA: NÃO usar `pnpm --filter ... test` (sai 0 silencioso, sem script `test`); usar `vitest run <path>`.

- [ ] **Step 3: Criar `tools.ts` com o helper + zod (sem as funções de DB ainda)**

Criar `apps/orchestrator-api/src/tools.ts`:

```ts
import { z } from 'zod';
import type { Tool } from './db/schema.js';

/** Schema de criação de tool via REST. */
export const createToolSchema = z.object({
  key: z.string().min(1),
  version: z.string().min(1),
  description: z.string().optional(),
  risk: z.enum(['safe', 'caution', 'dangerous']).default('safe'),
  scopes: z.array(z.string()).default([]),
});

export type CreateToolInput = z.infer<typeof createToolSchema>;

/**
 * Escolhe a tool "vigente" de um conjunto de versões de uma key: a active de
 * created_at mais recente. `null` se nenhuma active. Pura — testável sem DB.
 */
export function pickActiveTool(rows: Tool[]): Tool | null {
  const active = rows.filter((r) => r.status === 'active');
  if (active.length === 0) return null;
  return active.reduce((a, b) => (b.createdAt > a.createdAt ? b : a));
}
```

- [ ] **Step 4: Rodar pra ver passar**

Run: `rtk pnpm exec vitest run apps/orchestrator-api/src/tools.test.ts`
Expected: PASS (6 testes).

- [ ] **Step 5: Commit**

```bash
rtk git add apps/orchestrator-api/src/tools.ts apps/orchestrator-api/src/tools.test.ts
rtk git commit -m "feat(tools): pickActiveTool + zod de criação (MAC-43)"
```

---

## Task 3: Data layer (DB) em `tools.ts`

**Files:**
- Modify: `apps/orchestrator-api/src/tools.ts`

- [ ] **Step 1: Trocar o cabeçalho de imports de `tools.ts`**

Substituir a linha de imports atual:
```ts
import { z } from 'zod';
import type { Tool } from './db/schema.js';
```
por:
```ts
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from './db/client.js';
import type { Tool, NewTool } from './db/schema.js';

export type ToolRisk = (typeof schema.toolRisk.enumValues)[number];
export type ToolStatus = (typeof schema.toolStatus.enumValues)[number];
```
(Manter `createToolSchema`/`CreateToolInput`/`pickActiveTool` exatamente como estão.)

- [ ] **Step 2: Adicionar as funções de DB no fim de `tools.ts`**

```ts
/** Erro de chave duplicada (key+version) — mapeado para 409 na rota. */
export class ToolExistsError extends Error {
  constructor() {
    super('tool already exists');
    this.name = 'ToolExistsError';
  }
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === '23505'
  );
}

/** Lista tools (catálogo / descoberta), mais recentes primeiro. */
export async function listTools(filter?: {
  key?: string;
  status?: ToolStatus;
  risk?: ToolRisk;
}): Promise<Tool[]> {
  const conds = [];
  if (filter?.key) conds.push(eq(schema.tools.key, filter.key));
  if (filter?.status) conds.push(eq(schema.tools.status, filter.status));
  if (filter?.risk) conds.push(eq(schema.tools.risk, filter.risk));
  return db
    .select()
    .from(schema.tools)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(schema.tools.createdAt));
}

/** Uma tool pelo id (null se não existe). */
export async function getTool(id: string): Promise<Tool | null> {
  const [row] = await db.select().from(schema.tools).where(eq(schema.tools.id, id)).limit(1);
  return row ?? null;
}

/** Registra uma tool/versão. Lança ToolExistsError em (key,version) duplicado. */
export async function createTool(parts: CreateToolInput): Promise<Tool> {
  try {
    const [row] = await db
      .insert(schema.tools)
      .values({
        key: parts.key,
        version: parts.version,
        description: parts.description,
        risk: parts.risk,
        scopes: parts.scopes,
      } satisfies NewTool)
      .returning();
    // biome-ignore lint/style/noNonNullAssertion: insert ... returning sempre retorna a linha
    return row!;
  } catch (err) {
    if (isUniqueViolation(err)) throw new ToolExistsError();
    throw err;
  }
}

/** Muda o status (ex. deprecate). null se o id não existe. */
export async function updateToolStatus(id: string, status: ToolStatus): Promise<Tool | null> {
  const [row] = await db
    .update(schema.tools)
    .set({ status })
    .where(eq(schema.tools.id, id))
    .returning();
  return row ?? null;
}

/** Tools default = as 5 do allowlist do runner (AGENT_COMMAND_ALLOWLIST). */
const DEFAULT_TOOLS: NewTool[] = [
  { key: 'git', version: 'v1', risk: 'caution', scopes: ['vcs', 'fs_write'], description: 'Controle de versão (clone/commit/push).' },
  { key: 'pnpm', version: 'v1', risk: 'dangerous', scopes: ['network', 'exec', 'fs_write'], description: 'Gerenciador de pacotes (install/build/test).' },
  { key: 'npm', version: 'v1', risk: 'dangerous', scopes: ['network', 'exec', 'fs_write'], description: 'Gerenciador de pacotes Node.' },
  { key: 'npx', version: 'v1', risk: 'dangerous', scopes: ['network', 'exec', 'fs_write'], description: 'Executor de binários de pacote.' },
  { key: 'node', version: 'v1', risk: 'caution', scopes: ['exec'], description: 'Runtime JavaScript.' },
];

/** Insere as tools default se não existirem. Idempotente. */
export async function ensureDefaultTools(): Promise<void> {
  await db
    .insert(schema.tools)
    .values(DEFAULT_TOOLS)
    .onConflictDoNothing({ target: [schema.tools.key, schema.tools.version] });
}
```

- [ ] **Step 3: Conferir build + testes do helper**

Run: `rtk pnpm --filter @agent-platform/orchestrator-api build`
Expected: PASS (sem erro de tipos — atenção ao `satisfies NewTool` em `createTool` e ao array `DEFAULT_TOOLS`).
Run: `rtk pnpm exec vitest run apps/orchestrator-api/src/tools.test.ts`
Expected: PASS (os 6 testes do helper/zod seguem verdes; funções de DB não têm teste unitário — cobertas via rotas na Task 4).

- [ ] **Step 4: Commit**

```bash
rtk git add apps/orchestrator-api/src/tools.ts
rtk git commit -m "feat(tools): data layer (list/get/create/updateStatus/seed) (MAC-43)"
```

---

## Task 4: REST `/tools` + registro no app (TDD)

**Files:**
- Create: `apps/orchestrator-api/src/routes/tools.ts`
- Create: `apps/orchestrator-api/src/routes/tools.test.ts`
- Modify: `apps/orchestrator-api/src/app.ts`
- Modify: `apps/orchestrator-api/src/app.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

Criar `apps/orchestrator-api/src/routes/tools.test.ts`:

```ts
import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToolExistsError, createTool, getTool, listTools, updateToolStatus } from '../tools.js';
import { toolsRoute } from './tools.js';

vi.mock('../tools.js', async (orig) => ({
  ...(await orig<typeof import('../tools.js')>()),
  listTools: vi.fn(),
  getTool: vi.fn(),
  createTool: vi.fn(),
  updateToolStatus: vi.fn(),
}));

vi.mock('../env.js', () => ({ env: { RUNNER_AUTH_TOKEN: 'secret' } }));

const app = new Hono();
app.route('/', toolsRoute);

const auth = { authorization: 'Bearer secret' };

beforeEach(() => vi.clearAllMocks());

describe('GET /tools', () => {
  it('lista (200)', async () => {
    vi.mocked(listTools).mockResolvedValue([{ id: 't1' }] as never);
    const res = await app.request('/tools');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { tools: unknown[] };
    expect(body.tools).toHaveLength(1);
  });

  it('passa filtros key/status/risk', async () => {
    vi.mocked(listTools).mockResolvedValue([] as never);
    await app.request('/tools?key=git&status=active&risk=caution');
    expect(listTools).toHaveBeenCalledWith({ key: 'git', status: 'active', risk: 'caution' });
  });

  it('400 com status inválido', async () => {
    const res = await app.request('/tools?status=garbage');
    expect(res.status).toBe(400);
    expect(listTools).not.toHaveBeenCalled();
  });

  it('400 com risk inválido', async () => {
    const res = await app.request('/tools?risk=garbage');
    expect(res.status).toBe(400);
    expect(listTools).not.toHaveBeenCalled();
  });
});

describe('GET /tools/:id', () => {
  it('200 quando existe', async () => {
    vi.mocked(getTool).mockResolvedValue({ id: 't1' } as never);
    const res = await app.request('/tools/t1');
    expect(res.status).toBe(200);
  });

  it('404 quando não existe', async () => {
    vi.mocked(getTool).mockResolvedValue(null);
    const res = await app.request('/tools/missing');
    expect(res.status).toBe(404);
  });
});

describe('POST /tools', () => {
  it('401 sem bearer', async () => {
    const res = await app.request('/tools', { method: 'POST', body: '{}' });
    expect(res.status).toBe(401);
    expect(createTool).not.toHaveBeenCalled();
  });

  it('201 com payload válido', async () => {
    vi.mocked(createTool).mockResolvedValue({ id: 't1', key: 'k', version: 'v1' } as never);
    const res = await app.request('/tools', {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ key: 'k', version: 'v1', risk: 'safe', scopes: ['exec'] }),
    });
    expect(res.status).toBe(201);
    expect(createTool).toHaveBeenCalledWith({ key: 'k', version: 'v1', risk: 'safe', scopes: ['exec'] });
  });

  it('400 com payload inválido', async () => {
    const res = await app.request('/tools', {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ key: '', version: 'v1' }),
    });
    expect(res.status).toBe(400);
    expect(createTool).not.toHaveBeenCalled();
  });

  it('409 em (key,version) duplicado', async () => {
    vi.mocked(createTool).mockRejectedValue(new ToolExistsError());
    const res = await app.request('/tools', {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ key: 'k', version: 'v1' }),
    });
    expect(res.status).toBe(409);
  });
});

describe('PATCH /tools/:id', () => {
  it('401 sem bearer', async () => {
    const res = await app.request('/tools/t1', { method: 'PATCH', body: '{}' });
    expect(res.status).toBe(401);
  });

  it('200 muda status', async () => {
    vi.mocked(updateToolStatus).mockResolvedValue({ id: 't1', status: 'deprecated' } as never);
    const res = await app.request('/tools/t1', {
      method: 'PATCH',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'deprecated' }),
    });
    expect(res.status).toBe(200);
    expect(updateToolStatus).toHaveBeenCalledWith('t1', 'deprecated');
  });

  it('400 com status inválido', async () => {
    const res = await app.request('/tools/t1', {
      method: 'PATCH',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'lixo' }),
    });
    expect(res.status).toBe(400);
    expect(updateToolStatus).not.toHaveBeenCalled();
  });

  it('404 quando não existe', async () => {
    vi.mocked(updateToolStatus).mockResolvedValue(null);
    const res = await app.request('/tools/t1', {
      method: 'PATCH',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'active' }),
    });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Rodar pra ver falhar**

Run: `rtk pnpm exec vitest run apps/orchestrator-api/src/routes/tools.test.ts`
Expected: FAIL (`./tools.js` rota não existe).

- [ ] **Step 3: Criar a rota**

Criar `apps/orchestrator-api/src/routes/tools.ts`:

```ts
import { type Context, Hono, type Next } from 'hono';
import { z } from 'zod';
import { env } from '../env.js';
import { logger } from '../logger.js';
import {
  ToolExistsError,
  createTool,
  createToolSchema,
  getTool,
  listTools,
  updateToolStatus,
} from '../tools.js';

export const toolsRoute = new Hono();

async function requireAuth(c: Context, next: Next) {
  if (c.req.header('authorization') !== `Bearer ${env.RUNNER_AUTH_TOKEN}`) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  await next();
}

// Escritas exigem bearer; leituras são abertas (rede interna, igual agents/runs).
toolsRoute.post('/tools', requireAuth);
toolsRoute.patch('/tools/:id', requireAuth);

const statusSchema = z.enum(['active', 'deprecated']).optional();
const riskSchema = z.enum(['safe', 'caution', 'dangerous']).optional();
const patchSchema = z.object({ status: z.enum(['active', 'deprecated']) });

/** Lista o catálogo (descoberta). Filtra por key/status/risk. */
toolsRoute.get('/tools', async (c) => {
  const key = c.req.query('key');
  const status = statusSchema.safeParse(c.req.query('status') ?? undefined);
  if (!status.success) return c.json({ error: 'status inválido' }, 400);
  const risk = riskSchema.safeParse(c.req.query('risk') ?? undefined);
  if (!risk.success) return c.json({ error: 'risk inválido' }, 400);
  return c.json({ tools: await listTools({ key, status: status.data, risk: risk.data }) });
});

/** Detalhe de uma tool. */
toolsRoute.get('/tools/:id', async (c) => {
  const row = await getTool(c.req.param('id'));
  if (!row) return c.json({ error: 'not found' }, 404);
  return c.json(row);
});

/** Registra uma tool/versão. */
toolsRoute.post('/tools', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = createToolSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'payload inválido', issues: parsed.error.issues }, 400);
  try {
    const row = await createTool(parsed.data);
    return c.json(row, 201);
  } catch (err) {
    if (err instanceof ToolExistsError) return c.json({ error: 'tool already exists' }, 409);
    logger.error({ err }, 'failed to create tool');
    return c.json({ error: 'internal server error' }, 500);
  }
});

/** Muda o status de uma tool (ex. deprecate). */
toolsRoute.patch('/tools/:id', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'status inválido' }, 400);
  const row = await updateToolStatus(c.req.param('id'), parsed.data.status);
  if (!row) return c.json({ error: 'not found' }, 404);
  return c.json(row);
});
```

Nota: `requireAuth` registrado via `.post('/tools', requireAuth)` / `.patch('/tools/:id', requireAuth)` ANTES dos handlers reais do mesmo path — o Hono encadeia middlewares por rota na ordem de registro, então o guard roda antes do handler (mesmo padrão de `routes/agents.ts`).

- [ ] **Step 4: Registrar a rota + uuidGuard no `app.ts`**

Em `app.ts`: import (junto dos outros `routes/*`):
```ts
import { toolsRoute } from './routes/tools.js';
```
Adicionar `/tools/:id` e `/tools/:id/*` à lista de padrões do `uuidGuard` (após `/agents/:id/*`):
```ts
    '/agents/:id',
    '/agents/:id/*',
    '/tools/:id',
    '/tools/:id/*',
```
Registrar a rota (junto dos outros `app.route`):
```ts
  app.route('/', toolsRoute);
```

- [ ] **Step 5: Rodar pra ver passar**

Run: `rtk pnpm exec vitest run apps/orchestrator-api/src/routes/tools.test.ts`
Expected: PASS (14 testes).

- [ ] **Step 6: Teste do uuidGuard para `/tools/:id` em `app.test.ts`**

Em `apps/orchestrator-api/src/app.test.ts`, adicionar o mock (após os mocks existentes, incluindo o de `./agents.js`):
```ts
vi.mock('./tools.js', async (orig) => ({
  ...(await orig<typeof import('./tools.js')>()),
  listTools: vi.fn(),
  getTool: vi.fn(),
  createTool: vi.fn(),
  updateToolStatus: vi.fn(),
}));
```
E um caso dentro do `describe('guard de uuid (MAC-64)')`:
```ts
  it('404 para :id não-uuid em /tools/:id', async () => {
    const res = await app.request('/tools/nao-uuid');
    expect(res.status).toBe(404);
  });
```

- [ ] **Step 7: Rodar a suíte do app**

Run: `rtk pnpm exec vitest run apps/orchestrator-api/src/app.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
rtk git add apps/orchestrator-api/src/routes/tools.ts apps/orchestrator-api/src/routes/tools.test.ts apps/orchestrator-api/src/app.ts apps/orchestrator-api/src/app.test.ts
rtk git commit -m "feat(tools): REST /tools (CRUD) + uuidGuard + registro no app (MAC-43)"
```

---

## Task 5: Seed idempotente no boot

**Files:**
- Modify: `apps/orchestrator-api/src/worker.ts`

- [ ] **Step 1: Importar `ensureDefaultTools`**

Em `worker.ts`, a linha do import do MAC-42 é `import { ensureDefaultAgent } from './agents.js';`. Adicionar logo abaixo:
```ts
import { ensureDefaultTools } from './tools.js';
```

- [ ] **Step 2: Chamar no boot, junto do seed de agents**

Em `startAgentWorker`, o bloco do MAC-42 é:
```ts
  // MAC-42: garante o agente default no catálogo (idempotente). Não-fatal.
  try {
    await ensureDefaultAgent();
  } catch (err) {
    logger.warn({ err }, 'ensureDefaultAgent falhou (seguindo sem seed)');
  }
```
Adicionar logo após esse bloco:
```ts
  // MAC-43: garante as tools default no catálogo (idempotente). Não-fatal.
  try {
    await ensureDefaultTools();
  } catch (err) {
    logger.warn({ err }, 'ensureDefaultTools falhou (seguindo sem seed)');
  }
```

- [ ] **Step 3: Conferir build**

Run: `rtk pnpm --filter @agent-platform/orchestrator-api build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
rtk git add apps/orchestrator-api/src/worker.ts
rtk git commit -m "feat(tools): seed idempotente das tools default no boot (MAC-43)"
```

---

## Task 6: MCP tools `list_tools` / `get_tool` (TDD)

**Files:**
- Modify: `apps/mcp-server/src/client.ts`
- Modify: `apps/mcp-server/src/client.test.ts`
- Modify: `apps/mcp-server/src/tools.ts`
- Modify: `apps/mcp-server/README.md`

- [ ] **Step 1: Adicionar os casos de teste ao client.test.ts**

Em `apps/mcp-server/src/client.test.ts`, no `it('mapeia cada método para o verbo + rota corretos', ...)`, adicionar ao array `cases`:
```ts
      [(c) => c.listTools(), 'GET', 'http://orch:3000/tools'],
      [(c) => c.getTool('t1'), 'GET', 'http://orch:3000/tools/t1'],
```
E um teste novo de filtros (após o de `listAgents`):
```ts
  it('listTools monta key/status/risk na query', async () => {
    const f = mockFetch(200, { tools: [] });
    await createClient(cfg(f)).listTools({ key: 'git', status: 'active', risk: 'caution' });
    const call = (f as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0];
    expect(call[0]).toBe('http://orch:3000/tools?key=git&status=active&risk=caution');
  });
```

- [ ] **Step 2: Rodar pra ver falhar**

Run: `rtk pnpm exec vitest run apps/mcp-server/src/client.test.ts`
Expected: FAIL (`listTools`/`getTool` não existem no client).

- [ ] **Step 3: Adicionar os métodos ao client**

Em `client.ts`, na interface `OrchestratorClient` (após `getAgent`):
```ts
  listTools(filter?: { key?: string; status?: string; risk?: string }): Promise<unknown>;
  getTool(id: string): Promise<unknown>;
```
E no objeto retornado por `createClient` (após `getAgent`):
```ts
    listTools: (filter) =>
      call('GET', `/tools${query({ key: filter?.key, status: filter?.status, risk: filter?.risk })}`),
    getTool: (toolId) => call('GET', `/tools/${id(toolId)}`),
```

- [ ] **Step 4: Rodar pra ver passar**

Run: `rtk pnpm exec vitest run apps/mcp-server/src/client.test.ts`
Expected: PASS.

- [ ] **Step 5: Registrar as tools**

Em `apps/mcp-server/src/tools.ts`, dentro de `registerTools` (junto das outras tools de leitura, ex. após `get_agent`):
```ts
  server.tool(
    'list_tools',
    'Lista as ferramentas registradas (catálogo). Filtra por key, status e/ou risk.',
    {
      key: z.string().optional(),
      status: z.enum(['active', 'deprecated']).optional(),
      risk: z.enum(['safe', 'caution', 'dangerous']).optional(),
    },
    ({ key, status, risk }) => asTool(() => client.listTools({ key, status, risk })),
  );

  server.tool('get_tool', 'Detalha uma ferramenta registrada pelo id.', { id: z.string() }, ({ id }) =>
    asTool(() => client.getTool(id)),
  );
```

- [ ] **Step 6: Atualizar o README do mcp-server**

Em `apps/mcp-server/README.md`, na tabela/lista de tools de leitura, adicionar `list_tools` (→ `GET /tools`) e `get_tool` (→ `GET /tools/:id`), seguindo o formato das linhas existentes (ex. as do MAC-42: `list_agents`/`get_agent`).

- [ ] **Step 7: Build + testes do mcp-server**

Run: `rtk pnpm --filter @agent-platform/mcp-server build && rtk pnpm exec vitest run apps/mcp-server/src/client.test.ts`
Expected: PASS.

- [ ] **Step 8: Suíte completa (sanity)**

Run: `rtk pnpm -r build && rtk pnpm test`
Expected: PASS (todos os testes; ~124 + os novos do MAC-43: pickActiveTool 2, createToolSchema 4, rotas 14, client 3 — ajustar contagem ao real).

- [ ] **Step 9: Commit**

```bash
rtk git add apps/mcp-server/src/client.ts apps/mcp-server/src/client.test.ts apps/mcp-server/src/tools.ts apps/mcp-server/README.md
rtk git commit -m "feat(tools): tools MCP list_tools/get_tool (MAC-43)"
```

---

## Deploy + E2E (pós-implementação, rodado pelo usuário)

> Não é tarefa de código. Pode agrupar com o deploy do MAC-42 (ambos só orchestrator).

1. **Deploy (host 192.168.0.10):**
   ```bash
   cd ~/agent-platform && git pull && bash infra/deploy/deploy.sh orchestrator
   ```
   Aplica as migrations pendentes (0006 do MAC-42 + 0007 do MAC-43) + sobe a API com os seeds no boot. Runners NÃO mudam.

2. **Túnel REST (laptop):** `ssh -fN -L 3000:10.10.0.11:3000 root@192.168.0.10`

3. **Verificar:**
   - `curl http://localhost:3000/tools` → lista as 5 tools (git/pnpm/npm/npx/node) com risk/scopes.
   - `curl 'http://localhost:3000/tools?risk=dangerous'` → pnpm/npm/npx.
   - `curl 'http://localhost:3000/tools?status=garbage'` → 400.
   - `curl -X POST -H "authorization: Bearer $RUNNER_AUTH_TOKEN" -H 'content-type: application/json' -d '{"key":"x","version":"v1"}' http://localhost:3000/tools` → 201; repetir → 409.
   - `curl http://localhost:3000/tools/nao-uuid` → 404.
   - MCP: `list_tools` no Claude Code (zero-túnel via Proxmox) retorna o catálogo.

4. **Linear:** comentar progresso na MAC-43 + mover pra Done.

---

## Self-Review

**Spec coverage:**
- Dados (enums + tabela `tools` + unique key,version, SEM runs FK) → Task 1. ✅
- Data layer (list/get/create/updateStatus/ensureDefaultTools + pickActiveTool puro + zod com risk/scopes) → Tasks 2–3. ✅
- REST (GET aberto + filtros key/status/risk validados, POST/PATCH bearer, 409/400/404, uuidGuard) → Task 4. ✅
- MCP read-only (list_tools/get_tool + README) → Task 6. ✅
- Seed idempotente das 5 tools no boot → Tasks 3+5. ✅
- Error handling (409/400/404/uuid/seed não-fatal) → Tasks 3,4,5. ✅
- Sem env nova → confirmado (nenhuma task toca env.ts/.env.example/compose). ✅
- Testes (pickActiveTool ≥2, zod ≥3, rotas, uuid) → Tasks 2,4. ✅

**Placeholder scan:** nenhum TODO/TBD/"add error handling" genérico — todo passo tem código real.

**Type consistency:** `Tool`/`NewTool` (schema), `ToolRisk`/`ToolStatus` (`tools.ts`), `createToolSchema`/`CreateToolInput`, `ToolExistsError`, `pickActiveTool`, `listTools({key,status,risk})`, `getTool(id)`, `createTool(input)`, `updateToolStatus(id,status)`, `ensureDefaultTools()` — nomes batem entre data layer, rota, MCP client e testes. Filtros key/status/risk consistentes entre `listTools`, rota e MCP.
