# Vector Memory (MAC-45) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar a recuperação de lições (MAC-23) de recência → relevância: embeddar cada lição localmente, indexar com pgvector e recuperar as top-K por similaridade de cosseno para o prompt do codegen, com fallback pra recência.

**Architecture:** Embeddings locais no orchestrator (Transformers.js, `all-MiniLM-L6-v2`, 384 dims, CPU, lazy via dynamic import). Vetores em pgvector (`vector(384)`, cosine `<=>`, índice hnsw). `saveLesson` embeda no write; nova `searchLessons` busca por similaridade; `loadLessons(query)` recebe título+descrição da issue e cai pra `listLessons` (recência) no fallback. Tudo non-fatal.

**Tech Stack:** TypeScript, `@huggingface/transformers`, Drizzle ORM + pgvector (Postgres), Hono, Vitest.

---

## File Structure

**Criar:**
- `apps/orchestrator-api/src/embeddings.ts` — `EMBEDDING_DIM` + `embed()` (Transformers.js lazy).
- `apps/orchestrator-api/src/embeddings.test.ts` — `embed()` retorna 384 dims normalizado.
- `apps/orchestrator-api/drizzle/0008_*.sql` — gerado + editado à mão (extension + hnsw).

**Modificar:**
- `apps/orchestrator-api/src/db/schema.ts` — `customType` vector + coluna `embedding` em `lessons`.
- `apps/orchestrator-api/src/lessons.ts` — embed no `saveLesson`; nova `searchLessons`.
- `apps/orchestrator-api/src/lessons.test.ts` — (se existir) ou novo; fallback de retrieval.
- `apps/orchestrator-api/src/agent.ts` — `loadLessons(query)` com busca semântica + fallback.
- `apps/orchestrator-api/src/routes/lessons.ts` (ou onde mora `GET /lessons`) — `?query=`.
- `packages/graph/src/build.ts` — tipo `loadLessons?: (query: string) => Promise<string>`.
- `packages/graph/src/nodes/coder.ts` — passar título+descrição como query.
- `apps/orchestrator-api/package.json` — dep `@huggingface/transformers`.
- `infra/compose/orchestrator/docker-compose.yml` — imagem `pgvector/pgvector:pg16` + volume/HF cache.
- `apps/mcp-server/src/client.ts` / `tools.ts` / `client.test.ts` / `README.md` — `query?` em list_lessons.

**Nota:** confirmar onde está a rota `GET /lessons` no Step inicial da Task 6 (`grep -rn "/lessons" apps/orchestrator-api/src`).

---

## Task 1: Módulo de embeddings (local)

**Files:**
- Create: `apps/orchestrator-api/src/embeddings.ts`
- Create: `apps/orchestrator-api/src/embeddings.test.ts`
- Modify: `apps/orchestrator-api/package.json`

- [ ] **Step 1: Adicionar a dependência**

Run: `rtk pnpm --filter @agent-platform/orchestrator-api add @huggingface/transformers`
Expected: adiciona `@huggingface/transformers` em `dependencies` do orchestrator-api. Sem erro.

- [ ] **Step 2: Escrever o teste que falha**

Criar `apps/orchestrator-api/src/embeddings.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { EMBEDDING_DIM, embed } from './embeddings.js';

describe('embed', () => {
  // Carrega o modelo (baixa ~80MB na 1ª vez) — precisa de rede no primeiro run.
  it('retorna um vetor de EMBEDDING_DIM normalizado', async () => {
    const v = await embed('corrigir bug de autenticação no login');
    expect(v).toHaveLength(EMBEDDING_DIM);
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1, 1);
  }, 120_000);
});
```

- [ ] **Step 3: Rodar pra ver falhar**

Run: `rtk pnpm exec vitest run apps/orchestrator-api/src/embeddings.test.ts`
Expected: FAIL (`embeddings.js` não existe). NÃO usar `pnpm --filter ... test` (sai 0 silencioso).

- [ ] **Step 4: Implementar `embeddings.ts`**

```ts
/** Dimensão dos embeddings (all-MiniLM-L6-v2). Constante única (vector(384)). */
export const EMBEDDING_DIM = 384;

const MODEL = 'Xenova/all-MiniLM-L6-v2';

// Pipeline carregado sob demanda (lazy) e cacheado no escopo do módulo. O import
// do transformers é dinâmico p/ não pesar quem só precisa de EMBEDDING_DIM.
type Extractor = (text: string, opts: { pooling: 'mean'; normalize: boolean }) => Promise<{ data: Float32Array }>;
let extractorPromise: Promise<Extractor> | null = null;

async function getExtractor(): Promise<Extractor> {
  if (!extractorPromise) {
    extractorPromise = (async () => {
      const { pipeline, env } = await import('@huggingface/transformers');
      // Cache do modelo em volume persistente (ver compose). Default /tmp se ausente.
      env.cacheDir = process.env.HF_HOME ?? '/tmp/hf-cache';
      return (await pipeline('feature-extraction', MODEL)) as unknown as Extractor;
    })();
  }
  return extractorPromise;
}

/** Embeda um texto em um vetor de EMBEDDING_DIM floats (mean-pool + normalizado). */
export async function embed(text: string): Promise<number[]> {
  const extractor = await getExtractor();
  const output = await extractor(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}
```

- [ ] **Step 5: Rodar pra ver passar**

Run: `rtk pnpm exec vitest run apps/orchestrator-api/src/embeddings.test.ts`
Expected: PASS (1 teste; lento na 1ª vez por causa do download do modelo).

- [ ] **Step 6: Build**

Run: `rtk pnpm --filter @agent-platform/orchestrator-api build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
rtk git add apps/orchestrator-api/src/embeddings.ts apps/orchestrator-api/src/embeddings.test.ts apps/orchestrator-api/package.json pnpm-lock.yaml
rtk git commit -m "feat(memory): módulo de embeddings local (Transformers.js, 384 dims) (MAC-45)"
```

---

## Task 2: Schema pgvector + migration

**Files:**
- Modify: `apps/orchestrator-api/src/db/schema.ts`
- Create: `apps/orchestrator-api/drizzle/0008_*.sql` (gerado + editado)
- Modify: `infra/compose/orchestrator/docker-compose.yml`

- [ ] **Step 1: Adicionar o customType `vector` e a coluna `embedding`**

No topo de `schema.ts`, nos imports do `drizzle-orm/pg-core`, garantir `customType` na lista (adicionar se faltar). E importar `EMBEDDING_DIM`:
```ts
import { EMBEDDING_DIM } from '../embeddings.js';
```
(Import barato — `embeddings.ts` só carrega o transformers via dynamic import dentro de `embed()`, então importar a constante não puxa o modelo.)

Definir o tipo custom (antes da tabela `lessons`):
```ts
/** Tipo pgvector para embeddings (MAC-45). number[] ↔ '[1,2,3]' no driver. */
const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return `vector(${EMBEDDING_DIM})`;
  },
  toDriver(value: number[]): string {
    return `[${value.join(',')}]`;
  },
  fromDriver(value: string): number[] {
    return value.slice(1, -1).split(',').map(Number);
  },
});
```

Na tabela `lessons`, adicionar a coluna (nullable):
```ts
  embedding: vector('embedding'),
```

- [ ] **Step 2: Gerar a migration**

Run: `rtk pnpm --filter @agent-platform/orchestrator-api db:generate`
Expected: cria `apps/orchestrator-api/drizzle/0008_*.sql` com `ALTER TABLE "lessons" ADD COLUMN "embedding" vector(384)`. (drizzle-kit NÃO gera `CREATE EXTENSION` nem índice hnsw — editar à mão no próximo passo.)

- [ ] **Step 3: Editar o `.sql` à mão — extension (antes) + índice hnsw (depois)**

Abrir o `0008_*.sql` gerado e deixá-lo exatamente assim (a extension PRECISA vir antes do `ADD COLUMN ... vector`, e o índice hnsw depois):
```sql
CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "embedding" vector(384);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lessons_embedding_hnsw_idx" ON "lessons" USING hnsw ("embedding" vector_cosine_ops);
```
(O índice hnsw não é declarado no schema drizzle — pgvector ops não são expressáveis; fica só na migration. Drift conhecido e aceitável.)

- [ ] **Step 4: Trocar a imagem do Postgres + cache do modelo no compose**

Em `infra/compose/orchestrator/docker-compose.yml`:
- serviço `postgres`: trocar `image: postgres:16-alpine` → `image: pgvector/pgvector:pg16` (mesmo PG16, volume `/opt/agent-platform/postgres` compatível; só adiciona a extensão).
- serviço da API (`api`): adicionar env `HF_HOME: /opt/hf-cache` (estilo map, igual às outras envs do serviço) e um volume `- /opt/agent-platform/hf-cache:/opt/hf-cache` (cache persistente do modelo entre restarts).

- [ ] **Step 5: Build**

Run: `rtk pnpm --filter @agent-platform/orchestrator-api build`
Expected: PASS (customType compila; coluna tipada como `number[] | null`).

- [ ] **Step 6: Commit**

```bash
rtk git add apps/orchestrator-api/src/db/schema.ts apps/orchestrator-api/drizzle/ infra/compose/orchestrator/docker-compose.yml
rtk git commit -m "feat(memory): coluna embedding pgvector + imagem pgvector/HF cache (MAC-45)"
```

---

## Task 3: Indexação — embed no `saveLesson`

**Files:**
- Modify: `apps/orchestrator-api/src/lessons.ts`

- [ ] **Step 1: Importar `embed`**

No topo de `lessons.ts`, adicionar:
```ts
import { embed } from './embeddings.js';
import { logger } from './logger.js';
```
(Conferir se `logger` já está importado; se sim, não duplicar.)

- [ ] **Step 2: Computar o embedding no `saveLesson` (non-fatal)**

Trocar o corpo de `saveLesson` por:
```ts
export async function saveLesson(input: {
  repo: string;
  source: LessonSource;
  text: string;
  runId: string;
  category?: string | null;
}): Promise<void> {
  // MAC-45: indexa a lição com o embedding do texto. Non-fatal: se falhar, grava
  // sem embedding (não perde a lição; não entra na busca semântica).
  let embedding: number[] | null = null;
  try {
    embedding = await embed(input.text);
  } catch (err) {
    logger.warn({ err }, 'embed da lição falhou (gravando sem embedding)');
  }
  await db.insert(schema.lessons).values({
    repo: input.repo,
    source: input.source,
    text: input.text,
    runId: input.runId,
    category: input.category ?? null,
    ...(embedding ? { embedding } : {}),
  });
}
```

- [ ] **Step 3: Build**

Run: `rtk pnpm --filter @agent-platform/orchestrator-api build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
rtk git add apps/orchestrator-api/src/lessons.ts
rtk git commit -m "feat(memory): embeda a lição no saveLesson (indexação) (MAC-45)"
```

---

## Task 4: Busca semântica — `searchLessons`

**Files:**
- Modify: `apps/orchestrator-api/src/lessons.ts`

- [ ] **Step 1: Adicionar imports drizzle necessários**

No import de `drizzle-orm` em `lessons.ts` (hoje `import { desc, eq } from 'drizzle-orm';`), adicionar `and`, `isNotNull`, `sql`:
```ts
import { and, desc, eq, isNotNull, sql } from 'drizzle-orm';
```

- [ ] **Step 2: Implementar `searchLessons`**

Adicionar ao fim de `lessons.ts`:
```ts
/**
 * Lições do repo mais SIMILARES ao embedding da query (MAC-45), via cosine (<=>)
 * do pgvector. Só considera linhas com embedding. Vazio se não houver nenhuma.
 */
export async function searchLessons(
  repo: string,
  queryEmbedding: number[],
  k: number,
): Promise<Lesson[]> {
  const vec = `[${queryEmbedding.join(',')}]`;
  const rows = await db
    .select()
    .from(schema.lessons)
    .where(and(eq(schema.lessons.repo, repo), isNotNull(schema.lessons.embedding)))
    .orderBy(sql`${schema.lessons.embedding} <=> ${vec}::vector`)
    .limit(k);
  return rows.map(toLesson);
}
```
(`${vec}` é parametrizado como texto e convertido com `::vector`. `toLesson` ignora a coluna `embedding`.)

- [ ] **Step 3: Build**

Run: `rtk pnpm --filter @agent-platform/orchestrator-api build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
rtk git add apps/orchestrator-api/src/lessons.ts
rtk git commit -m "feat(memory): searchLessons por similaridade (pgvector cosine) (MAC-45)"
```

---

## Task 5: Integração LangGraph — `loadLessons(query)` + fallback (TDD)

**Files:**
- Modify: `packages/graph/src/build.ts`
- Modify: `packages/graph/src/nodes/coder.ts`
- Modify: `apps/orchestrator-api/src/agent.ts`
- Create: `apps/orchestrator-api/src/loadLessons.test.ts`

- [ ] **Step 1: Atualizar o tipo `loadLessons` no graph**

Em `packages/graph/src/build.ts`, na interface `GraphDeps`:
```ts
  /** Carrega as lições relevantes p/ a query (título+descrição) já formatadas (MAC-23/45). */
  loadLessons?: (query: string) => Promise<string>;
```
Em `packages/graph/src/nodes/coder.ts`, na interface `CoderDeps`:
```ts
  loadLessons?: (query: string) => Promise<string>;
```

- [ ] **Step 2: Passar a query no `coder.ts`**

Em `coder.ts`, trocar a linha (hoje `const lessons = deps.loadLessons ? await deps.loadLessons() : '';`) por:
```ts
      const lessons = deps.loadLessons
        ? await deps.loadLessons(`${state.title}\n${state.description}`)
        : '';
```

- [ ] **Step 3: Extrair `buildLessonLoader` testável em `agent.ts`**

Em `agent.ts`, substituir a definição inline do `loadLessons` (hoje
`const loadLessons = async (): Promise<string> => formatLessons(await listLessons(repo, LESSON_CAP), LESSON_CAP);`)
por uma função exportada + uso. Adicionar imports no topo:
```ts
import { embed } from './embeddings.js';
import { searchLessons } from './lessons.js';
import { logger } from './logger.js';
```
(conferir duplicatas de `logger`/`listLessons`/`formatLessons`/`LESSON_CAP` — já importados).

Adicionar a função exportada (fora de `getAgent`):
```ts
/**
 * MAC-45: recupera lições por relevância (busca semântica) com fallback pra
 * recência (MAC-23). Embeda a query; busca por similaridade; se o embed falhar
 * ou não houver lições embeddadas, usa as mais recentes. Sempre formata (cap+dedup).
 */
export function buildLessonLoader(
  repo: string,
  deps: {
    embed: typeof embed;
    searchLessons: typeof searchLessons;
    listLessons: typeof listLessons;
  } = { embed, searchLessons, listLessons },
) {
  return async (query: string): Promise<string> => {
    try {
      const q = query.trim();
      if (q) {
        const qEmb = await deps.embed(q);
        const hits = await deps.searchLessons(repo, qEmb, LESSON_CAP);
        if (hits.length > 0) return formatLessons(hits, LESSON_CAP);
      }
    } catch (err) {
      logger.warn({ err }, 'busca semântica de lições falhou (fallback recência)');
    }
    return formatLessons(await deps.listLessons(repo, LESSON_CAP), LESSON_CAP);
  };
}
```
Trocar o uso dentro de `getAgent`:
```ts
  const loadLessons = buildLessonLoader(repo);
```

- [ ] **Step 4: Escrever os testes de fallback**

Criar `apps/orchestrator-api/src/loadLessons.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import type { Lesson } from '@agent-platform/memory';
import { buildLessonLoader } from './agent.js';

function lesson(text: string): Lesson {
  return { id: 'x', repo: 'o/r', source: 'critic', text, runId: 'r', createdAt: new Date() };
}

const deps = (over: Partial<Parameters<typeof buildLessonLoader>[1]>) => ({
  embed: vi.fn(async () => [0, 1, 2]),
  searchLessons: vi.fn(async () => [] as Lesson[]),
  listLessons: vi.fn(async () => [lesson('recência A')]),
  ...over,
});

describe('buildLessonLoader', () => {
  it('usa busca semântica quando há hits', async () => {
    const d = deps({ searchLessons: vi.fn(async () => [lesson('semântica X')]) });
    const out = await buildLessonLoader('o/r', d)('corrigir auth');
    expect(out).toBe('- semântica X');
    expect(d.embed).toHaveBeenCalled();
    expect(d.listLessons).not.toHaveBeenCalled();
  });

  it('cai pra recência quando a busca não retorna hits', async () => {
    const d = deps({});
    const out = await buildLessonLoader('o/r', d)('corrigir auth');
    expect(out).toBe('- recência A');
    expect(d.listLessons).toHaveBeenCalled();
  });

  it('cai pra recência quando o embed falha', async () => {
    const d = deps({ embed: vi.fn(async () => { throw new Error('sem modelo'); }) });
    const out = await buildLessonLoader('o/r', d)('corrigir auth');
    expect(out).toBe('- recência A');
  });

  it('cai pra recência quando a query é vazia', async () => {
    const d = deps({});
    const out = await buildLessonLoader('o/r', d)('   ');
    expect(out).toBe('- recência A');
    expect(d.embed).not.toHaveBeenCalled();
  });
});
```

Nota: `agent.ts` importa o transformers só via `embed` (dynamic import lazy) e tem efeitos de top-level? Se `agent.ts` rodar código no import que exija env/DB e quebre o teste, mover `buildLessonLoader` + seus imports para um arquivo próprio `apps/orchestrator-api/src/lessonLoader.ts` e importar de lá no `agent.ts` e no teste. **Decisão padrão: se o teste falhar no import de `agent.ts`, extrair pra `lessonLoader.ts`.** (agent.ts provavelmente puxa muita coisa — preferir extrair desde já: criar `lessonLoader.ts` com `buildLessonLoader`, importar no `agent.ts`, e o teste importa de `./lessonLoader.js`.)

- [ ] **Step 5: Rodar os testes**

Run: `rtk pnpm exec vitest run apps/orchestrator-api/src/loadLessons.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 6: Build do monorepo (graph + orchestrator)**

Run: `rtk pnpm -r build`
Expected: PASS (tipo `loadLessons` propagado em graph + orchestrator).

- [ ] **Step 7: Commit**

```bash
rtk git add packages/graph/src/build.ts packages/graph/src/nodes/coder.ts apps/orchestrator-api/src/agent.ts apps/orchestrator-api/src/lessonLoader.ts apps/orchestrator-api/src/loadLessons.test.ts
rtk git commit -m "feat(memory): loadLessons(query) com busca semântica + fallback recência (MAC-45)"
```
(Incluir `lessonLoader.ts` no add só se a extração foi feita.)

---

## Task 6: REST `?query=` + MCP + suíte completa

**Files:**
- Modify: rota `GET /lessons` (localizar via grep) + cliente/tools MCP + README.

- [ ] **Step 1: Localizar a rota e o handler**

Run: `rtk grep -n "/lessons" apps/orchestrator-api/src`
Ler o handler de `GET /lessons` (provável `apps/orchestrator-api/src/routes/lessons.ts` ou em `runs.ts`/`index.ts`). Confirmar como hoje chama `listLessons(repo, limit)`.

- [ ] **Step 2: Adicionar `?query=` ao handler `GET /lessons`**

No handler, quando `query` (do `?query=`) é não-vazio: embeda e busca semântica; senão, recência. Importar `embed`/`searchLessons`. Forma (adaptar ao handler real):
```ts
  const repo = c.req.query('repo');
  if (!repo) return c.json({ error: 'repo é obrigatório' }, 400); // se já houver, manter
  const limit = /* parse existente */;
  const query = c.req.query('query');
  if (query && query.trim()) {
    try {
      const lessons = await searchLessons(repo, await embed(query), limit);
      return c.json({ lessons });
    } catch (err) {
      logger.warn({ err }, 'busca semântica de lições falhou (fallback recência)');
    }
  }
  return c.json({ lessons: await listLessons(repo, limit) });
```
(Preservar a validação/parse de `repo`/`limit` que já existe no handler.)

- [ ] **Step 3: MCP `list_lessons` ganha `query?`**

Em `apps/mcp-server/src/client.ts`, na interface e impl de `listLessons`, adicionar o param `query`:
```ts
  listLessons(repo: string, limit?: number, query?: string): Promise<unknown>;
```
```ts
    listLessons: (repo, limit, query) => call('GET', `/lessons${query2({ repo, limit, query })}`),
```
ATENÇÃO: o helper de query no client chama-se `query` — renomear a variável do param pra não colidir (ex. `q`), ou usar o helper diretamente. Forma segura:
```ts
    listLessons: (repo, limit, q) => call('GET', `/lessons${query({ repo, limit, query: q })}`),
```
Em `apps/mcp-server/src/tools.ts`, na tool `list_lessons`, adicionar input `query`:
```ts
  server.tool(
    'list_lessons',
    'Lições aprendidas (Memory Layer) de um repo. Com `query`, busca por relevância (semântica); sem, retorna as mais recentes.',
    { repo: z.string(), limit: z.number().int().positive().optional(), query: z.string().optional() },
    ({ repo, limit, query }) => asTool(() => client.listLessons(repo, limit, query)),
  );
```

- [ ] **Step 4: Atualizar o teste do client MCP**

Em `apps/mcp-server/src/client.test.ts`, adicionar um caso:
```ts
  it('listLessons monta query semântica', async () => {
    const f = mockFetch(200, { lessons: [] });
    await createClient(cfg(f)).listLessons('o/r', 5, 'auth bug');
    const call = (f as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0];
    expect(call[0]).toBe('http://orch:3000/lessons?repo=o%2Fr&limit=5&query=auth+bug');
  });
```
(Conferir a ordem/codificação que o helper `query` produz e ajustar a URL esperada ao real — rodar e alinhar.)

- [ ] **Step 5: README do mcp-server**

Atualizar a linha de `list_lessons` em `apps/mcp-server/README.md` mencionando o param `query` (busca semântica).

- [ ] **Step 6: Build + testes mcp-server**

Run: `rtk pnpm --filter @agent-platform/mcp-server build && rtk pnpm exec vitest run apps/mcp-server/src/client.test.ts`
Expected: PASS.

- [ ] **Step 7: Suíte completa (sanity)**

Run: `rtk pnpm -r build && rtk pnpm test`
Expected: PASS (todos; inclui o teste lento do `embed` — precisa de rede na 1ª vez; ~146 + novos do MAC-45: embed 1, loadLessons 4, client 1).

- [ ] **Step 8: Commit**

```bash
rtk git add apps/orchestrator-api/src/routes/lessons.ts apps/mcp-server/src/client.ts apps/mcp-server/src/client.test.ts apps/mcp-server/src/tools.ts apps/mcp-server/README.md
rtk git commit -m "feat(memory): ?query= na busca de lições + MCP list_lessons semântico (MAC-45)"
```
(Ajustar o path da rota ao real localizado no Step 1.)

---

## Deploy + E2E (pós-implementação, rodado pelo usuário)

> Atenção: este deploy MEXE NA IMAGEM DO POSTGRES (`16-alpine` → `pgvector/pgvector:pg16`). Mesmo PG16, volume compatível, mas é o passo de maior cuidado. Backup do volume antes é prudente.

1. **Deploy (host 192.168.0.10):**
   ```bash
   cd ~/agent-platform && git pull && bash infra/deploy/deploy.sh orchestrator
   ```
   Recria o container do Postgres com a imagem pgvector; aplica migrations pendentes (0006 agents + 0007 tools + 0008 vector — `CREATE EXTENSION vector` + coluna + hnsw); sobe a API (1º run baixa o modelo de embedding pro volume `/opt/agent-platform/hf-cache`).
2. **Túnel REST:** `ssh -fN -L 3000:10.10.0.11:3000 root@192.168.0.10`
3. **Verificar:**
   - Postgres com pgvector: `GET /lessons?repo=raniellimontagna/agent-platform` responde (não erra).
   - Indexação: disparar um run que reprove/falhe validação → lição gravada com embedding (checar log `embed`/`lição registrada`; `psql` em `lessons` mostra `embedding` não-nulo).
   - Busca semântica: `GET /lessons?repo=...&query=algum tema` retorna ordenado por relevância.
   - Integração: novo run injeta lições relevantes no codegen (não mais só recentes).
   - Fallback: com `lessons` vazio/sem embedding, run roda normal (recência/sem lições).
4. **Linear:** comentar progresso na MAC-45 + mover pra Done.

---

## Self-Review

**Spec coverage:**
- Embeddings locais (`embed`, 384, lazy, cache) → Task 1. ✅
- pgvector (extension, `vector(384)`, hnsw, imagem, customType) → Task 2. ✅
- Indexação (embed no `saveLesson`, non-fatal) → Task 3. ✅
- Busca semântica (`searchLessons` via `<=>`) → Task 4. ✅
- Integração LangGraph (`loadLessons(query)`, query=título+descrição, fallback) → Task 5. ✅
- REST `?query=` + MCP `query?` → Task 6. ✅
- Error handling (embed non-fatal write + fallback read; nunca derruba) → Tasks 3,5,6. ✅
- Testes (embed 384 normalizado, fallback de retrieval, client MCP) → Tasks 1,5,6. ✅

**Placeholder scan:** os pontos "localizar/adaptar ao real" (rota `/lessons`, URL esperada do client) são instruções de descoberta com forma concreta dada — não placeholders de implementação. Tudo que cria/edita código tem o código.

**Type consistency:** `EMBEDDING_DIM`/`embed` (embeddings.ts), `vector` customType + coluna `embedding` (schema), `searchLessons(repo, number[], k)`/`saveLesson`/`listLessons`/`toLesson` (lessons.ts), `buildLessonLoader(repo, deps)` retornando `(query)=>Promise<string>`, `loadLessons?: (query: string)=>Promise<string>` (build.ts + coder.ts), `listLessons(repo, limit, query?)` (MCP client+tool). Assinaturas batem entre tasks.

**Risco destacado:** migração pgvector (Task 2/3) — extension+hnsw editados à mão; `customType` do drizzle pode gerar/serializar de forma diferente do esperado → validar o `.sql` e o round-trip de `embedding` (insert→select) no E2E. Decisão de extração do `buildLessonLoader` pra `lessonLoader.ts` se `agent.ts` não for importável em teste (Task 5 Step 4).
