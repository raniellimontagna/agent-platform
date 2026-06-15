# Multi-Agent Execution (MAC-47) — Design

**Data:** 2026-06-15
**Issue:** MAC-47 (Fase 7 — Produção e Escala)
**Status:** aprovado

## Problema

O worker do agente (`new Worker(...)` em `apps/orchestrator-api/src/worker.ts`)
roda sem opção `concurrency` → BullMQ usa o default **1**: runs são processados
estritamente em sequência. Um run longo (codegen + validação + revisão) bloqueia
todos os outros na fila. Não há execução paralela, nem coordenação/limites/
observabilidade dela.

DoD do card: **coordenação**, **limites**, **observabilidade**.

## Escopo

**Execução paralela de runs (bounded).** O worker passa a processar N runs
simultâneos (concorrência configurável), com coordenação (sem colisão de issue/
branch/runner), limites (max concorrência + cost guard existente) e
observabilidade (o que roda agora + utilização). Aterrado no que já existe
(BullMQ, runs, MAC-39 worker manager, cost guard).

**Fora de escopo (não há demanda real):** seleção/roteamento de agente por
capacidade (só há 1 agente no registry — trivial; `agent_id` por run já entregue
no MAC-42), fan-out de sub-agentes dentro de um run, autoscaling de runners, fila
por-agente. `AGENT_MAX_CONCURRENCY` é global, não por-agente.

## Arquitetura

### 1. Limites — concorrência configurável

- Env nova `AGENT_MAX_CONCURRENCY` (`z.coerce.number().default(3)`) em `env.ts` +
  `.env.example` + lista `environment:` do compose do orchestrator (gotcha
  conhecido: env nova precisa entrar na lista).
- Em `worker.ts`, passar `{ connection, concurrency: env.AGENT_MAX_CONCURRENCY }`
  ao `new Worker(AGENT_QUEUE, ...)`. Default 3 = paralelismo modesto p/ 1 runner;
  `1` reproduz o comportamento atual (retrocompat).
- O `scheduleWorker` NÃO muda (continua concorrência 1 — disparos cron são leves).
- Cost guard (por-run `AGENT_MAX_COST_PER_RUN_USD` + 24h `AGENT_MAX_COST_PER_DAY_USD`)
  já limita gasto; reusado sem mudança — é o "limite" de recurso além da concorrência.

### 2. Coordenação

Paralelo já é seguro pelos guards existentes — confirmados, sem mudança:
- **Branch única por run** (MAC-25): `agent/<issue>-<slug>-<shortRunId>` → sem
  colisão de push/PR entre runs paralelos.
- **thread_id separado** por run no checkpointer Postgres → estados isolados.
- **Worktree efêmero por job** no runner (MAC-27) → jobs paralelos não se pisam;
  o pnpm store é content-addressed (seguro concorrente).
- **Dispatch com health/failover** (MAC-39): round-robin entre `RUNNER_BASE_URLS`
  espalha a carga; o runner (Node HTTP) atende `/jobs/sync` concorrente.

**Reforço novo — dedup de issue à prova de concorrência:**
- Migration `0009`: índice único parcial
  `unique(linear_issue_id) WHERE status in (ativos)` em `runs` (espelha o
  `runs_active_schedule_uq` do MAC-61). Fecha a race de 2 webhooks simultâneos da
  MESMA issue criarem 2 runs — hoje só há o check-then-act `hasActiveRunForIssue`,
  que a concorrência torna mais frágil.
- O handler do webhook (`routes/webhooks.ts`) trata a violação do índice no
  `createRun` como "já existe run ativo": captura via `isUniqueViolation`
  (helper compartilhado — ver §4), responde `{ ok: true, skipped: true,
  reason: 'active run exists' }`, NÃO 500. O check `hasActiveRunForIssue` prévio
  permanece (fast-path; o índice é o backstop).

Os status ativos reusam `ACTIVE_STATUSES` de `runs.ts`
(`pending/planning/awaiting_approval/executing/reviewing`).

### 3. Observabilidade

- **REST:** `GET /admin/concurrency` (bearer `RUNNER_AUTH_TOKEN`, igual às outras
  rotas admin) → `{ limit, active, byStatus }`:
  - `limit` = `env.AGENT_MAX_CONCURRENCY`.
  - `active` = nº de runs em status ativo (`ACTIVE_STATUSES`).
  - `byStatus` = contagem por status (todos).
  Data layer: nova `countRunsByStatus(): Promise<Record<RunStatus, number>>` em
  `runs.ts` (group by status). `active` derivado da soma dos ativos.
- **MCP:** tool read-only `agent_concurrency` → mapeia `GET /admin/concurrency`.
  README do mcp-server atualizado.
- **Grafana:** painel no dashboard existente `agent-runs.json` (datasource
  `orchestrator_pg`): gauge "Runs ativos" (count de runs em status ativo).
  Postgres-only, padrão dos outros painéis. (Utilização vs limite não dá pra
  cruzar no SQL — o limite é env; fica só o gauge de ativos.)

### 4. Util compartilhado — `isUniqueViolation`

Hoje `isUniqueViolation` (checa pg code `23505`) está duplicado em `agents.ts` e
`tools.ts`. Extrair para `apps/orchestrator-api/src/db/pgError.ts`
(`isUniqueViolation(err): boolean`) e reusar nos 3 pontos (agents, tools,
webhook handler). DRY + um lugar só pra evoluir.

## Error handling

- `createRun` viola o índice de dedup → webhook captura via `isUniqueViolation` →
  resposta `skipped` (não 500).
- `/admin/concurrency` sem bearer → 401 (igual `/admin/*`).
- Concorrência não muda a semântica de retry do BullMQ — o checkpointer do
  LangGraph retoma do último nó (efeitos colaterais não repetem); `attempts:2`
  segue válido por run.

## Testes

- env: `AGENT_MAX_CONCURRENCY` default 3 + coerção de string (≥1 caso — no teste
  de env existente, se houver; senão um foco em `env.ts`).
- `isUniqueViolation`: true p/ `{code:'23505'}`, false p/ outros/non-obj (≥2 casos)
  — movido pro `pgError.ts`, teste em `pgError.test.ts`.
- `GET /admin/concurrency`: shape `{limit, active, byStatus}` (mock de
  `countRunsByStatus` + `env`); 401 sem bearer (≥2 casos).
- webhook dedup: `createRun` lança unique → handler responde `skipped`, não 500
  (mock de `createRun` rejeitando + `isUniqueViolation`).
- MCP `agent_concurrency`: verbo/rota (`GET /admin/concurrency`) no client.test.
- Paralelismo real (N runs juntos) = E2E.

## Fora de escopo

- Seleção/roteamento de agente por capacidade (MAC-42 já grava `agent_id`).
- Fan-out de sub-agentes num run / merge de diffs.
- Autoscaling / auto-registro de runners; concorrência por-runner ou por-agente.
- Painel de utilização vs limite (limite é env, não cruzável no SQL Postgres-only).
