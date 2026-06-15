# Vector Memory (MAC-45) — Design

**Data:** 2026-06-15
**Issue:** MAC-45 (Fase 7 — Produção e Escala)
**Status:** aprovado

## Problema

O Memory Layer (MAC-23) recupera lições por **recência**: `listLessons(repo)`
ordena por `created_at` e `formatLessons` faz dedup + cap. Não há relevância — um
run sobre autenticação recebe as 10 lições mais recentes do repo, não as 10 mais
relacionadas ao problema dele. Conforme as lições acumulam, recência degrada.

DoD do card: **indexação**, **busca semântica**, **integração LangGraph**.

## Escopo

Troca a recuperação de lições de **recência → relevância**: embeda cada lição
(indexação), embeda a tarefa atual e recupera as top-K por similaridade de cosseno
(busca semântica), injetando-as no prompt do codegen (integração LangGraph).
Continuação direta do MAC-23 — reusa a tabela `lessons`, o pacote
`@agent-platform/memory` e o wiring `loadLessons`.

Decisões-chave (brainstorm 2026-06-15):
- **Embeddings locais** no orchestrator (Transformers.js, CPU) — sem dependência
  do gateway, sem custo/rede externa. Abstraído atrás de `embed()` p/ troca futura
  (modelo GPU-served / endpoint de embedding do gateway) ser mudança de 1 módulo.
- **pgvector** como vector store (coluna `vector(384)`, cosine `<=>`).

## Arquitetura

### 1. Embeddings — `apps/orchestrator-api/src/embeddings.ts`

Novo módulo. Dependência nova: `@huggingface/transformers` (Transformers.js).

- `EMBEDDING_DIM = 384` (constante única; dimensão do `all-MiniLM-L6-v2`).
- `embed(text: string): Promise<number[]>` — pipeline `feature-extraction` com
  `Xenova/all-MiniLM-L6-v2`, `{ pooling: 'mean', normalize: true }`, retorna array
  de 384 floats. Pipeline **lazy-load** (carrega na 1ª chamada; cacheia o objeto em
  module scope). 1ª carga baixa ~80MB do HF hub via NAT egress → cache em diretório
  persistente (`env.HF_HOME` / volume montado).
- Roda só no orchestrator (WRITE e READ de lições vivem nele; runner intacto).
- Erros (download/inferência) NÃO são tratados aqui — o chamador decide o fallback
  (ver §4). O módulo só expõe `embed`/`EMBEDDING_DIM`.

Config de cache: setar `HF_HOME` (ou `TRANSFORMERS_CACHE`) p/ um path em volume no
container, pra não re-baixar o modelo a cada restart.

### 2. Dados — pgvector (migration `0008_*`)

- **Imagem Postgres:** trocar `postgres:16-alpine` → `pgvector/pgvector:pg16` no
  `infra/compose/orchestrator/docker-compose.yml` (serviço `postgres`). Mesmo PG16,
  volume `/opt/agent-platform/postgres` compatível (sem perda de dados); a imagem só
  adiciona a extensão.
- Migration:
  - `CREATE EXTENSION IF NOT EXISTS vector;`
  - coluna `embedding vector(384)` nullable em `lessons`.
  - índice `CREATE INDEX ... USING hnsw (embedding vector_cosine_ops);`
- Drizzle não tem tipo `vector` nativo → definir `customType` em `db/schema.ts`
  (`number[]` ↔ string `'[1,2,3]'` no driver). **A extensão + o índice hnsw
  provavelmente precisam ser escritos à mão na migration** (drizzle-kit não gera
  `CREATE EXTENSION` nem índice hnsw): gerar com `db:generate` e completar o `.sql`
  à mão. **Ponto de maior risco da implementação** — validar o SQL gerado/editado.

Tipo custom (esboço):
```ts
const vector = customType<{ data: number[]; driverData: string }>({
  dataType() { return `vector(${EMBEDDING_DIM})`; },
  toDriver(v) { return `[${v.join(',')}]`; },
  fromDriver(v) { return (v as string).slice(1, -1).split(',').map(Number); },
});
```

### 3. Indexação (embed no write)

`saveLesson` (apps/orchestrator-api/src/lessons.ts) passa a computar
`embedding = await embed(text)` e gravar na coluna. **Non-fatal:** se `embed`
falhar (try/catch), grava a lição com `embedding NULL` (não perde a lição). Sem
backfill em massa (prod tem `total_lessons=0`); linhas com `embedding NULL` não
participam da busca semântica.

### 4. Busca semântica

Nova `searchLessons(repo: string, queryEmbedding: number[], k: number): Promise<Lesson[]>`
em `lessons.ts`:
```sql
SELECT * FROM lessons
WHERE repo = $1 AND embedding IS NOT NULL
ORDER BY embedding <=> $queryEmbedding
LIMIT $k
```
(`<=>` = distância de cosseno do pgvector; menor = mais similar.)

**Fallback (degrada pro comportamento MAC-23):** se o query-embed falhar OU
`searchLessons` retornar vazio (repo sem lições embeddadas) → usa
`listLessons(repo, k)` (recência). `formatLessons` (dedup + cap) aplicado ao
resultado nos dois caminhos. `k = LESSON_CAP` (10).

### 5. Integração LangGraph

`loadLessons` muda de `() => Promise<string>` para **`(query: string) => Promise<string>`**:
- `apps/orchestrator-api/src/agent.ts`: a closure (por repo) embeda o `query`
  (`embed`, try/catch → fallback), chama `searchLessons(repo, qEmb, LESSON_CAP)`,
  cai pra `listLessons` no fallback, e formata com `formatLessons`.
- `packages/graph/src/build.ts` e `nodes/coder.ts`: atualizar o tipo
  `loadLessons?: (query: string) => Promise<string>`; em `coder.ts` (hoje
  `deps.loadLessons()`), passar o **texto da tarefa = título + descrição da issue**
  como query (disponível no state do grafo desde o planning). O plano fica fora do
  query (o objetivo é casar lição↔problema, não lição↔solução).

### 6. REST + MCP

- `GET /lessons` ganha `?query=` opcional: presente → embeda e faz busca semântica;
  ausente → recência (comportamento atual). Sem rota nova.
- MCP `list_lessons` ganha param `query?` opcional (mapeia pro `?query=`). README
  atualizado.

## Error handling

- `embed()` falha no write → lição salva com `embedding NULL` (não-fatal).
- `embed()` falha no read / sem lições embeddadas → fallback recência (`listLessons`).
- Nunca derruba run nem boot (todos os caminhos de embedding em try/catch no
  chamador).
- 1ª carga do modelo lenta/sem rede → primeira(s) lição(ões)/busca(s) caem no
  fallback até o cache existir.

## Testes

- `embed()`: retorna array de `EMBEDDING_DIM` (384) e normalizado (norma ≈ 1).
  Carrega o modelo → pode ser lento; marcar `it` tolerante (timeout maior) ou
  `it.skip` se rodar offline no CI. ≥1 caso.
- fallback de `loadLessons`/retrieval: query vazio ou `searchLessons` vazio →
  usa `listLessons` (mock de `searchLessons`/`listLessons`/`embed`). ≥2 casos.
- `formatLessons` segue coberto (MAC-23).
- Busca semântica real (ranking por `<=>`) = E2E (precisa do pgvector no banco).

## Fora de escopo

- Re-embed / backfill em massa de lições antigas.
- Troca de modelo de embedding / serving por GPU (card próprio se for self-host LLM).
- Embeddar artifacts / plano / outros textos além de `lessons.text`.
- Busca cross-repo / multi-repo.
- Índice vetorial tunado (ivfflat lists, ef_search) — hnsw default basta no volume atual.
