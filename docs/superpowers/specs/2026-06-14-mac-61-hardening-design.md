# Hardening — follow-ups da Fase 6/7 (design)

> Spec de design. Data: 2026-06-14. Time `MAC`, projeto *Orquestrador de Agentes com LangGraph*.
> Card: MAC-61. Consolida débitos não-bloqueantes dos reviews de MAC-38/39/44.

## Problema

Os reviews finais das features desta leva apontaram débitos pequenos, todos
não-bloqueantes mas reais. Em vez de espalhar, consolidados num único passe de
hardening (code-only, sem feature nova, uma migration).

## Itens (4, independentes)

### 1. Artifacts — índice + unique (MAC-44)

- `artifacts.run_id` não tem índice (FK no Postgres não cria índice automático);
  `listArtifacts` faz `WHERE run_id = $1` → seq scan.
- Sem unique em `(run_id, kind)` — nada no banco impede 2 artefatos do mesmo kind
  por run.

**Fix:** índice em `run_id` + **unique `(run_id, kind)`**. Reforça na borda do banco
o "1 artefato por kind/run" (o no-dup do plan). A tabela ainda não existe em prod
(migration 0004 não deployada) → sem dado legado a violar. Interação com retry de
job: BullMQ pode re-rodar o handler → `saveArtifacts` re-insere → violação de unique
cai no `try/catch` **não-fatal** já existente no worker (sem dup, sem crash).

### 2. Scheduler overlap guard — índice único parcial (MAC-38/39)

`hasActiveRunForSchedule` é check-then-act sem lock; dois disparos quase
simultâneos do mesmo schedule podem ambos passar e criar 2 runs.

**Fix:** índice único parcial em `runs(schedule_id)` restrito aos status ativos:
```sql
CREATE UNIQUE INDEX runs_active_schedule_uq
  ON runs (schedule_id)
  WHERE status IN ('pending','planning','awaiting_approval','executing','reviewing');
```
- `schedule_id` NULL (runs do webhook) é distinto em unique do Postgres → **webhook
  não é afetado** (vários NULLs convivem).
- **Comportamento aprovado:** o fire perdedor da corrida **falha limpo** — o 2º
  `createRun` viola a constraint e lança; o job daquele disparo é marcado falho pelo
  BullMQ; nenhum run duplicado é criado. O `hasActiveRunForSchedule` permanece como
  guarda barata de 1ª linha (cobre o caso comum sem nem tentar o insert).

### 3. Artifacts 404 (MAC-44)

`GET /runs/:id/artifacts` devolve `[]` para run inexistente — não distingue "run não
existe" de "run sem artefatos". As outras rotas (`GET /runs/:id`) dão 404.

**Fix:** o handler chama `getRun(id)` primeiro; não existe → 404. Run existente sem
artefatos → `[]` (mantém).

### 4. Coder baseBranch configurável (MAC-39 follow-up)

O nó `coder` monta o body do job com `baseBranch: 'main'` **hardcoded**, enquanto o
nó `pr` já usa `deps.baseBranch` (configurável via `GraphDeps.baseBranch`). Se
`baseBranch` for sobrescrito, coder e PR divergem (clone/diff numa base, PR em outra).

**Fix:** `CoderDeps` ganha `baseBranch: string`; o coder usa `deps.baseBranch`;
`build.ts` passa `baseBranch: deps.baseBranch ?? 'main'` ao `coderDeps` (mesmo
default já usado pelo PR node). Sem mudança de comportamento no caso default (`main`).

## Componentes / arquivos

- `apps/orchestrator-api/src/db/schema.ts` — 3º arg (callback de índices) nas tabelas
  `artifacts` (índice `run_id` + unique `(run_id, kind)`) e `runs` (unique parcial
  `schedule_id` WHERE ativo). Imports novos: `index`, `uniqueIndex` de
  `drizzle-orm/pg-core`; `sql` de `drizzle-orm` (para o `WHERE` do parcial).
- `apps/orchestrator-api/drizzle/0005_*.sql` — migration (drizzle-kit generate).
  **Verificar** que o SQL gerado inclui o `WHERE` do índice parcial; se o
  drizzle-kit 0.30/0.38 não emitir o predicado, hand-editar o 0005 pra incluir o
  `WHERE status IN (...)`.
- `apps/orchestrator-api/src/routes/artifacts.ts` — 404 via `getRun`.
- `apps/orchestrator-api/src/routes/artifacts.test.ts` — caso 404 (run inexistente)
  + caso existente (lista). Mock de `getRun`.
- `packages/graph/src/nodes/coder.ts` — `CoderDeps.baseBranch` + uso no body.
- `packages/graph/src/build.ts` — passa `baseBranch` ao `coderDeps`.

## Escopo / não-objetivos

- Nenhuma feature nova; nenhuma mudança de comportamento além dos 4 fixes.
- Sem retenção/expiração de artefatos, sem tools MCP — seguem como follow-up.
- Sem deploy aqui (migration 0005 entra no próximo redeploy do orchestrator).

## Tratamento de erros

- Unique de artifacts violado por retry → engolido pelo `try/catch` não-fatal do
  worker (já existe).
- Unique parcial do scheduler violado pelo fire perdedor → job falha (BullMQ);
  sem run duplicado. Aceito.
- `GET /runs/:id/artifacts` com run inexistente → 404.

## Testes

- `routes/artifacts.test.ts`: run inexistente → 404 (`getRun` mock → null); run
  existente → lista (`getRun` mock → row, `listArtifacts` mock → array).
- Migrations (índices/unique): verificadas por `db:generate` (SQL correto) + build.
- baseBranch: build cobre o tipo; opcional um teste de que o coder usa `deps.baseBranch`.

## Deploy (nota, fora daqui)

Redeploy `orchestrator` aplica `0005` (junto de 0003/0004 ainda pendentes). Runners
não mudam. O índice único parcial é criado sobre a tabela `runs` existente — em prod
pode haver runs ativos; se houver >1 run ativo pré-existente para um mesmo
`schedule_id` (improvável, scheduler nem deployado), o `CREATE UNIQUE INDEX` falha e
exige limpeza manual. Como o scheduler ainda não rodou em prod, não há
`schedule_id` preenchido → criação limpa.
