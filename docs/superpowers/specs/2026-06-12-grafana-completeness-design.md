# Grafana completo — observabilidade do agente (design)

> Spec de design. Data: 2026-06-12. Time `MAC`, projeto *Orquestrador de Agentes com LangGraph*.
> Estende MAC-35 (Painéis). Card: encaixar em MAC-35 ou criar novo.

## Problema

O Grafana tem um único dashboard ("Agent Platform — Execuções") com 6 painéis
básicos via Postgres (total/completos/falhas, duração média das etapas, runs por
status/hora, tabela de recentes). O banco do orchestrator já guarda muito mais que
não é mostrado:

- `run_steps.cost_usd` — custo por fase (planner/coder/review) do Cost Guard (MAC-40).
- `approvals` — governança (motivo, status, tempo até resolver) do MAC-41.
- `lessons` — memória de feedback (MAC-23), recém-adicionada.

E os sinais de qualidade recém-construídos — `fixAttempts` (self-correction,
MAC-54), `testsPassed` (validação, MAC-29) e o veredito do critic (MAC-18) — **não
estão persistidos** (vivem só no state do grafo e nos comentários do Linear), então
não são graficáveis.

O Prometheus está provisionado e scrapeia orchestrator/gateway/runners, mas o
orchestrator **não expõe `/metrics`** — os targets de app estão down. Instrumentar
Prometheus fica **fora deste escopo**.

## Objetivo

Tornar o Grafana completo a partir do que já está (ou estará) no Postgres:
1. **Persistir** os sinais de qualidade (`tests_passed`, `verdict`, `fix_attempts`)
   na tabela `runs`, para graficá-los.
2. Adicionar **dois dashboards focados** (Custo & Governança; Qualidade & Memória)
   e um painel de taxa de sucesso ao dashboard de Execuções.

## Decisões (do brainstorm)

- **Escopo:** painéis Postgres + persistir qualidade. Sem instrumentação Prometheus,
  sem alerting, sem painel Loki de logs (Loki flapa).
- **Organização:** dashboards focados (3 no total: Execuções, Custo & Governança,
  Qualidade & Memória), não um dashboard monolítico.
- **Persistência:** colunas nullable em `runs` (lar natural — um run, uma linha),
  gravadas no fim do run pelo `worker.ts` (os valores já estão no `result` do grafo).

## Persistência

### Migration — colunas em `runs` (todas nullable)

| Coluna | Tipo | Origem (state ao fim do run) |
|---|---|---|
| `tests_passed` | `boolean` | `result.testsPassed` (MAC-29) |
| `verdict` | `text` | `verdictOf(result.review)` (MAC-18) |
| `fix_attempts` | `integer` | `result.fixAttempts` (MAC-54) |

Nullable: runs antigos não têm os valores; queries filtram `IS NOT NULL`.

### Wiring

- `runs.ts`: `updateRunStatus(runId, status, extra)` ganha campos opcionais no
  `extra`: `testsPassed?`, `verdict?`, `fixAttempts?` (set condicional, como
  `branch`/`prUrl` hoje).
- `worker.ts`: na chamada `updateRunStatus` pós-`graph.invoke` (a que já passa
  `branch`/`prUrl`), inclui `testsPassed: result.testsPassed`,
  `verdict: verdictOf(result.review)`, `fixAttempts: result.fixAttempts`.
  `verdictOf` já é importado (MAC-23). O tipo local de `result` já inclui `review`,
  `testsPassed` (MAC-23) — adicionar `fixAttempts?: number` a esse tipo local.

## Dashboards (todos via datasource `orchestrator_pg`)

### A. Execuções (existente — adiciona 1 painel)
- **+ Stat: Taxa de sucesso** — `completed / total` em %.

### B. Custo & Governança (novo — `cost-governance.json`)
- Stat: **Custo total** — `sum(cost_usd)` de `run_steps`.
- Stat: **Custo 24h** — `sum(cost_usd) where created_at > now()-24h` (referência ao
  limite `AGENT_MAX_COST_PER_DAY_USD`).
- Stat: **Custo médio por run** — `sum(cost_usd) / count(distinct run_id)`.
- Timeseries: **Custo por dia** — `sum(cost_usd) group by date_trunc('day', ...)`.
- Barchart: **Custo por fase** — `sum(cost_usd) group by run_steps.type`.
- Stat: **Aprovações pendentes** — `count(*) from approvals where status='pending'`.
- Stat: **Tempo médio até resolver** — `avg(resolved_at - requested_at)` (resolvidas).
- Piechart: **Aprovações por motivo** — `count group by reason`.
- Table: **Aprovações recentes** — reason, status, requested_at, resolved_by.

### C. Qualidade & Memória (novo — `quality-memory.json`)
- Stat: **Validação verde %** — `tests_passed=true / count(tests_passed not null)`.
- Stat: **Reprovação %** — `verdict ~* 'REPROVADO' / count(verdict not null)`.
- Stat: **% runs com fix** — `fix_attempts>0 / count(fix_attempts not null)`.
- Stat: **Auto-correção que salvou %** — `fix_attempts>0 AND tests_passed=true` sobre
  os que tiveram fix.
- Barchart: **Distribuição de fix_attempts** — `count group by fix_attempts` (0/1/2).
- Stat: **Total de lições** — `count(*) from lessons`.
- Barchart: **Lições por source** — `count group by source` (critic/validation).
- Timeseries: **Lições acumuladas** — cumulativo por dia de `lessons.created_at`.
- Table: **Lições recentes** — repo, source, text, created_at.

## Provisioning

Os dois JSONs novos vão em
`infra/compose/observability/provisioning/dashboards/`. O provider
(`dashboards.yaml`) já carrega todos os `*.json` do diretório — **sem mudança de
config**. Cada JSON segue o formato do `agent-runs.json` existente (mesmo
`schemaVersion`, datasource por `uid: orchestrator_pg`, painéis com `gridPos`).

Deploy: redeploy `orchestrator` (migration via `db:deploy` + persistência) +
`observability` (Grafana recarrega os dashboards).

## Verificação

Dashboards (JSON) e SQL não têm unit test. A verificação é:
- Build do orchestrator (cobre migration + código de persistência).
- **Visual na UI do Grafana** (`ssh -L 8088:10.10.0.13:3000 ...` → http://localhost:8088):
  confirmar que os 3 dashboards renderizam e as queries retornam dados. Esta
  verificação UI também estava pendente para o dashboard atual (MAC-35).

> Nota: os painéis de qualidade só populam para runs NOVOS (pós-migration); runs
> antigos têm as colunas nulas e são filtrados.

## Componentes / arquivos

- `apps/orchestrator-api/src/db/schema.ts` + `drizzle/0002_*.sql` — colunas em `runs`.
- `apps/orchestrator-api/src/runs.ts` — `updateRunStatus` aceita os campos.
- `apps/orchestrator-api/src/worker.ts` — grava os campos no fim do run.
- `infra/compose/observability/provisioning/dashboards/cost-governance.json` (novo).
- `infra/compose/observability/provisioning/dashboards/quality-memory.json` (novo).
- `infra/compose/observability/provisioning/dashboards/agent-runs.json` — +painel sucesso.

## Não-objetivos (YAGNI)

- Instrumentar `/metrics` Prometheus no orchestrator/runner.
- Alerting / notificações.
- Painel Loki de logs (Loki instável).
- Backfill dos campos de qualidade em runs antigos.
