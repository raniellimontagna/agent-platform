# Agent Registry (MAC-42) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao orchestrator um catálogo versionado de tipos de agente (tabela `agents`, capacidades, status) e gravar qual agente rodou cada run (`runs.agent_id`), como fundação pro Multi-Agent (MAC-47).

**Architecture:** Tabela `agents` (key/version/capabilities/status) + enum `agent_status` + coluna `runs.agent_id` (FK ON DELETE SET NULL). Data layer puro+DB em `agents.ts`, REST `/agents` (leituras abertas, escritas com bearer), MCP read-only (`list_agents`/`get_agent`), seed idempotente `coder-agent v1` no boot, e wiring do `agent_id` na criação do run. O registro é só metadado+FK — não executa nada; o grafo continua em código.

**Tech Stack:** TypeScript, Drizzle ORM (Postgres), Hono, Zod, BullMQ, MCP SDK, Vitest.

---

## File Structure

**Modificar:**
- `apps/orchestrator-api/src/db/schema.ts` — enum `agent_status`, tabela `agents`, coluna `runs.agent_id`, tipos `Agent`/`NewAgent`.
- `apps/orchestrator-api/src/app.ts` — registrar `agentsRoute` + padrões `/agents/:id` no uuidGuard.
- `apps/orchestrator-api/src/runs.ts` — `NewRunInput.agentId` + resolver agente default no `createRun`.
- `apps/orchestrator-api/src/worker.ts` — chamar `ensureDefaultAgent()` no boot (não-fatal).
- `apps/orchestrator-api/src/env.ts` — `AGENT_KEY`.
- `apps/orchestrator-api/.env.example` — `AGENT_KEY`.
- `infra/compose/orchestrator/docker-compose.yml` — `AGENT_KEY` na lista `environment:`.
- `apps/mcp-server/src/client.ts` — métodos `listAgents`/`getAgent`.
- `apps/mcp-server/src/tools.ts` — tools `list_agents`/`get_agent`.
- `apps/mcp-server/src/client.test.ts` — casos das 2 novas rotas.
- `apps/mcp-server/README.md` — tabela de tools.

**Criar:**
- `apps/orchestrator-api/src/agents.ts` — data layer + helper puro `pickActiveAgent` + zod.
- `apps/orchestrator-api/src/agents.test.ts` — `pickActiveAgent` + zod.
- `apps/orchestrator-api/src/routes/agents.ts` — REST.
- `apps/orchestrator-api/src/routes/agents.test.ts` — rotas (mock do data layer).
- `apps/orchestrator-api/drizzle/0006_*.sql` — gerado pelo drizzle-kit.

---

## Task 1: Schema + migration

**Files:**
- Modify: `apps/orchestrator-api/src/db/schema.ts`
- Create: `apps/orchestrator-api/drizzle/0006_*.sql` (gerado)

- [ ] **Step 1: Adicionar enum `agent_status` e tabela `agents`**

No `schema.ts`, logo após o bloco da tabela `schedules` (antes dos `export type`), inserir:

```ts
export const agentStatus = pgEnum('agent_status', ['active', 'deprecated']);

/** Catálogo versionado de tipos de agente (MAC-42). Metadado — não executa nada. */
export const agents = pgTable(
  'agents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: text('key').notNull(),
    version: text('version').notNull(),
    description: text('description'),
    capabilities: jsonb('capabilities')
      .notNull()
      .default(sql`'[]'::jsonb`)
      .$type<string[]>(),
    status: agentStatus('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex('agents_key_version_uq').on(t.key, t.version)],
);
```

- [ ] **Step 2: Adicionar coluna `agentId` na tabela `runs`**

Em `runs` (objeto de colunas, junto de `scheduleId`), adicionar:

```ts
  agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
```

A referência `() => agents.id` é lazy (igual `scheduleId` → `schedules`, que também é declarada depois), então a ordem de declaração não quebra.

- [ ] **Step 3: Exportar os tipos**

No bloco de `export type` no fim do arquivo, adicionar:

```ts
export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;
```

- [ ] **Step 4: Gerar a migration**

Run: `rtk pnpm --filter @agent-platform/orchestrator-api db:generate`
Expected: cria `apps/orchestrator-api/drizzle/0006_*.sql` com `CREATE TYPE agent_status`, `CREATE TABLE agents`, `ALTER TABLE runs ADD COLUMN agent_id`, e o unique index `agents_key_version_uq`. Sem erro.

- [ ] **Step 5: Conferir o build de tipos**

Run: `rtk pnpm --filter @agent-platform/orchestrator-api build`
Expected: PASS (sem erro de tipos no schema).

- [ ] **Step 6: Commit**

```bash
rtk git add apps/orchestrator-api/src/db/schema.ts apps/orchestrator-api/drizzle/
rtk git commit -m "feat(agents): tabela agents + runs.agent_id (MAC-42)"
```

---

## Task 2: Helper puro `pickActiveAgent` + zod (TDD)

**Files:**
- Create: `apps/orchestrator-api/src/agents.ts`
- Create: `apps/orchestrator-api/src/agents.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

Criar `apps/orchestrator-api/src/agents.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Agent } from './db/schema.js';
import { createAgentSchema, pickActiveAgent } from './agents.js';

function agent(over: Partial<Agent>): Agent {
  return {
    id: 'a',
    key: 'coder-agent',
    version: 'v1',
    description: null,
    capabilities: [],
    status: 'active',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...over,
  } as Agent;
}

describe('pickActiveAgent', () => {
  it('null quando não há nenhum active', () => {
    expect(pickActiveAgent([agent({ status: 'deprecated' })])).toBeNull();
    expect(pickActiveAgent([])).toBeNull();
  });

  it('ignora deprecated e escolhe a active mais recente', () => {
    const old = agent({ id: 'old', version: 'v1', createdAt: new Date('2026-01-01') });
    const dep = agent({ id: 'dep', version: 'v2', status: 'deprecated', createdAt: new Date('2026-03-01') });
    const fresh = agent({ id: 'fresh', version: 'v3', createdAt: new Date('2026-02-01') });
    expect(pickActiveAgent([old, dep, fresh])?.id).toBe('fresh');
  });
});

describe('createAgentSchema', () => {
  it('aceita payload válido e default capabilities []', () => {
    const out = createAgentSchema.parse({ key: 'k', version: 'v1' });
    expect(out.capabilities).toEqual([]);
  });

  it('rejeita key/version vazios', () => {
    expect(createAgentSchema.safeParse({ key: '', version: 'v1' }).success).toBe(false);
    expect(createAgentSchema.safeParse({ key: 'k', version: '' }).success).toBe(false);
  });

  it('rejeita capabilities que não é array de strings', () => {
    expect(createAgentSchema.safeParse({ key: 'k', version: 'v1', capabilities: 'x' }).success).toBe(false);
    expect(createAgentSchema.safeParse({ key: 'k', version: 'v1', capabilities: [1] }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar pra ver falhar**

Run: `rtk pnpm --filter @agent-platform/orchestrator-api test -- agents.test`
Expected: FAIL (`agents.js` não existe / `pickActiveAgent` undefined).

- [ ] **Step 3: Criar `agents.ts` com o helper + zod (sem as funções de DB ainda)**

Criar `apps/orchestrator-api/src/agents.ts`:

```ts
import { z } from 'zod';
import type { Agent } from './db/schema.js';

/** Schema de criação de agente via REST. */
export const createAgentSchema = z.object({
  key: z.string().min(1),
  version: z.string().min(1),
  description: z.string().optional(),
  capabilities: z.array(z.string()).default([]),
});

export type CreateAgentInput = z.infer<typeof createAgentSchema>;

/**
 * Escolhe o agente "vigente" de um conjunto de versões de uma key: a active de
 * created_at mais recente. `null` se nenhuma active. Puro — testável sem DB.
 */
export function pickActiveAgent(rows: Agent[]): Agent | null {
  const active = rows.filter((r) => r.status === 'active');
  if (active.length === 0) return null;
  return active.reduce((a, b) => (b.createdAt > a.createdAt ? b : a));
}
```

- [ ] **Step 4: Rodar pra ver passar**

Run: `rtk pnpm --filter @agent-platform/orchestrator-api test -- agents.test`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
rtk git add apps/orchestrator-api/src/agents.ts apps/orchestrator-api/src/agents.test.ts
rtk git commit -m "feat(agents): pickActiveAgent + zod de criação (MAC-42)"
```

---

## Task 3: Data layer (DB) em `agents.ts`

**Files:**
- Modify: `apps/orchestrator-api/src/agents.ts`
- Modify: `apps/orchestrator-api/src/env.ts` (necessário pro `resolveDefaultAgent`/seed lerem `AGENT_KEY`)

- [ ] **Step 1: Adicionar `AGENT_KEY` ao env**

Em `env.ts`, dentro do `envSchema` (perto de `SCHEDULER_TZ`), adicionar:

```ts
  // Agent Registry (MAC-42): key do agente default (catálogo/seed/resolução).
  AGENT_KEY: z.string().default('coder-agent'),
```

- [ ] **Step 2: Adicionar imports e tipo no topo de `agents.ts`**

Trocar o cabeçalho de imports de `agents.ts` por:

```ts
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from './db/client.js';
import type { Agent, NewAgent } from './db/schema.js';
import { env } from './env.js';

export type AgentStatus = (typeof schema.agentStatus.enumValues)[number];
```

(Manter o `createAgentSchema`/`pickActiveAgent` já existentes. Remover a linha `import type { Agent } from './db/schema.js';` antiga — agora coberta pelo import acima.)

- [ ] **Step 3: Adicionar as funções de DB no fim de `agents.ts`**

```ts
/** Erro de chave duplicada (key+version) — mapeado para 409 na rota. */
export class AgentExistsError extends Error {
  constructor() {
    super('agent already exists');
    this.name = 'AgentExistsError';
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

/** Lista agentes (catálogo / descoberta), mais recentes primeiro. */
export async function listAgents(filter?: {
  key?: string;
  status?: AgentStatus;
}): Promise<Agent[]> {
  const conds = [];
  if (filter?.key) conds.push(eq(schema.agents.key, filter.key));
  if (filter?.status) conds.push(eq(schema.agents.status, filter.status));
  return db
    .select()
    .from(schema.agents)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(schema.agents.createdAt));
}

/** Um agente pelo id (null se não existe). */
export async function getAgent(id: string): Promise<Agent | null> {
  const [row] = await db.select().from(schema.agents).where(eq(schema.agents.id, id)).limit(1);
  return row ?? null;
}

/** Registra um agente/versão. Lança AgentExistsError em (key,version) duplicado. */
export async function createAgent(parts: CreateAgentInput): Promise<Agent> {
  try {
    const [row] = await db
      .insert(schema.agents)
      .values({
        key: parts.key,
        version: parts.version,
        description: parts.description,
        capabilities: parts.capabilities,
      } satisfies NewAgent)
      .returning();
    // biome-ignore lint/style/noNonNullAssertion: insert ... returning sempre retorna a linha
    return row!;
  } catch (err) {
    if (isUniqueViolation(err)) throw new AgentExistsError();
    throw err;
  }
}

/** Muda o status (ex. deprecate). null se o id não existe. */
export async function updateAgentStatus(id: string, status: AgentStatus): Promise<Agent | null> {
  const [row] = await db
    .update(schema.agents)
    .set({ status })
    .where(eq(schema.agents.id, id))
    .returning();
  return row ?? null;
}

/** Insere o agente default `coder-agent v1` se não existir. Idempotente. */
export async function ensureDefaultAgent(): Promise<void> {
  await db
    .insert(schema.agents)
    .values({
      key: env.AGENT_KEY,
      version: 'v1',
      description:
        'Pipeline LangGraph atual (planner→coder→reviewing→revising→pr→report)',
      capabilities: ['typescript', 'node', 'hono', 'feature', 'bugfix', 'refactor', 'single-repo'],
    })
    .onConflictDoNothing({ target: [schema.agents.key, schema.agents.version] });
}

/** Agente vigente da key default (env.AGENT_KEY): active mais recente, ou null. */
export async function resolveDefaultAgent(): Promise<Agent | null> {
  const rows = await listAgents({ key: env.AGENT_KEY });
  return pickActiveAgent(rows);
}
```

- [ ] **Step 4: Conferir build + testes existentes**

Run: `rtk pnpm --filter @agent-platform/orchestrator-api build && rtk pnpm --filter @agent-platform/orchestrator-api test -- agents.test`
Expected: build PASS; testes do helper/zod seguem PASS (as funções de DB não têm teste unitário — cobertas via rotas na Task 5).

- [ ] **Step 5: Commit**

```bash
rtk git add apps/orchestrator-api/src/agents.ts apps/orchestrator-api/src/env.ts
rtk git commit -m "feat(agents): data layer (list/get/create/updateStatus/seed/resolve) + AGENT_KEY (MAC-42)"
```

---

## Task 4: Wire `agent_id` na criação do run

**Files:**
- Modify: `apps/orchestrator-api/src/runs.ts:28-53`

- [ ] **Step 1: Importar `resolveDefaultAgent` no topo de `runs.ts`**

Adicionar após os imports existentes:

```ts
import { resolveDefaultAgent } from './agents.js';
```

- [ ] **Step 2: Adicionar `agentId` ao `NewRunInput` e resolver no `createRun`**

Em `NewRunInput`, adicionar o campo:

```ts
  /** Agente que vai rodar (MAC-42). Default = agente vigente da key padrão. */
  agentId?: string;
```

Trocar o corpo de `createRun` por:

```ts
export async function createRun(input: NewRunInput): Promise<string> {
  // MAC-42: grava a versão exata do agente que rodou. Resolve o default quando o
  // chamador não passa um. Sem agente active (não deve ocorrer pós-seed) → null,
  // não bloqueia o run.
  const agentId = input.agentId ?? (await resolveDefaultAgent())?.id;
  const [row] = await db
    .insert(schema.runs)
    .values({
      linearIssueId: input.linearIssueId,
      linearIssueIdentifier: input.linearIssueIdentifier,
      title: input.title,
      status: 'pending',
      ...(input.scheduleId ? { scheduleId: input.scheduleId } : {}),
      ...(input.autoApprove !== undefined ? { autoApprove: input.autoApprove } : {}),
      ...(agentId ? { agentId } : {}),
    })
    .returning({ id: schema.runs.id });
  // biome-ignore lint/style/noNonNullAssertion: insert ... returning sempre retorna a linha
  return row!.id;
}
```

Resolver dentro do `createRun` cobre os dois chamadores (webhook + scheduleWorker) sem duplicação. `GET /runs` e `GET /runs/:id` já fazem `select()` da linha inteira → `agent_id` aparece sem mudança nas rotas.

- [ ] **Step 3: Conferir build**

Run: `rtk pnpm --filter @agent-platform/orchestrator-api build`
Expected: PASS. (Sem teste unitário novo — `createRun` precisa de DB; coberto no E2E.)

- [ ] **Step 4: Commit**

```bash
rtk git add apps/orchestrator-api/src/runs.ts
rtk git commit -m "feat(agents): grava agent_id no run via resolveDefaultAgent (MAC-42)"
```

---

## Task 5: REST `/agents` + registro no app (TDD)

**Files:**
- Create: `apps/orchestrator-api/src/routes/agents.ts`
- Create: `apps/orchestrator-api/src/routes/agents.test.ts`
- Modify: `apps/orchestrator-api/src/app.ts`

- [ ] **Step 1: Escrever os testes que falham**

Criar `apps/orchestrator-api/src/routes/agents.test.ts`:

```ts
import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentExistsError, createAgent, getAgent, listAgents, updateAgentStatus } from '../agents.js';
import { agentsRoute } from './agents.js';

vi.mock('../agents.js', async (orig) => ({
  ...(await orig<typeof import('../agents.js')>()),
  listAgents: vi.fn(),
  getAgent: vi.fn(),
  createAgent: vi.fn(),
  updateAgentStatus: vi.fn(),
}));

vi.mock('../env.js', () => ({ env: { RUNNER_AUTH_TOKEN: 'secret' } }));

const app = new Hono();
app.route('/', agentsRoute);

const auth = { authorization: 'Bearer secret' };

beforeEach(() => vi.clearAllMocks());

describe('GET /agents', () => {
  it('lista (200)', async () => {
    vi.mocked(listAgents).mockResolvedValue([{ id: 'a1' }] as never);
    const res = await app.request('/agents');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { agents: unknown[] };
    expect(body.agents).toHaveLength(1);
  });

  it('passa filtros key/status', async () => {
    vi.mocked(listAgents).mockResolvedValue([] as never);
    await app.request('/agents?key=coder-agent&status=active');
    expect(listAgents).toHaveBeenCalledWith({ key: 'coder-agent', status: 'active' });
  });
});

describe('GET /agents/:id', () => {
  it('200 quando existe', async () => {
    vi.mocked(getAgent).mockResolvedValue({ id: 'a1' } as never);
    const res = await app.request('/agents/a1');
    expect(res.status).toBe(200);
  });

  it('404 quando não existe', async () => {
    vi.mocked(getAgent).mockResolvedValue(null);
    const res = await app.request('/agents/missing');
    expect(res.status).toBe(404);
  });
});

describe('POST /agents', () => {
  it('401 sem bearer', async () => {
    const res = await app.request('/agents', { method: 'POST', body: '{}' });
    expect(res.status).toBe(401);
    expect(createAgent).not.toHaveBeenCalled();
  });

  it('201 com payload válido', async () => {
    vi.mocked(createAgent).mockResolvedValue({ id: 'a1', key: 'k', version: 'v1' } as never);
    const res = await app.request('/agents', {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ key: 'k', version: 'v1', capabilities: ['x'] }),
    });
    expect(res.status).toBe(201);
    expect(createAgent).toHaveBeenCalledWith({ key: 'k', version: 'v1', capabilities: ['x'] });
  });

  it('400 com payload inválido', async () => {
    const res = await app.request('/agents', {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ key: '', version: 'v1' }),
    });
    expect(res.status).toBe(400);
    expect(createAgent).not.toHaveBeenCalled();
  });

  it('409 em (key,version) duplicado', async () => {
    vi.mocked(createAgent).mockRejectedValue(new AgentExistsError());
    const res = await app.request('/agents', {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ key: 'k', version: 'v1' }),
    });
    expect(res.status).toBe(409);
  });
});

describe('PATCH /agents/:id', () => {
  it('401 sem bearer', async () => {
    const res = await app.request('/agents/a1', { method: 'PATCH', body: '{}' });
    expect(res.status).toBe(401);
  });

  it('200 muda status', async () => {
    vi.mocked(updateAgentStatus).mockResolvedValue({ id: 'a1', status: 'deprecated' } as never);
    const res = await app.request('/agents/a1', {
      method: 'PATCH',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'deprecated' }),
    });
    expect(res.status).toBe(200);
    expect(updateAgentStatus).toHaveBeenCalledWith('a1', 'deprecated');
  });

  it('400 com status inválido', async () => {
    const res = await app.request('/agents/a1', {
      method: 'PATCH',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'lixo' }),
    });
    expect(res.status).toBe(400);
    expect(updateAgentStatus).not.toHaveBeenCalled();
  });

  it('404 quando não existe', async () => {
    vi.mocked(updateAgentStatus).mockResolvedValue(null);
    const res = await app.request('/agents/a1', {
      method: 'PATCH',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'active' }),
    });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Rodar pra ver falhar**

Run: `rtk pnpm --filter @agent-platform/orchestrator-api test -- routes/agents.test`
Expected: FAIL (`./agents.js` rota não existe).

- [ ] **Step 3: Criar a rota**

Criar `apps/orchestrator-api/src/routes/agents.ts`:

```ts
import { type Context, Hono, type Next } from 'hono';
import { z } from 'zod';
import {
  AgentExistsError,
  type AgentStatus,
  createAgent,
  createAgentSchema,
  getAgent,
  listAgents,
  updateAgentStatus,
} from '../agents.js';
import { env } from '../env.js';
import { logger } from '../logger.js';

export const agentsRoute = new Hono();

async function requireAuth(c: Context, next: Next) {
  if (c.req.header('authorization') !== `Bearer ${env.RUNNER_AUTH_TOKEN}`) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  await next();
}

// Escritas exigem bearer; leituras são abertas (rede interna, igual runs/artifacts).
agentsRoute.post('/agents', requireAuth);
agentsRoute.patch('/agents/:id', requireAuth);

const patchSchema = z.object({ status: z.enum(['active', 'deprecated']) });

/** Lista o catálogo (descoberta). Filtra por key/status. */
agentsRoute.get('/agents', async (c) => {
  const key = c.req.query('key');
  const status = c.req.query('status') as AgentStatus | undefined;
  return c.json({ agents: await listAgents({ key, status }) });
});

/** Detalhe de um agente. */
agentsRoute.get('/agents/:id', async (c) => {
  const row = await getAgent(c.req.param('id'));
  if (!row) return c.json({ error: 'not found' }, 404);
  return c.json(row);
});

/** Registra um agente/versão. */
agentsRoute.post('/agents', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = createAgentSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'payload inválido', issues: parsed.error.issues }, 400);
  try {
    const row = await createAgent(parsed.data);
    return c.json(row, 201);
  } catch (err) {
    if (err instanceof AgentExistsError) return c.json({ error: 'agent already exists' }, 409);
    logger.error({ err }, 'failed to create agent');
    return c.json({ error: 'internal server error' }, 500);
  }
});

/** Muda o status de um agente (ex. deprecate). */
agentsRoute.patch('/agents/:id', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'status inválido' }, 400);
  const row = await updateAgentStatus(c.req.param('id'), parsed.data.status);
  if (!row) return c.json({ error: 'not found' }, 404);
  return c.json(row);
});
```

Nota: o `requireAuth` é registrado nos métodos POST/PATCH via `.post('/agents', requireAuth)` / `.patch('/agents/:id', requireAuth)` ANTES dos handlers reais — o Hono encadeia middlewares por rota na ordem de registro, então o handler do mesmo path roda depois do guard.

- [ ] **Step 4: Registrar a rota + uuidGuard no `app.ts`**

Em `app.ts`: adicionar o import e a rota.

Import (junto dos outros `routes/*`):

```ts
import { agentsRoute } from './routes/agents.js';
```

Adicionar `/agents/:id` e `/agents/:id/*` à lista de padrões do `uuidGuard`:

```ts
  for (const pattern of [
    '/runs/:id',
    '/runs/:id/*',
    '/artifacts/:id',
    '/schedules/:id',
    '/schedules/:id/*',
    '/agents/:id',
    '/agents/:id/*',
  ]) {
```

Registrar a rota (junto dos outros `app.route`):

```ts
  app.route('/', agentsRoute);
```

- [ ] **Step 5: Rodar pra ver passar**

Run: `rtk pnpm --filter @agent-platform/orchestrator-api test -- routes/agents.test`
Expected: PASS (12 testes).

- [ ] **Step 6: Teste do uuidGuard para `/agents/:id` em `app.test.ts`**

Em `apps/orchestrator-api/src/app.test.ts`, primeiro estender os mocks pra cobrir o novo módulo. Adicionar após os mocks existentes:

```ts
vi.mock('./agents.js', async (orig) => ({
  ...(await orig<typeof import('./agents.js')>()),
  listAgents: vi.fn(),
  getAgent: vi.fn(),
  createAgent: vi.fn(),
  updateAgentStatus: vi.fn(),
}));
```

E adicionar um caso dentro do `describe('guard de uuid (MAC-64)')`:

```ts
  it('404 para :id não-uuid em /agents/:id', async () => {
    const res = await app.request('/agents/nao-uuid');
    expect(res.status).toBe(404);
  });
```

- [ ] **Step 7: Rodar a suíte do app**

Run: `rtk pnpm --filter @agent-platform/orchestrator-api test -- app.test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
rtk git add apps/orchestrator-api/src/routes/agents.ts apps/orchestrator-api/src/routes/agents.test.ts apps/orchestrator-api/src/app.ts apps/orchestrator-api/src/app.test.ts
rtk git commit -m "feat(agents): REST /agents (CRUD) + uuidGuard + registro no app (MAC-42)"
```

---

## Task 6: Seed idempotente no boot

**Files:**
- Modify: `apps/orchestrator-api/src/worker.ts:31-33`

- [ ] **Step 1: Chamar `ensureDefaultAgent()` no boot do worker**

Em `worker.ts`, adicionar o import:

```ts
import { ensureDefaultAgent } from './agents.js';
```

No início de `startAgentWorker`, logo após `const { graph, linear, llm } = await getAgent();`, adicionar (não-fatal, igual às outras inicializações):

```ts
  // MAC-42: garante o agente default no catálogo (idempotente). Não-fatal.
  try {
    await ensureDefaultAgent();
  } catch (err) {
    logger.warn({ err }, 'ensureDefaultAgent falhou (seguindo sem seed)');
  }
```

- [ ] **Step 2: Conferir build**

Run: `rtk pnpm --filter @agent-platform/orchestrator-api build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
rtk git add apps/orchestrator-api/src/worker.ts
rtk git commit -m "feat(agents): seed idempotente do coder-agent v1 no boot (MAC-42)"
```

---

## Task 7: MCP tools `list_agents` / `get_agent` (TDD)

**Files:**
- Modify: `apps/mcp-server/src/client.ts`
- Modify: `apps/mcp-server/src/client.test.ts`
- Modify: `apps/mcp-server/src/tools.ts`
- Modify: `apps/mcp-server/README.md`

- [ ] **Step 1: Adicionar os casos de teste ao client.test.ts**

Em `apps/mcp-server/src/client.test.ts`, dentro do `it('mapeia cada método para o verbo + rota corretos', ...)`, adicionar ao array `cases`:

```ts
      [(c) => c.listAgents(), 'GET', 'http://orch:3000/agents'],
      [(c) => c.getAgent('a1'), 'GET', 'http://orch:3000/agents/a1'],
```

E adicionar um teste novo de filtros (depois do `listLessons`):

```ts
  it('listAgents monta key/status na query', async () => {
    const f = mockFetch(200, { agents: [] });
    await createClient(cfg(f)).listAgents({ key: 'coder-agent', status: 'active' });
    const call = (f as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0];
    expect(call[0]).toBe('http://orch:3000/agents?key=coder-agent&status=active');
  });
```

- [ ] **Step 2: Rodar pra ver falhar**

Run: `rtk pnpm --filter @agent-platform/mcp-server test`
Expected: FAIL (`listAgents`/`getAgent` não existem no client).

- [ ] **Step 3: Adicionar os métodos ao client**

Em `client.ts`, adicionar à interface `OrchestratorClient`:

```ts
  listAgents(filter?: { key?: string; status?: string }): Promise<unknown>;
  getAgent(id: string): Promise<unknown>;
```

E no objeto retornado por `createClient` (junto dos outros):

```ts
    listAgents: (filter) => call('GET', `/agents${query({ key: filter?.key, status: filter?.status })}`),
    getAgent: (agentId) => call('GET', `/agents/${id(agentId)}`),
```

- [ ] **Step 4: Rodar pra ver passar**

Run: `rtk pnpm --filter @agent-platform/mcp-server test`
Expected: PASS.

- [ ] **Step 5: Registrar as tools**

Em `tools.ts`, dentro de `registerTools`, adicionar (junto das outras tools de leitura):

```ts
  server.tool(
    'list_agents',
    'Lista os agentes registrados (catálogo). Filtra por key e/ou status.',
    { key: z.string().optional(), status: z.enum(['active', 'deprecated']).optional() },
    ({ key, status }) => asTool(() => client.listAgents({ key, status })),
  );

  server.tool('get_agent', 'Detalha um agente registrado pelo id.', { id: z.string() }, ({ id }) =>
    asTool(() => client.getAgent(id)),
  );
```

- [ ] **Step 6: Atualizar o README do mcp-server**

Em `apps/mcp-server/README.md`, na tabela/lista de tools de leitura, adicionar `list_agents` (→ `GET /agents`) e `get_agent` (→ `GET /agents/:id`), seguindo o formato das linhas existentes.

- [ ] **Step 7: Build + testes do mcp-server**

Run: `rtk pnpm --filter @agent-platform/mcp-server build && rtk pnpm --filter @agent-platform/mcp-server test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
rtk git add apps/mcp-server/src/client.ts apps/mcp-server/src/client.test.ts apps/mcp-server/src/tools.ts apps/mcp-server/README.md
rtk git commit -m "feat(agents): tools MCP list_agents/get_agent (MAC-42)"
```

---

## Task 8: Env no .env.example + compose

**Files:**
- Modify: `apps/orchestrator-api/.env.example`
- Modify: `infra/compose/orchestrator/docker-compose.yml`

- [ ] **Step 1: Adicionar `AGENT_KEY` ao `.env.example`**

Em `apps/orchestrator-api/.env.example`, adicionar (perto das outras `AGENT_*`):

```
# Agent Registry (MAC-42): key do agente default
AGENT_KEY=coder-agent
```

- [ ] **Step 2: Adicionar `AGENT_KEY` à lista `environment:` do compose**

Em `infra/compose/orchestrator/docker-compose.yml`, no serviço da API, na lista `environment:` (gotcha conhecido: env nova precisa entrar AQUI, não só no .env), adicionar:

```yaml
      - AGENT_KEY=${AGENT_KEY:-coder-agent}
```

- [ ] **Step 3: Build full do monorepo (sanity)**

Run: `rtk pnpm -r build`
Expected: PASS.

- [ ] **Step 4: Suíte completa**

Run: `rtk pnpm test`
Expected: PASS (todos os testes, incluindo os ~13 novos: pickActiveAgent 2, createAgentSchema 3, rotas 12, client 3 — ajustar contagem ao real).

- [ ] **Step 5: Commit**

```bash
rtk git add apps/orchestrator-api/.env.example infra/compose/orchestrator/docker-compose.yml
rtk git commit -m "chore(agents): AGENT_KEY no .env.example + compose do orchestrator (MAC-42)"
```

---

## Deploy + E2E (pós-implementação, rodado pelo usuário)

> Não é tarefa de código. Sequência pro usuário rodar no host Proxmox após o merge na main.

1. **Deploy (host 192.168.0.10):**
   ```bash
   cd ~/agent-platform && git pull && bash infra/deploy/deploy.sh orchestrator
   ```
   Aplica a migration `0006` (db:deploy) + sobe a API com o seed no boot. Runners NÃO mudam.

2. **Túnel REST (laptop):** `ssh -fN -L 3000:10.10.0.11:3000 root@192.168.0.10`

3. **Verificar:**
   - `curl http://localhost:3000/agents` → deve listar `coder-agent v1` (seed) com `status: active`.
   - `curl -X POST -H "authorization: Bearer $RUNNER_AUTH_TOKEN" -H 'content-type: application/json' -d '{"key":"x","version":"v1"}' http://localhost:3000/agents` → 201; repetir → 409.
   - `curl http://localhost:3000/agents/nao-uuid` → 404 (uuidGuard).
   - Disparar um run (issue de teste `ai-ready`) → `curl http://localhost:3000/runs/<id>` deve trazer `agent_id` preenchido (= id do coder-agent v1).
   - MCP: `list_agents` no Claude Code (zero-túnel via Proxmox) retorna o catálogo.

4. **Linear:** comentar progresso na MAC-42 + mover pra Done.

---

## Self-Review

**Spec coverage:**
- Dados (tabela `agents` + enum + `runs.agent_id` + unique key,version) → Task 1. ✅
- Data layer (list/get/create/updateStatus/ensureDefault/resolveDefault + pickActiveAgent puro + zod) → Tasks 2–3. ✅
- REST (GET aberto, POST/PATCH bearer, 409/400/404, uuidGuard) → Task 5. ✅
- MCP read-only (list_agents/get_agent + README) → Task 7. ✅
- Seed idempotente no boot → Task 6. ✅
- Integração com runs (agent_id no insert, serialização) → Task 4. ✅
- Env AGENT_KEY (env.ts + .env.example + compose) → Tasks 3+8. ✅
- Error handling (409/400/404/uuid/seed não-fatal) → Tasks 3,5,6. ✅
- Testes (pickActiveAgent ≥3, zod ≥3, rotas, uuid, ensureDefault idempotente) → Tasks 2,5. **Desvio:** `ensureDefaultAgent` idempotente não tem teste unitário (precisa DB; `onConflictDoNothing` é declarativo). Coberto no E2E (deploy roda o seed 2× entre reinícios sem duplicar). Aceito.

**Desvio do spec (documentado):** o spec diz "resolver `resolveDefaultAgent()` na criação do run (webhook + scheduleWorker)". O plano resolve DENTRO de `createRun` (Task 4) — DRY, um ponto só, cobre os dois chamadores sem editar webhook/scheduleWorker. Mesmo efeito.

**Placeholder scan:** nenhum TODO/TBD/"add error handling" genérico — todo passo tem código real.

**Type consistency:** `Agent`/`NewAgent` (schema), `AgentStatus` (`agents.ts`), `createAgentSchema`/`CreateAgentInput`, `AgentExistsError`, `pickActiveAgent`, `listAgents({key,status})`, `getAgent(id)`, `createAgent(input)`, `updateAgentStatus(id,status)`, `ensureDefaultAgent()`, `resolveDefaultAgent()` — nomes batem entre data layer, rota, MCP client e testes.
