# MAC-23 Memory Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar memória de feedback ao agente — destilar lições das falhas (critic REPROVA / validação sandbox ❌) e reinjetá-las no codegen dos runs futuros do mesmo repo.

**Architecture:** Novo pacote puro `@agent-platform/memory` (tipos + `distillLesson` via `cheap_fast` + `formatLessons`). Orchestrator ganha tabela `lessons`, captura no fim do run em `worker.ts` (WRITE) e injeta as lições no payload do job em `coder.ts` (READ). O runner só recebe um campo novo `lessons` e o injeta no `GENERATE_PROMPT`. Sem mudança na topologia do LangGraph, sem embeddings.

**Tech Stack:** TypeScript ESM, pnpm workspaces, Drizzle ORM (Postgres), Hono, Vitest, LiteLLM (alias `cheap_fast`).

**Referência:** spec em `docs/superpowers/specs/2026-06-12-mac-23-memory-layer-design.md`.

---

## File Structure

**Criar:**
- `packages/memory/package.json` — manifesto do pacote (espelha `packages/policy`).
- `packages/memory/tsconfig.json` — idem.
- `packages/memory/src/index.ts` — `Lesson`, `LessonStore`, `formatLessons`, `distillLesson`, `LESSON_CAP`.
- `packages/memory/src/memory.test.ts` — testes de `formatLessons` e `distillLesson`.
- `apps/orchestrator-api/src/lessons.ts` — `saveLesson` / `listLessons` (Postgres).

**Modificar:**
- `apps/orchestrator-api/package.json` — dep `@agent-platform/memory`.
- `apps/orchestrator-api/src/db/schema.ts` — tabela `lessons`.
- `apps/orchestrator-api/drizzle/*` — migration gerada (drizzle-kit).
- `apps/orchestrator-api/src/agent.ts` — expõe `llm` no `Agent`; monta `loadLessons`.
- `apps/orchestrator-api/src/worker.ts` — captura a lição no fim do run (WRITE).
- `apps/orchestrator-api/src/routes/runs.ts` — endpoint `GET /lessons`.
- `packages/graph/src/index.ts` — exporta `verdictOf`.
- `packages/graph/src/nodes/report.ts` — `verdictOf` já vive aqui (só re-exportar).
- `packages/graph/src/build.ts` — `GraphDeps.loadLessons`, repassa ao coder.
- `packages/graph/src/nodes/coder.ts` — `CoderDeps.loadLessons`, injeta `lessons` no job (READ).
- `apps/worker-code/src/types.ts` — campo `lessons` no `jobSchema`.
- `apps/worker-code/src/executor/runJob.ts` — repassa `job.lessons` ao codegen.
- `apps/worker-code/src/executor/codegen.ts` — `CodegenArgs.lessons` + bloco no prompt.
- `docs/ARCHITECTURE.md` — MAC-23 → ✅.

---

## Task 1: Scaffold do pacote `@agent-platform/memory`

**Files:**
- Create: `packages/memory/package.json`
- Create: `packages/memory/tsconfig.json`
- Create: `packages/memory/src/index.ts`

- [ ] **Step 1: Criar `packages/memory/package.json`**

```json
{
  "name": "@agent-platform/memory",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@agent-platform/llm": "workspace:*"
  },
  "devDependencies": {
    "@types/node": "^22.13.4",
    "typescript": "^5.7.3"
  }
}
```

- [ ] **Step 2: Criar `packages/memory/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Criar `packages/memory/src/index.ts` (tipos + interface, sem lógica ainda)**

```ts
import type { LlmClient } from '@agent-platform/llm';

/** Máximo de lições injetadas no prompt de um run. */
export const LESSON_CAP = 10;

/** Sinal que originou a lição. */
export type LessonSource = 'critic' | 'validation';

/**
 * Lição destilada de uma falha de run, reutilizada em runs futuros do mesmo repo
 * (MAC-23). Tipo puro — independente da camada de persistência.
 */
export interface Lesson {
  id: string;
  repo: string;
  source: LessonSource;
  category?: string | null;
  text: string;
  runId: string;
  createdAt: Date;
}

/** Contrato de persistência de lições — implementado no orchestrator (Postgres). */
export interface LessonStore {
  save(lesson: Omit<Lesson, 'id' | 'createdAt'>): Promise<void>;
  list(repo: string, limit: number): Promise<Lesson[]>;
}

/** Entrada para destilar uma lição a partir de uma falha. */
export interface DistillInput {
  source: LessonSource;
  /** Parecer do critic (quando source = 'critic'). */
  review?: string;
  /** Resumo dos comandos de validação que falharam (quando source = 'validation'). */
  testSummary?: string;
}

// formatLessons e distillLesson são implementados nas tasks 2 e 3.
```

- [ ] **Step 4: Declarar a dependência no orchestrator** — em `apps/orchestrator-api/package.json`, no bloco `dependencies`, adicionar a linha (ordem alfabética, depois de `@agent-platform/llm`):

```json
    "@agent-platform/memory": "workspace:*",
```

- [ ] **Step 5: Instalar e checar build do pacote**

Run: `rtk pnpm install && rtk pnpm --filter @agent-platform/memory build`
Expected: install OK; build compila sem erro (gera `packages/memory/dist`).

- [ ] **Step 6: Commit**

```bash
rtk git add packages/memory apps/orchestrator-api/package.json pnpm-lock.yaml
rtk git commit -m "feat(memory): scaffold do pacote @agent-platform/memory (MAC-23)"
```

---

## Task 2: `formatLessons` (TDD)

Monta o bloco de bullets das lições, com dedup textual leve e cap. Retorna `''` quando não há lições.

**Files:**
- Create: `packages/memory/src/memory.test.ts`
- Modify: `packages/memory/src/index.ts`

- [ ] **Step 1: Escrever o teste que falha** — criar `packages/memory/src/memory.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { type Lesson, formatLessons } from './index.js';

function lesson(text: string, createdAt = new Date()): Lesson {
  return { id: 'x', repo: 'o/r', source: 'critic', text, runId: 'run', createdAt };
}

describe('formatLessons', () => {
  it('retorna vazio quando não há lições', () => {
    expect(formatLessons([], 10)).toBe('');
  });

  it('formata como bullets markdown', () => {
    const out = formatLessons([lesson('Não faça A'), lesson('Sempre faça B')], 10);
    expect(out).toBe('- Não faça A\n- Sempre faça B');
  });

  it('deduplica lições textualmente iguais (ignorando caixa/espaços)', () => {
    const out = formatLessons([lesson('Não faça A'), lesson('  não  faça a ')], 10);
    expect(out).toBe('- Não faça A');
  });

  it('respeita o cap mantendo as primeiras (mais recentes)', () => {
    const out = formatLessons([lesson('A'), lesson('B'), lesson('C')], 2);
    expect(out).toBe('- A\n- B');
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `rtk vitest run packages/memory/src/memory.test.ts`
Expected: FAIL — `formatLessons is not a function` / sem export.

- [ ] **Step 3: Implementar `formatLessons`** — adicionar ao fim de `packages/memory/src/index.ts`:

```ts
/** Normaliza o texto p/ comparação de duplicatas (caixa + espaços). */
function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Monta o bloco de lições para o prompt do codegen: dedup textual leve e cap nas
 * `cap` primeiras (a lista chega ordenada do mais recente). Vazio se não houver.
 */
export function formatLessons(lessons: Lesson[], cap: number): string {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const l of lessons) {
    const text = l.text.trim();
    if (!text) continue;
    const key = normalize(text);
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(`- ${text}`);
    if (lines.length >= cap) break;
  }
  return lines.join('\n');
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `rtk vitest run packages/memory/src/memory.test.ts`
Expected: PASS (4 testes de `formatLessons`).

- [ ] **Step 5: Commit**

```bash
rtk git add packages/memory/src
rtk git commit -m "feat(memory): formatLessons com dedup e cap (MAC-23)"
```

---

## Task 3: `distillLesson` (TDD)

Uma chamada `cheap_fast` que transforma a falha numa regra curta, ou `null` se não houver lição acionável.

**Files:**
- Modify: `packages/memory/src/memory.test.ts`
- Modify: `packages/memory/src/index.ts`

- [ ] **Step 1: Escrever o teste que falha** — adicionar ao `packages/memory/src/memory.test.ts`:

```ts
import { type DistillInput, distillLesson } from './index.js';
import type { LlmClient } from '@agent-platform/llm';

function fakeLlm(reply: string): LlmClient {
  return { complete: async () => reply };
}

describe('distillLesson', () => {
  it('devolve a regra destilada do parecer do critic', async () => {
    const input: DistillInput = { source: 'critic', review: 'Veredito: REPROVADO\nFaltou tratar null.' };
    const out = await distillLesson(fakeLlm('Sempre trate null em X porque quebra Y'), input);
    expect(out).toBe('Sempre trate null em X porque quebra Y');
  });

  it('devolve null quando o modelo responde NONE', async () => {
    const out = await distillLesson(fakeLlm('NONE'), { source: 'validation', testSummary: 'timeout' });
    expect(out).toBeNull();
  });

  it('devolve null quando o modelo responde vazio', async () => {
    const out = await distillLesson(fakeLlm('   '), { source: 'critic', review: 'x' });
    expect(out).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `rtk vitest run packages/memory/src/memory.test.ts`
Expected: FAIL — `distillLesson is not a function`.

- [ ] **Step 3: Implementar `distillLesson`** — adicionar ao fim de `packages/memory/src/index.ts`:

```ts
const DISTILL_SYSTEM = `Você destila a causa de UMA falha de geração de código numa única regra curta e acionável, para o próximo agente NÃO repetir o erro.
Formato: uma frase imperativa, até ~140 caracteres, ex.: "Não faça X porque Y" ou "Sempre faça X".
Se a falha for genérica/ambiental (timeout, rede, dependência ausente do ambiente) e não houver lição de CÓDIGO acionável, responda exatamente: NONE.
Responda só com a frase (ou NONE), sem markdown nem aspas.`;

/**
 * Destila uma lição de uma falha via `cheap_fast` (MAC-23). Retorna a regra curta
 * ou `null` quando não há nada acionável (modelo responde NONE / vazio).
 */
export async function distillLesson(llm: LlmClient, input: DistillInput): Promise<string | null> {
  const context =
    input.source === 'critic'
      ? `# Parecer do revisor (REPROVADO)\n${input.review ?? ''}`
      : `# Falha de validação no sandbox\n${input.testSummary ?? ''}`;

  const reply = await llm.complete({
    alias: 'cheap_fast',
    temperature: 0,
    messages: [
      { role: 'system', content: DISTILL_SYSTEM },
      { role: 'user', content: context },
    ],
  });

  const text = reply.trim();
  if (!text || text.toUpperCase() === 'NONE') return null;
  return text;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `rtk vitest run packages/memory/src/memory.test.ts`
Expected: PASS (7 testes no total: 4 format + 3 distill).

- [ ] **Step 5: Commit**

```bash
rtk git add packages/memory/src
rtk git commit -m "feat(memory): distillLesson via cheap_fast (MAC-23)"
```

---

## Task 4: Tabela `lessons` + migration

**Files:**
- Modify: `apps/orchestrator-api/src/db/schema.ts`
- Create: `apps/orchestrator-api/drizzle/<gerada>.sql` (via drizzle-kit)

- [ ] **Step 1: Adicionar o enum e a tabela ao `schema.ts`** — depois do bloco `approvalStatus` (linha ~50) adicionar o enum, e depois da tabela `approvals` (linha ~96) adicionar a tabela:

```ts
export const lessonSource = pgEnum('lesson_source', ['critic', 'validation']);
```

```ts
export const lessons = pgTable('lessons', {
  id: uuid('id').primaryKey().defaultRandom(),
  repo: text('repo').notNull(),
  source: lessonSource('source').notNull(),
  category: text('category'),
  text: text('text').notNull(),
  runId: uuid('run_id').references(() => runs.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 2: Adicionar os tipos inferidos** — ao fim do `schema.ts`, junto dos outros `export type`:

```ts
export type LessonRow = typeof lessons.$inferSelect;
export type NewLessonRow = typeof lessons.$inferInsert;
```

- [ ] **Step 3: Gerar a migration**

Run: `rtk pnpm --filter @agent-platform/orchestrator-api db:generate`
Expected: cria `apps/orchestrator-api/drizzle/0001_*.sql` com `CREATE TYPE "public"."lesson_source"` e `CREATE TABLE "lessons"`, e atualiza `drizzle/meta`.

- [ ] **Step 4: Conferir a migration gerada**

Run: `rtk git status && rtk read apps/orchestrator-api/drizzle/0001_*.sql`
Expected: SQL cria o enum `lesson_source` e a tabela `lessons` com FK `run_id → runs(id) ON DELETE SET NULL`.

- [ ] **Step 5: Build do orchestrator (garante schema válido)**

Run: `rtk pnpm --filter @agent-platform/orchestrator-api build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
rtk git add apps/orchestrator-api/src/db/schema.ts apps/orchestrator-api/drizzle
rtk git commit -m "feat(db): tabela lessons p/ memory layer (MAC-23)"
```

---

## Task 5: Módulo de persistência `lessons.ts`

Implementa o `LessonStore` sobre o Postgres do orchestrator. Segue o padrão de `runs.ts` (sem unit test — validado no E2E, como os demais módulos de DB).

**Files:**
- Create: `apps/orchestrator-api/src/lessons.ts`

- [ ] **Step 1: Criar `apps/orchestrator-api/src/lessons.ts`**

```ts
import type { Lesson, LessonSource } from '@agent-platform/memory';
import { desc, eq } from 'drizzle-orm';
import { db, schema } from './db/client.js';

/** Mapeia a linha do banco para o tipo puro do pacote memory. */
function toLesson(row: schema.LessonRow): Lesson {
  return {
    id: row.id,
    repo: row.repo,
    source: row.source as LessonSource,
    category: row.category,
    text: row.text,
    runId: row.runId ?? '',
    createdAt: row.createdAt,
  };
}

/** Persiste uma lição destilada de uma falha (MAC-23). */
export async function saveLesson(input: {
  repo: string;
  source: LessonSource;
  text: string;
  runId: string;
  category?: string | null;
}): Promise<void> {
  await db.insert(schema.lessons).values({
    repo: input.repo,
    source: input.source,
    text: input.text,
    runId: input.runId,
    category: input.category ?? null,
  });
}

/** Lições de um repo, mais recentes primeiro (MAC-23). */
export async function listLessons(repo: string, limit: number): Promise<Lesson[]> {
  const rows = await db
    .select()
    .from(schema.lessons)
    .where(eq(schema.lessons.repo, repo))
    .orderBy(desc(schema.lessons.createdAt))
    .limit(limit);
  return rows.map(toLesson);
}
```

> Nota: `schema.LessonRow` é o tipo exportado na Task 4. `db`/`schema` vêm de `db/client.ts` (mesmo pool de `runs.ts`).

- [ ] **Step 2: Build do orchestrator**

Run: `rtk pnpm --filter @agent-platform/orchestrator-api build`
Expected: PASS (tipos batem).

- [ ] **Step 3: Commit**

```bash
rtk git add apps/orchestrator-api/src/lessons.ts
rtk git commit -m "feat(memory): persistência de lições (saveLesson/listLessons) (MAC-23)"
```

---

## Task 6: WRITE — capturar a lição no fim do run

No fim de cada run, se o critic REPROVOU ou a validação falhou, destila e salva a lição. Vive em `worker.ts`, junto do `recordStep`/cost guard.

**Files:**
- Modify: `packages/graph/src/index.ts`
- Modify: `apps/orchestrator-api/src/agent.ts`
- Modify: `apps/orchestrator-api/src/worker.ts`

- [ ] **Step 1: Exportar `verdictOf` do pacote graph** — em `packages/graph/src/index.ts`, adicionar:

```ts
export { verdictOf } from './nodes/report.js';
```

- [ ] **Step 2: Expor o `llm` no `Agent`** — em `apps/orchestrator-api/src/agent.ts`:

No `interface Agent`, adicionar o campo:

```ts
export interface Agent {
  graph: AgentGraph;
  linear: LinearGateway;
  llm: LlmClient;
}
```

Adicionar o import do tipo no topo (junto do import de `@agent-platform/llm`):

```ts
import { type LlmClient, createLlmClient } from '@agent-platform/llm';
```

E no `return` do `init()`:

```ts
  return { graph, linear, llm };
```

- [ ] **Step 3: Build do graph + orchestrator (garante exports/tipos)**

Run: `rtk pnpm --filter @agent-platform/graph build && rtk pnpm --filter @agent-platform/orchestrator-api build`
Expected: PASS.

- [ ] **Step 4: Capturar a lição no `worker.ts`** — em `apps/orchestrator-api/src/worker.ts`:

Adicionar os imports no topo:

```ts
import { distillLesson } from '@agent-platform/memory';
import { parseRepoRef } from '@agent-platform/github';
import { verdictOf } from '@agent-platform/graph';
import { saveLesson } from './lessons.js';
import { env } from './env.js';
```

> `env` já está importado — não duplicar. `parseRepoRef`/`verdictOf`/`distillLesson`/`saveLesson` são novos.

Desestruturar `llm` junto de `graph, linear`:

```ts
  const { graph, linear, llm } = await getAgent();
```

Ampliar o tipo do `result` (no `let result: {...}`) para incluir os campos da revisão/validação:

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
      };
```

Logo após o bloco do Cost Guard (depois do `if (total > env.AGENT_MAX_COST_PER_RUN_USD) { ... }`, ainda dentro do processador do job), adicionar a captura:

```ts
      // Memory Layer (MAC-23): se o run falhou na revisão ou na validação, destila
      // a lição e guarda por repo — runs futuros do mesmo repo a recebem no codegen.
      const reproved = /REPROVADO/i.test(verdictOf(result.review));
      const testsFailed = result.testsPassed === false;
      if (reproved || testsFailed) {
        try {
          const repo = `${parseRepoRef(env.REPO_URL).owner}/${parseRepoRef(env.REPO_URL).repo}`;
          const text = await distillLesson(llm, {
            source: reproved ? 'critic' : 'validation',
            review: result.review,
            testSummary: result.testSummary,
          });
          if (text) {
            await saveLesson({ repo, source: reproved ? 'critic' : 'validation', text, runId });
            log.info({ runId, source: reproved ? 'critic' : 'validation' }, 'lição registrada');
          }
        } catch (err) {
          log.warn({ err }, 'falha ao registrar lição (não-fatal)');
        }
      }
```

> `parseRepoRef` devolve `{ owner, repo }` (ver `packages/github`). A captura é não-fatal: erro aqui não derruba o run.

- [ ] **Step 5: Build do orchestrator**

Run: `rtk pnpm --filter @agent-platform/orchestrator-api build`
Expected: PASS.

- [ ] **Step 6: Suite completa (nada quebrou)**

Run: `rtk vitest run`
Expected: PASS — 41 testes (34 anteriores + 7 do memory).

- [ ] **Step 7: Commit**

```bash
rtk git add packages/graph/src/index.ts apps/orchestrator-api/src/agent.ts apps/orchestrator-api/src/worker.ts
rtk git commit -m "feat(memory): captura lição ao fim do run (critic/validação) (MAC-23)"
```

---

## Task 7: READ — injetar lições no job (orchestrator)

Antes de despachar o job ao runner, o coder carrega as lições do repo e as injeta no payload.

**Files:**
- Modify: `apps/orchestrator-api/src/agent.ts`
- Modify: `packages/graph/src/build.ts`
- Modify: `packages/graph/src/nodes/coder.ts`

- [ ] **Step 1: Montar `loadLessons` no `agent.ts`** — em `apps/orchestrator-api/src/agent.ts`:

Adicionar imports:

```ts
import { LESSON_CAP, formatLessons } from '@agent-platform/memory';
import { listLessons } from './lessons.js';
```

Dentro de `init()`, antes do `buildAgentGraph(...)`, montar o repo e o loader:

```ts
  // Memory Layer (MAC-23): repo alvo e função que entrega as lições já formatadas
  // para o codegen. Fechamento sobre o repo — single-repo por deploy no MVP.
  const repoRef = parseRepoRef(env.REPO_URL);
  const repo = `${repoRef.owner}/${repoRef.repo}`;
  const loadLessons = async (): Promise<string> =>
    formatLessons(await listLessons(repo, LESSON_CAP), LESSON_CAP);
```

> `parseRepoRef` já está importado no `agent.ts` (linha 1). Reaproveita a `repoRef` em vez de recomputar no `createGithubGateway` se preferir, mas não é obrigatório.

Passar `loadLessons` nas deps do grafo:

```ts
  const graph = buildAgentGraph(
    {
      llm,
      linear,
      github,
      testCommands,
      loadLessons,
      runner: {
        baseUrl: env.RUNNER_BASE_URL,
        authToken: env.RUNNER_AUTH_TOKEN,
        repoUrl,
      },
    },
    checkpointer,
  );
```

- [ ] **Step 2: Aceitar `loadLessons` no `GraphDeps` e repassar ao coder** — em `packages/graph/src/build.ts`:

No `interface GraphDeps`, adicionar:

```ts
  /** Carrega as lições do repo já formatadas p/ o prompt do codegen (MAC-23). */
  loadLessons?: () => Promise<string>;
```

No `buildAgentGraph`, na construção do nó `coding`:

```ts
  const coding = makeCoderNode({
    linear: deps.linear,
    runner: deps.runner,
    testCommands: deps.testCommands ?? [],
    loadLessons: deps.loadLessons,
  });
```

- [ ] **Step 3: Injetar `lessons` no payload do job** — em `packages/graph/src/nodes/coder.ts`:

No `interface CoderDeps`, adicionar:

```ts
  /** Carrega as lições do repo já formatadas p/ o codegen (MAC-23). Opcional. */
  loadLessons?: () => Promise<string>;
```

Dentro do `return async (state) => { ... }`, logo no começo do `try` (antes do `fetch`), carregar as lições:

```ts
      const lessons = deps.loadLessons ? await deps.loadLessons() : '';
```

E adicionar `lessons` ao corpo do `JSON.stringify(...)` do `fetch` (junto de `commands`):

```ts
          plan: state.plan,
          commands: deps.testCommands,
          lessons,
```

- [ ] **Step 4: Build dos dois pacotes**

Run: `rtk pnpm --filter @agent-platform/graph build && rtk pnpm --filter @agent-platform/orchestrator-api build`
Expected: PASS.

- [ ] **Step 5: Suite (coder.test.ts ainda passa — dep é opcional)**

Run: `rtk vitest run`
Expected: PASS — 41 testes.

- [ ] **Step 6: Commit**

```bash
rtk git add apps/orchestrator-api/src/agent.ts packages/graph/src/build.ts packages/graph/src/nodes/coder.ts
rtk git commit -m "feat(memory): injeta lições do repo no job do codegen (MAC-23)"
```

---

## Task 8: Runner — injetar as lições no prompt do codegen

O runner recebe `lessons` no job e o adiciona ao `GENERATE_PROMPT`.

**Files:**
- Modify: `apps/worker-code/src/types.ts`
- Modify: `apps/worker-code/src/executor/runJob.ts`
- Modify: `apps/worker-code/src/executor/codegen.ts`

- [ ] **Step 1: Campo `lessons` no `jobSchema`** — em `apps/worker-code/src/types.ts`, dentro do `z.object({...})`, depois de `plan`:

```ts
  /** Lições de runs anteriores do repo, já formatadas (Memory Layer, MAC-23). */
  lessons: z.string().default(''),
```

- [ ] **Step 2: Repassar ao codegen** — em `apps/worker-code/src/executor/runJob.ts`, na chamada `generateAndApplyCode({...})`, adicionar:

```ts
      const gen = await generateAndApplyCode({
        llm,
        dir,
        title: job.title,
        description: job.description,
        plan: job.plan,
        lessons: job.lessons,
        log,
      });
```

- [ ] **Step 3: Aceitar e injetar `lessons` no codegen** — em `apps/worker-code/src/executor/codegen.ts`:

Localizar a `interface CodegenArgs` (perto do topo, após os prompts) e adicionar o campo `lessons`. A interface atual tem `llm, dir, title, description, plan, log`; adicionar:

```ts
  /** Lições de runs anteriores do repo, já formatadas (MAC-23). */
  lessons?: string;
```

Em `generateAndApplyCode`, desestruturar `lessons`:

```ts
  const { llm, dir, title, description, plan, lessons, log } = args;
```

No array `content` da chamada `completeJson` (o passo 2, `GENERATE_PROMPT`), adicionar o bloco logo após o de convenções/exemplos e antes do conteúdo atual:

```ts
          conventions ? `\n# Convenções do projeto\n${conventions}` : '',
          examples ? `\n# Arquivos-exemplo (siga este padrão)${examples}` : '',
          lessons ? `\n# Lições de runs anteriores (evite repetir estes erros)\n${lessons}` : '',
          `\n# Conteúdo atual dos arquivos a modificar${currentBlock || '\n(nenhum)'}`,
```

- [ ] **Step 4: Build do runner**

Run: `rtk pnpm --filter @agent-platform/worker-code build`
Expected: PASS.

- [ ] **Step 5: Suite (codegen.test.ts ainda passa — campo opcional)**

Run: `rtk vitest run`
Expected: PASS — 41 testes.

- [ ] **Step 6: Commit**

```bash
rtk git add apps/worker-code/src/types.ts apps/worker-code/src/executor/runJob.ts apps/worker-code/src/executor/codegen.ts
rtk git commit -m "feat(memory): injeta lições no prompt do codegen do runner (MAC-23)"
```

---

## Task 9: Endpoint `GET /lessons` (auditoria)

**Files:**
- Modify: `apps/orchestrator-api/src/routes/runs.ts`

- [ ] **Step 1: Adicionar a rota** — em `apps/orchestrator-api/src/routes/runs.ts`:

Adicionar `listLessons` ao import de `../runs.js`? Não — vem de `../lessons.js`. Adicionar import:

```ts
import { listLessons } from '../lessons.js';
```

E a rota (depois de `GET /runs/:id/approvals`):

```ts
/** Lições acumuladas de um repo (Memory Layer, MAC-23). `?repo=owner/name`, `?limit=`. */
runsRoute.get('/lessons', async (c) => {
  const repo = c.req.query('repo');
  if (!repo) return c.json({ error: 'query `repo` obrigatória (owner/name)' }, 400);
  const limit = Math.min(Number(c.req.query('limit')) || 50, 200);
  return c.json({ lessons: await listLessons(repo, limit) });
});
```

- [ ] **Step 2: Build**

Run: `rtk pnpm --filter @agent-platform/orchestrator-api build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
rtk git add apps/orchestrator-api/src/routes/runs.ts
rtk git commit -m "feat(memory): GET /lessons p/ auditoria das lições (MAC-23)"
```

---

## Task 10: Verificação final + docs

**Files:**
- Modify: `docs/ARCHITECTURE.md`

- [ ] **Step 1: Build e testes do monorepo inteiro**

Run: `rtk pnpm -r build && rtk vitest run`
Expected: build de todos os pacotes PASS; 41 testes PASS.

- [ ] **Step 2: Atualizar `docs/ARCHITECTURE.md`** — marcar MAC-23 como feito:

- Na tabela §3, linha "Memory Layer": trocar estado `⏳` por `✅ (feedback learning: lessons por repo)`.
- Na tabela §4 (roadmap), linha Fase 3: trocar "só MAC-23 (memory) ⏳" por "✅ completa".
- Em §5.4 (fronteira Postgres vs Memory): anotar que a fronteira foi resolvida — `lessons` é tabela separada, destilada e reinjetada; `run_steps` segue telemetria.

- [ ] **Step 3: Commit**

```bash
rtk git add docs/ARCHITECTURE.md
rtk git commit -m "docs(architecture): MAC-23 Memory Layer completa (Fase 3 fechada)"
```

- [ ] **Step 4: Push**

```bash
rtk git push
```

---

## Deploy + validação em prod (pós-merge, host Proxmox — o usuário roda)

Não é tarefa de código, mas registre no handoff:

1. **Migration:** redeploy `orchestrator` aplica `pnpm db:deploy` (cria a tabela `lessons`).
2. **Redeploy `orchestrator`** (WRITE + READ + endpoint) **e `runners`** (injeção no prompt).
3. **E2E:** disparar uma issue de teste cujo run REPROVE ou falhe na validação → conferir `GET /lessons?repo=owner/name` retornar a lição. Disparar um segundo run e confirmar que a lição entra no prompt (heartbeat/log `lição registrada`).
4. **Sync Linear:** MAC-23 → Done + comentário de progresso.

---

## Self-Review

**Spec coverage:**
- Foco feedback learning → Tasks 1-8. ✅
- Gatilhos critic REPROVA + validação falha → Task 6 (`reproved || testsFailed`). ✅
- Destilação `cheap_fast` → Task 3. ✅
- Retrieval por repo + cap → Tasks 5/7 (`listLessons(repo, LESSON_CAP)` + `formatLessons`). ✅
- `packages/memory` puro (Lesson/distill/format/LessonStore) → Tasks 1-3. ✅
- Tabela `lessons` + fronteira vs run_steps → Tasks 4/10. ✅
- WRITE em worker.ts (sem mudar grafo) → Task 6. ✅
- READ no coder + bloco no codegen → Tasks 7/8. ✅
- `GET /lessons` → Task 9. ✅
- Testes (format/distill) → Tasks 2/3. ✅

**Desvio consciente vs spec:** o spec previa um 3º teste de `LessonStore` sobre um fake store. Removido — a implementação real (`lessons.ts`) é Postgres e segue o padrão sem-unit-test de `runs.ts` (validada no E2E). Os testes de valor ficam em `formatLessons`/`distillLesson` (7 casos). `LessonStore` permanece como contrato/tipo.

**Placeholder scan:** nenhum TODO/TBD; todo passo tem código real e comando com expected.

**Type consistency:** `Lesson`/`LessonSource`/`DistillInput`/`LESSON_CAP` definidos na Task 1 e usados consistentes nas Tasks 3/5/7. `loadLessons: () => Promise<string>` idêntico em `agent.ts`/`GraphDeps`/`CoderDeps`. `lessons: string` (default '') consistente em `jobSchema`/coder body/`CodegenArgs`. `verdictOf` exportado (Task 6 step 1) antes de ser usado (step 4). `schema.LessonRow` definido (Task 4) antes de usado (Task 5).
