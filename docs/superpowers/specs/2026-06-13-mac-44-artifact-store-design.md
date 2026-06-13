# Artifact Store — artefatos dos runs (design)

> Spec de design. Data: 2026-06-13. Time `MAC`, projeto *Orquestrador de Agentes com LangGraph*.
> Card: MAC-44 (Fase 7 — Produção e Escala). Único card da Fase 7 com valor standalone no estágio atual (decisão 2026-06-13: continuar agente único).

## Problema

Os artefatos que um run produz — plano, diff (patch), parecer do critic, saída da
validação, resumo — hoje só vivem em **comentários do Linear** (prosa, difícil de
consultar), no **PR do GitHub** e no **checkpoint do LangGraph** (estado interno,
não exposto). Não há um lugar **durável e queryável** para auditar o que um run
gerou depois do fato.

O Artifact Store guarda esses artefatos por run no Postgres e os expõe via REST.

## Decisões (do brainstorm)

1. **Storage:** tabela no Postgres (tudo é texto pequeno; consistente com
   runs/steps/schedules; queryável; zero infra nova). Não R2/filesystem.
2. **Artefatos (5 kinds):** `plan`, `patch` (diff), `review` (critic), `validation`
   (saída dos comandos), `summary`. Todos já existem no estado final do run.
3. **Captura:** no `worker.ts`, ao fim de cada job, não-fatal (try/catch) — igual
   ao padrão de `recordStep`/`saveLesson`.
4. **ON DELETE CASCADE:** apagar o run apaga seus artefatos.
5. **Lista sem content + endpoint separado pro content:** a listagem devolve
   metadados (id/kind/createdAt); o conteúdo (pode ser grande) vem por id.

## Componentes

### 1. Schema (`db/schema.ts` + migration `0004`)

```ts
export const artifactKind = pgEnum('artifact_kind', [
  'plan',
  'patch',
  'review',
  'validation',
  'summary',
]);

export const artifacts = pgTable('artifacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  runId: uuid('run_id')
    .notNull()
    .references(() => runs.id, { onDelete: 'cascade' }),
  kind: artifactKind('kind').notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Artifact = typeof artifacts.$inferSelect;
export type NewArtifact = typeof artifacts.$inferInsert;
```

### 2. Data layer (`artifacts.ts`)

- `type ArtifactKind = (typeof schema.artifactKind.enumValues)[number]`.
- `saveArtifacts(runId: string, parts: Partial<Record<ArtifactKind, string | undefined>>): Promise<void>`
  — insere uma linha por kind cujo valor é **não-vazio** (trim). Map vazio → no-op.
  Insert em lote (uma query) com os kinds presentes.
- `listArtifacts(runId: string)` → `{ id, kind, createdAt }[]` (sem content), por
  `createdAt`.
- `getArtifact(id: string)` → `Artifact | null` (com content).

### 3. Captura no `worker.ts` (não-fatal)

Ao fim do processamento do job (após `recordStep`), num `try/catch` que só loga:
- job **`plan`** → `await saveArtifacts(runId, { plan: result.plan })`.
- job **`resume`** → `await saveArtifacts(runId, {
    patch: result.diff,
    review: result.review,
    validation: result.testSummary,
    summary: result.summary,
  })`.

O split por `job.data.kind` evita duplicar o `plan` (que reaparece no estado final
do resume). Um run parado em `awaiting_approval` ou que falhe no plano ainda guarda
o `plan`. `saveArtifacts` ignora campos vazios, então um resume sem diff/review não
grava lixo.

**Ajuste necessário:** o tipo inline de `result` no `worker.ts` hoje não lista
`plan`/`diff`/`summary`. Adicionar esses campos (`plan?: string; diff?: string;
summary?: string;`) ao tipo local pra acessá-los (o estado do grafo já os tem).

### 4. REST (`routes/artifacts.ts`)

Sem middleware de auth — mesmo padrão da `runsRoute` (rede isolada). Registrada no
`index.ts` (`app.route('/', artifactsRoute)`).
- `GET /runs/:id/artifacts` → `{ artifacts: [{ id, kind, createdAt }] }`.
- `GET /artifacts/:id` → `{ id, runId, kind, content, createdAt }`; 404 se não existe.

## Mapeamento do DoD

- **Logs / Resultados** → `validation` (saída dos comandos) + `summary`.
- **Relatórios** → `plan`, `review`.
- **Patches** → `patch`.

## Escopo / não-objetivos (follow-up)

- Object store (R2) p/ artefatos grandes/binários.
- Tools MCP `list_artifacts`/`get_artifact` (fachada sobre a REST).
- Painel Grafana de artefatos; retenção/expiração; diff entre runs.
- Capturar o relatório consolidado do `report` node (hoje montado inline — exigiria
  o nó devolver o texto no estado).

## Tratamento de erros

- Captura é **não-fatal**: falha ao gravar artefato loga e não derruba o run
  (consistente com lessons/recordStep).
- `getArtifact` inexistente → 404. `listArtifacts` de run sem artefatos → `[]`.
- `saveArtifacts` com map todo vazio → no-op (nenhuma query).

## Testes

- `saveArtifacts`: grava só os kinds não-vazios; ignora vazio/undefined; map vazio
  → não chama insert (mock db no estilo dos testes de rota existentes).
- Rotas: `GET /runs/:id/artifacts` (shape lista), `GET /artifacts/:id` (shape + 404)
  — padrão de `routes/stats.test.ts`/`runs.test.ts` (mock de `artifacts.js`).

## Arquivos prováveis (confirmar no plano)

- `apps/orchestrator-api/src/db/schema.ts` — enum `artifact_kind` + tabela `artifacts`.
- `apps/orchestrator-api/drizzle/0004_*.sql` — migration (drizzle-kit generate).
- `apps/orchestrator-api/src/artifacts.ts` — data layer.
- `apps/orchestrator-api/src/worker.ts` — captura (plan/resume) + ajuste do tipo `result`.
- `apps/orchestrator-api/src/routes/artifacts.ts` — REST + test.
- `apps/orchestrator-api/src/index.ts` — registra a rota.
