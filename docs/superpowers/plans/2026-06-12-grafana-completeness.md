# Grafana Completeness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persistir os sinais de qualidade (`tests_passed`/`verdict`/`fix_attempts`) na tabela `runs` e adicionar dois dashboards Grafana (Custo & Governança, Qualidade & Memória) + um painel de taxa de sucesso ao de Execuções.

**Architecture:** Os dashboards leem o Postgres do orchestrator (datasource `orchestrator_pg`) via SQL cru, espelhando o `agent-runs.json` existente. A persistência adiciona 3 colunas nullable em `runs`, gravadas no fim do run pelo `worker.ts` a partir do state final do grafo. Provider do Grafana já carrega `*.json` do diretório — sem mudança de config.

**Tech Stack:** Grafana (provisioning JSON), Postgres, Drizzle ORM, TypeScript ESM.

**Referência:** spec `docs/superpowers/specs/2026-06-12-grafana-completeness-design.md`.

---

## File Structure

**Modificar:**
- `apps/orchestrator-api/src/db/schema.ts` — 3 colunas em `runs`.
- `apps/orchestrator-api/drizzle/*` — migration gerada.
- `apps/orchestrator-api/src/runs.ts` — `updateRunStatus` aceita os campos.
- `apps/orchestrator-api/src/worker.ts` — grava os campos no fim do run.
- `infra/compose/observability/provisioning/dashboards/agent-runs.json` — +painel sucesso.

**Criar:**
- `infra/compose/observability/provisioning/dashboards/cost-governance.json`
- `infra/compose/observability/provisioning/dashboards/quality-memory.json`

> Sem unit tests novos (migration/JSON/SQL não são unit-testáveis aqui). Verificação = build + JSON válido + checagem visual na UI (passo de deploy). Total de testes segue 44.

---

## Task 1: Colunas de qualidade em `runs` + `updateRunStatus`

**Files:**
- Modify: `apps/orchestrator-api/src/db/schema.ts`
- Modify: `apps/orchestrator-api/src/runs.ts`
- Create: `apps/orchestrator-api/drizzle/0002_*.sql` (via drizzle-kit)

- [ ] **Step 1: Adicionar as colunas no `schema.ts`** — na definição da tabela `runs` (`export const runs = pgTable('runs', {...})`), após o campo `error: text('error'),` e antes de `createdAt`, adicionar:

```ts
  testsPassed: boolean('tests_passed'),
  verdict: text('verdict'),
  fixAttempts: integer('fix_attempts'),
```

- [ ] **Step 2: Garantir os imports do drizzle** — no topo do `schema.ts`, o import é `import { jsonb, numeric, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';`. Adicionar `boolean` e `integer`:

```ts
import { boolean, integer, jsonb, numeric, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
```

- [ ] **Step 3: Estender `updateRunStatus` no `runs.ts`** — substituir a função inteira por:

```ts
export async function updateRunStatus(
  runId: string,
  status: RunStatus,
  extra?: {
    error?: string;
    branch?: string;
    prUrl?: string;
    testsPassed?: boolean;
    verdict?: string;
    fixAttempts?: number;
  },
): Promise<void> {
  await db
    .update(schema.runs)
    .set({
      status,
      ...(extra?.error ? { error: extra.error } : {}),
      ...(extra?.branch !== undefined ? { branch: extra.branch } : {}),
      ...(extra?.prUrl !== undefined ? { prUrl: extra.prUrl } : {}),
      ...(extra?.testsPassed !== undefined ? { testsPassed: extra.testsPassed } : {}),
      ...(extra?.verdict !== undefined ? { verdict: extra.verdict } : {}),
      ...(extra?.fixAttempts !== undefined ? { fixAttempts: extra.fixAttempts } : {}),
    })
    .where(eq(schema.runs.id, runId));
}
```

- [ ] **Step 4: Gerar a migration**

Run: `rtk pnpm --filter @agent-platform/orchestrator-api db:generate`
Expected: cria `apps/orchestrator-api/drizzle/0002_*.sql` com `ALTER TABLE "runs" ADD COLUMN "tests_passed" boolean`, `... "verdict" text`, `... "fix_attempts" integer`.

- [ ] **Step 5: Conferir + build**

Run: `rtk read apps/orchestrator-api/drizzle/0002_*.sql && rtk pnpm --filter @agent-platform/orchestrator-api build`
Expected: SQL com os 3 ADD COLUMN; build PASS.

- [ ] **Step 6: Commit**

```bash
rtk git add apps/orchestrator-api/src/db/schema.ts apps/orchestrator-api/src/runs.ts apps/orchestrator-api/drizzle
rtk git commit -m "feat(db): persiste tests_passed/verdict/fix_attempts no run (observabilidade)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Gravar os campos de qualidade no fim do run

**Files:**
- Modify: `apps/orchestrator-api/src/worker.ts`

- [ ] **Step 1: Ampliar o tipo local de `result`** — em `worker.ts`, no `let result: { ... };`, adicionar o campo `fixAttempts` (os campos `review`, `testsPassed`, `testSummary` já existem do MAC-23):

```ts
        fixAttempts?: number;
```

- [ ] **Step 2: Gravar os campos no `updateRunStatus`** — localizar a chamada pós-`graph.invoke`:

```ts
      await updateRunStatus(runId, status, {
        branch: result.branch,
        prUrl: result.prUrl,
      });
```

substituir por:

```ts
      await updateRunStatus(runId, status, {
        branch: result.branch,
        prUrl: result.prUrl,
        testsPassed: result.testsPassed,
        verdict: result.review ? verdictOf(result.review) : undefined,
        fixAttempts: result.fixAttempts,
      });
```

> `verdictOf` já está importado em `worker.ts` (MAC-23). `verdict` fica `undefined` (→ coluna nula) quando não houve revisão, para não poluir a "Reprovação %" com runs sem critic.

- [ ] **Step 3: Build do orchestrator**

Run: `rtk pnpm --filter @agent-platform/orchestrator-api build`
Expected: PASS.

- [ ] **Step 4: Suite (nada regrediu)**

Run: `rtk vitest run`
Expected: PASS — 44 testes.

- [ ] **Step 5: Commit**

```bash
rtk git add apps/orchestrator-api/src/worker.ts
rtk git commit -m "feat(worker): grava qualidade do run (validação/veredito/fix) p/ Grafana

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Painel de taxa de sucesso em Execuções

**Files:**
- Modify: `infra/compose/observability/provisioning/dashboards/agent-runs.json`

- [ ] **Step 1: Adicionar o painel** — no array `"panels"` do `agent-runs.json`, após o último painel (id 6, "Execuções recentes"), adicionar uma vírgula depois do `}` desse painel e inserir:

```json
    {
      "id": 7,
      "title": "Taxa de sucesso (%)",
      "type": "stat",
      "datasource": { "type": "postgres", "uid": "orchestrator_pg" },
      "fieldConfig": {
        "defaults": { "unit": "percent", "color": { "mode": "thresholds" }, "thresholds": { "mode": "absolute", "steps": [ { "color": "red", "value": null }, { "color": "yellow", "value": 50 }, { "color": "green", "value": 80 } ] } },
        "overrides": []
      },
      "gridPos": { "h": 4, "w": 6, "x": 0, "y": 22 },
      "targets": [
        {
          "refId": "A",
          "format": "table",
          "rawQuery": true,
          "rawSql": "SELECT round(100.0 * count(*) FILTER (WHERE status = 'completed') / NULLIF(count(*), 0), 1) AS taxa FROM runs;"
        }
      ]
    }
```

- [ ] **Step 2: Validar o JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('infra/compose/observability/provisioning/dashboards/agent-runs.json','utf8')); console.log('ok')"`
Expected: `ok`.

- [ ] **Step 3: Commit**

```bash
rtk git add infra/compose/observability/provisioning/dashboards/agent-runs.json
rtk git commit -m "feat(grafana): painel de taxa de sucesso no dashboard de Execuções

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Dashboard "Custo & Governança"

**Files:**
- Create: `infra/compose/observability/provisioning/dashboards/cost-governance.json`

- [ ] **Step 1: Criar o arquivo** — `infra/compose/observability/provisioning/dashboards/cost-governance.json`:

```json
{
  "uid": "cost-governance",
  "title": "Agent Platform — Custo & Governança",
  "tags": ["agent-platform"],
  "timezone": "browser",
  "schemaVersion": 39,
  "version": 1,
  "refresh": "30s",
  "time": { "from": "now-30d", "to": "now" },
  "panels": [
    {
      "id": 1,
      "title": "Custo total (USD)",
      "type": "stat",
      "datasource": { "type": "postgres", "uid": "orchestrator_pg" },
      "fieldConfig": { "defaults": { "unit": "currencyUSD", "decimals": 4 }, "overrides": [] },
      "gridPos": { "h": 4, "w": 6, "x": 0, "y": 0 },
      "targets": [
        { "refId": "A", "format": "table", "rawQuery": true, "rawSql": "SELECT round(coalesce(sum(cost_usd), 0)::numeric, 4) AS total FROM run_steps;" }
      ]
    },
    {
      "id": 2,
      "title": "Custo 24h (USD)",
      "type": "stat",
      "datasource": { "type": "postgres", "uid": "orchestrator_pg" },
      "fieldConfig": { "defaults": { "unit": "currencyUSD", "decimals": 4 }, "overrides": [] },
      "gridPos": { "h": 4, "w": 6, "x": 6, "y": 0 },
      "targets": [
        { "refId": "A", "format": "table", "rawQuery": true, "rawSql": "SELECT round(coalesce(sum(cost_usd), 0)::numeric, 4) AS custo_24h FROM run_steps WHERE created_at > now() - interval '24 hours';" }
      ]
    },
    {
      "id": 3,
      "title": "Custo médio por run (USD)",
      "type": "stat",
      "datasource": { "type": "postgres", "uid": "orchestrator_pg" },
      "fieldConfig": { "defaults": { "unit": "currencyUSD", "decimals": 4 }, "overrides": [] },
      "gridPos": { "h": 4, "w": 6, "x": 12, "y": 0 },
      "targets": [
        { "refId": "A", "format": "table", "rawQuery": true, "rawSql": "SELECT round((coalesce(sum(cost_usd), 0) / NULLIF(count(DISTINCT run_id), 0))::numeric, 4) AS media FROM run_steps;" }
      ]
    },
    {
      "id": 4,
      "title": "Aprovações pendentes",
      "type": "stat",
      "datasource": { "type": "postgres", "uid": "orchestrator_pg" },
      "fieldConfig": { "defaults": { "color": { "mode": "fixed", "fixedColor": "orange" } }, "overrides": [] },
      "gridPos": { "h": 4, "w": 6, "x": 18, "y": 0 },
      "targets": [
        { "refId": "A", "format": "table", "rawQuery": true, "rawSql": "SELECT count(*) AS pendentes FROM approvals WHERE status = 'pending';" }
      ]
    },
    {
      "id": 5,
      "title": "Custo por dia (USD)",
      "type": "timeseries",
      "datasource": { "type": "postgres", "uid": "orchestrator_pg" },
      "gridPos": { "h": 8, "w": 12, "x": 0, "y": 4 },
      "targets": [
        { "refId": "A", "format": "time_series", "rawQuery": true, "rawSql": "SELECT date_trunc('day', created_at) AS time, sum(cost_usd) AS value FROM run_steps WHERE $__timeFilter(created_at) GROUP BY 1 ORDER BY 1;" }
      ]
    },
    {
      "id": 6,
      "title": "Custo por fase (USD)",
      "type": "barchart",
      "datasource": { "type": "postgres", "uid": "orchestrator_pg" },
      "gridPos": { "h": 8, "w": 12, "x": 12, "y": 4 },
      "targets": [
        { "refId": "A", "format": "table", "rawQuery": true, "rawSql": "SELECT type AS metric, round(coalesce(sum(cost_usd), 0)::numeric, 4) AS value FROM run_steps GROUP BY type ORDER BY value DESC;" }
      ]
    },
    {
      "id": 7,
      "title": "Aprovações por motivo",
      "type": "piechart",
      "datasource": { "type": "postgres", "uid": "orchestrator_pg" },
      "gridPos": { "h": 8, "w": 12, "x": 0, "y": 12 },
      "targets": [
        { "refId": "A", "format": "table", "rawQuery": true, "rawSql": "SELECT reason AS metric, count(*) AS value FROM approvals GROUP BY reason ORDER BY value DESC;" }
      ]
    },
    {
      "id": 8,
      "title": "Tempo médio até resolver (min)",
      "type": "stat",
      "datasource": { "type": "postgres", "uid": "orchestrator_pg" },
      "fieldConfig": { "defaults": { "decimals": 1 }, "overrides": [] },
      "gridPos": { "h": 8, "w": 12, "x": 12, "y": 12 },
      "targets": [
        { "refId": "A", "format": "table", "rawQuery": true, "rawSql": "SELECT round((avg(extract(epoch FROM (resolved_at - requested_at))) / 60)::numeric, 1) AS minutos FROM approvals WHERE resolved_at IS NOT NULL;" }
      ]
    },
    {
      "id": 9,
      "title": "Aprovações recentes",
      "type": "table",
      "datasource": { "type": "postgres", "uid": "orchestrator_pg" },
      "gridPos": { "h": 8, "w": 24, "x": 0, "y": 20 },
      "targets": [
        { "refId": "A", "format": "table", "rawQuery": true, "rawSql": "SELECT requested_at, reason, status, resolved_by, resolved_at FROM approvals ORDER BY requested_at DESC LIMIT 50;" }
      ]
    }
  ]
}
```

- [ ] **Step 2: Validar o JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('infra/compose/observability/provisioning/dashboards/cost-governance.json','utf8')); console.log('ok')"`
Expected: `ok`.

- [ ] **Step 3: Commit**

```bash
rtk git add infra/compose/observability/provisioning/dashboards/cost-governance.json
rtk git commit -m "feat(grafana): dashboard Custo & Governança (cost-governance)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Dashboard "Qualidade & Memória"

**Files:**
- Create: `infra/compose/observability/provisioning/dashboards/quality-memory.json`

- [ ] **Step 1: Criar o arquivo** — `infra/compose/observability/provisioning/dashboards/quality-memory.json`:

```json
{
  "uid": "quality-memory",
  "title": "Agent Platform — Qualidade & Memória",
  "tags": ["agent-platform"],
  "timezone": "browser",
  "schemaVersion": 39,
  "version": 1,
  "refresh": "30s",
  "time": { "from": "now-30d", "to": "now" },
  "panels": [
    {
      "id": 1,
      "title": "Validação verde (%)",
      "type": "stat",
      "datasource": { "type": "postgres", "uid": "orchestrator_pg" },
      "fieldConfig": { "defaults": { "unit": "percent", "color": { "mode": "thresholds" }, "thresholds": { "mode": "absolute", "steps": [ { "color": "red", "value": null }, { "color": "yellow", "value": 50 }, { "color": "green", "value": 80 } ] } }, "overrides": [] },
      "gridPos": { "h": 4, "w": 6, "x": 0, "y": 0 },
      "targets": [
        { "refId": "A", "format": "table", "rawQuery": true, "rawSql": "SELECT round(100.0 * count(*) FILTER (WHERE tests_passed) / NULLIF(count(*) FILTER (WHERE tests_passed IS NOT NULL), 0), 1) AS pct FROM runs;" }
      ]
    },
    {
      "id": 2,
      "title": "Reprovação do critic (%)",
      "type": "stat",
      "datasource": { "type": "postgres", "uid": "orchestrator_pg" },
      "fieldConfig": { "defaults": { "unit": "percent", "color": { "mode": "fixed", "fixedColor": "red" } }, "overrides": [] },
      "gridPos": { "h": 4, "w": 6, "x": 6, "y": 0 },
      "targets": [
        { "refId": "A", "format": "table", "rawQuery": true, "rawSql": "SELECT round(100.0 * count(*) FILTER (WHERE verdict ~* 'REPROVADO') / NULLIF(count(*) FILTER (WHERE verdict IS NOT NULL), 0), 1) AS pct FROM runs;" }
      ]
    },
    {
      "id": 3,
      "title": "Runs que precisaram de fix (%)",
      "type": "stat",
      "datasource": { "type": "postgres", "uid": "orchestrator_pg" },
      "fieldConfig": { "defaults": { "unit": "percent" }, "overrides": [] },
      "gridPos": { "h": 4, "w": 6, "x": 12, "y": 0 },
      "targets": [
        { "refId": "A", "format": "table", "rawQuery": true, "rawSql": "SELECT round(100.0 * count(*) FILTER (WHERE fix_attempts > 0) / NULLIF(count(*) FILTER (WHERE fix_attempts IS NOT NULL), 0), 1) AS pct FROM runs;" }
      ]
    },
    {
      "id": 4,
      "title": "Auto-correção que salvou (%)",
      "type": "stat",
      "datasource": { "type": "postgres", "uid": "orchestrator_pg" },
      "fieldConfig": { "defaults": { "unit": "percent", "color": { "mode": "fixed", "fixedColor": "green" } }, "overrides": [] },
      "gridPos": { "h": 4, "w": 6, "x": 18, "y": 0 },
      "targets": [
        { "refId": "A", "format": "table", "rawQuery": true, "rawSql": "SELECT round(100.0 * count(*) FILTER (WHERE fix_attempts > 0 AND tests_passed) / NULLIF(count(*) FILTER (WHERE fix_attempts > 0), 0), 1) AS pct FROM runs;" }
      ]
    },
    {
      "id": 5,
      "title": "Distribuição de fix_attempts",
      "type": "barchart",
      "datasource": { "type": "postgres", "uid": "orchestrator_pg" },
      "gridPos": { "h": 8, "w": 12, "x": 0, "y": 4 },
      "targets": [
        { "refId": "A", "format": "table", "rawQuery": true, "rawSql": "SELECT fix_attempts::text AS metric, count(*) AS value FROM runs WHERE fix_attempts IS NOT NULL GROUP BY fix_attempts ORDER BY fix_attempts;" }
      ]
    },
    {
      "id": 6,
      "title": "Lições por source",
      "type": "barchart",
      "datasource": { "type": "postgres", "uid": "orchestrator_pg" },
      "gridPos": { "h": 8, "w": 12, "x": 12, "y": 4 },
      "targets": [
        { "refId": "A", "format": "table", "rawQuery": true, "rawSql": "SELECT source AS metric, count(*) AS value FROM lessons GROUP BY source ORDER BY value DESC;" }
      ]
    },
    {
      "id": 7,
      "title": "Total de lições",
      "type": "stat",
      "datasource": { "type": "postgres", "uid": "orchestrator_pg" },
      "gridPos": { "h": 4, "w": 6, "x": 0, "y": 12 },
      "targets": [
        { "refId": "A", "format": "table", "rawQuery": true, "rawSql": "SELECT count(*) AS total FROM lessons;" }
      ]
    },
    {
      "id": 8,
      "title": "Lições acumuladas",
      "type": "timeseries",
      "datasource": { "type": "postgres", "uid": "orchestrator_pg" },
      "gridPos": { "h": 8, "w": 18, "x": 6, "y": 12 },
      "targets": [
        { "refId": "A", "format": "time_series", "rawQuery": true, "rawSql": "SELECT d AS time, sum(c) OVER (ORDER BY d) AS value FROM (SELECT date_trunc('day', created_at) AS d, count(*) AS c FROM lessons GROUP BY 1) s ORDER BY d;" }
      ]
    },
    {
      "id": 9,
      "title": "Lições recentes",
      "type": "table",
      "datasource": { "type": "postgres", "uid": "orchestrator_pg" },
      "gridPos": { "h": 8, "w": 24, "x": 0, "y": 20 },
      "targets": [
        { "refId": "A", "format": "table", "rawQuery": true, "rawSql": "SELECT created_at, repo, source, text FROM lessons ORDER BY created_at DESC LIMIT 50;" }
      ]
    }
  ]
}
```

- [ ] **Step 2: Validar o JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('infra/compose/observability/provisioning/dashboards/quality-memory.json','utf8')); console.log('ok')"`
Expected: `ok`.

- [ ] **Step 3: Commit**

```bash
rtk git add infra/compose/observability/provisioning/dashboards/quality-memory.json
rtk git commit -m "feat(grafana): dashboard Qualidade & Memória (quality-memory)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Verificação final + docs

**Files:**
- Modify: `docs/ARCHITECTURE.md`

- [ ] **Step 1: Build + testes + validar os 3 JSONs**

Run:
```bash
rtk pnpm -r build && rtk vitest run && for f in infra/compose/observability/provisioning/dashboards/*.json; do node -e "JSON.parse(require('fs').readFileSync('$f','utf8'))" && echo "ok $f"; done
```
Expected: build PASS; 44 testes PASS; `ok` para os 3 dashboards (agent-runs, cost-governance, quality-memory).

- [ ] **Step 2: Atualizar `docs/ARCHITECTURE.md`** — na tabela §3, linha "Observabilidade (painéis, registro)", trocar o conteúdo da coluna Estado para:

```
| Observabilidade (painéis, registro) | MAC-35/36 | `infra/compose/observability/provisioning/`, `apps/orchestrator-api` (runs/steps) | registro ✅; 3 dashboards (Execuções, Custo & Governança, Qualidade & Memória) — verificar UI |
```

- [ ] **Step 3: Commit + push**

```bash
rtk git add docs/ARCHITECTURE.md
rtk git commit -m "docs(architecture): 3 dashboards Grafana (custo/governança/qualidade/memória)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
rtk git push
```

---

## Deploy + verificação (pós-merge, host Proxmox — o usuário roda)

1. **Redeploy `orchestrator`** (`bash infra/deploy/deploy.sh orchestrator`) — aplica a migration `0002` (colunas) + a persistência.
2. **Redeploy `observability`** (`bash infra/deploy/deploy.sh observability`) — Grafana recarrega os dashboards (provider lê `*.json` a cada 30s; redeploy garante).
3. **Verificar na UI** (`ssh -L 8088:10.10.0.13:3000 root@192.168.0.10` → http://localhost:8088, pasta "Agent Platform"): os 3 dashboards renderizam; queries retornam dados. Custo/aprovações populam de runs existentes; qualidade (validação/fix/veredito) só popula para runs NOVOS pós-migration.

---

## Self-Review

**Spec coverage:**
- Persistir tests_passed/verdict/fix_attempts em `runs` → Tasks 1/2. ✅
- `updateRunStatus` aceita os campos, gravados no fim do run → Tasks 1/2. ✅
- `verdict` nulo quando não há review → Task 2 (`result.review ? verdictOf(...) : undefined`). ✅
- Dashboard Execuções +taxa de sucesso → Task 3. ✅
- Dashboard Custo & Governança (custo total/24h/médio/dia/fase, aprovações pendentes/motivo/tempo/recentes) → Task 4. ✅
- Dashboard Qualidade & Memória (validação%, reprovação%, %fix, fix-salvou%, distribuição fix, lições total/source/acumulado/recentes) → Task 5. ✅
- Provisioning sem mudar config (provider já lê *.json) → Tasks 4/5 só adicionam JSONs. ✅
- Verificação build + UI → Task 6 + seção de deploy. ✅

**Placeholder scan:** nenhum TODO/TBD; JSON e SQL completos; comandos com expected.

**Type consistency:** colunas `testsPassed`/`verdict`/`fixAttempts` (camelCase no Drizzle → snake_case no banco `tests_passed`/`verdict`/`fix_attempts`) consistentes entre `schema.ts` (Task 1), `updateRunStatus` (Task 1), `worker.ts` (Task 2) e o SQL dos dashboards (Tasks 4/5 usam os nomes de coluna do banco). `run_steps.cost_usd`/`type`/`created_at`/`run_id` e `approvals.reason`/`status`/`requested_at`/`resolved_at`/`resolved_by` e `lessons.source`/`repo`/`text`/`created_at` conferem com os schemas existentes.

**Desvio conhecido:** painéis de qualidade ficam vazios até existir um run novo pós-migration (colunas nulas em runs antigos, filtradas por `IS NOT NULL`). Documentado na seção de deploy.
