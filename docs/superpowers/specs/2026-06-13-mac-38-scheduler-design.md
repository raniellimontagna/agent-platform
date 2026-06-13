# Scheduler — agendamento de runs do agente (design)

> Spec de design. Data: 2026-06-13. Time `MAC`, projeto *Orquestrador de Agentes com LangGraph*.
> Card: MAC-38 (Fase 6 — Runtime e Governança).

## Problema

O agente só roda por **evento**: webhook do Linear quando a label `ai-ready` é
adicionada (MAC-19/20). Não há trigger por **tempo** — tarefas recorrentes
(ex.: revisar deps toda semana, gerar um resumo periódico) precisam de alguém
adicionando a label à mão toda vez.

O Scheduler fecha essa lacuna: agendamentos cron que disparam runs do agente a
partir de um prompt, de forma autônoma, reusando todo o pipeline existente.

## Decisões (do brainstorm)

1. **O que agenda:** run do agente a partir de um **prompt** (title + description
   guardados no agendamento — issue sintética). Ao disparar, roda o grafo existente
   (planning → … → pr) como um run normal.
2. **Gestão:** tabela `schedules` no Postgres (fonte da verdade dos metadados) +
   REST API CRUD. Reagendamento = editar o cron via `PATCH`.
3. **Motor:** BullMQ **Job Scheduler** (`upsertJobScheduler` — disponível no bullmq
   5.78 instalado). Cron vive no Redis, sobrevive a restart. A tabela é a fonte da
   verdade; o CRUD faz upsert/remove do scheduler do BullMQ.
4. **Aprovação:** auto-aprova **com freio de política**. Run agendado roda autônomo
   por padrão (`auto_approve` default true), MAS se o plano detectar motivo crítico
   (MAC-41), para e espera aprovação humana.
5. **Alvo Linear:** ao disparar, **cria uma issue** no Linear (title/description do
   agendamento, label `scheduled`) e roda o fluxo normal nela. Reusa 100% do
   pipeline (zero mudança no grafo/nós), dá histórico/visibilidade + PR linkado.
6. **Timezone:** default `UTC`, setável por agendamento.
7. **Overlap guard:** não dispara se o run anterior do mesmo agendamento ainda
   estiver ativo (evita pilha de runs em cron frequente + run lento).

## Arquitetura

```
[BullMQ Job Scheduler: agent-schedules]
   cron dispara → scheduleWorker
                    ├─ kill switch (isPaused) → re-defer/skip
                    ├─ carrega schedule do DB (disabled/sumiu → removeJobScheduler)
                    ├─ overlap guard (run ativo desse schedule → skip)
                    ├─ Linear.createIssue(title, description, label `scheduled`)
                    ├─ cria run (schedule_id, auto_approve)
                    └─ enfileira 'plan' na agentQueue existente
                                  ↓
[agentQueue] → worker.ts (fluxo MAC-14 normal)
   plan → awaiting_approval
     └─ se run.auto_approve E nenhum motivo crítico → auto-resume ('resume')
        senão → fica awaiting + comenta "aguardando aprovação humana (motivo: X)"
```

## Componentes

### 1. Tabela `schedules` (`db/schema.ts` + migration `0003`)

```
schedules
  id            uuid pk default random
  name          text not null            -- rótulo curto pro humano
  cron          text not null            -- pattern cron (validado)
  tz            text not null default 'UTC'
  title         text not null            -- vira o título da issue sintética
  description   text not null            -- vira o corpo (o "prompt")
  auto_approve  boolean not null default true
  enabled       boolean not null default true
  last_run_at   timestamptz
  created_at    timestamptz not null default now()
  updated_at    timestamptz not null default now() ($onUpdate)
```

### 2. `runs` ganha vínculo com o agendamento

```
runs.schedule_id   uuid  null  references schedules(id) on delete set null
runs.auto_approve  boolean not null default false
```

- `schedule_id` = histórico (runs daquele agendamento). `auto_approve` = decisão de
  auto-aprovação no worker (copiado do schedule na criação do run; webhook = false).

### 3. Fila + motor (`scheduleQueue.ts`)

- Fila `agent-schedules` (BullMQ), conexão Redis compartilhada (`queue.ts`).
- Helpers:
  - `upsertSchedule(s: { id, cron, tz })` → `queue.upsertJobScheduler(s.id, { pattern: s.cron, tz: s.tz }, { name: 'fire', data: { scheduleId: s.id } })`.
  - `removeSchedule(id)` → `queue.removeJobScheduler(id)`.
- O `scheduleId` é a **key** do scheduler — upsert é idempotente (reagendar = re-upsert).

### 4. `scheduleWorker.ts` (Worker em `agent-schedules`)

Handler de cada disparo:
1. `isPaused()` (MAC-32) → se pausado, retorna sem disparar (próximo tick tenta).
2. Carrega o schedule por `data.scheduleId`. Se não existe ou `enabled=false` →
   `removeSchedule(id)` e retorna (limpa scheduler órfão).
3. **Overlap guard:** `hasActiveRunForSchedule(scheduleId)` (run com `schedule_id`
   em status não-terminal: pending/planning/awaiting_approval/executing/reviewing)
   → se sim, loga e retorna (skip).
4. `linear.createIssue({ title: schedule.title, description: schedule.description, teamId: env.LINEAR_TEAM_ID, labelIds: env.LINEAR_SCHEDULED_LABEL_ID ? [id] : undefined })` → `{ id, identifier, title, description }`.
5. Cria run row: `createRun({ linearIssueId, linearIssueIdentifier, title, scheduleId, autoApprove: schedule.auto_approve })` (status `pending`).
6. `touchSchedule(id)` → `last_run_at = now()`.
7. Enfileira `agentQueue.add('plan', { kind:'plan', runId, issueId }, { priority: JOB_PRIORITY.plan })`.

Não-fatal: erro num disparo loga e não derruba o worker (try/catch).

### 5. Auto-aprovação (`worker.ts`, branch `plan`)

Após o job `plan`, quando `status === 'awaiting_approval'`:
- Se o run **não** é auto-aprovável (`run.auto_approve === false`, ex.: webhook) →
  comportamento atual (registra approval pendente, espera label).
- Se `run.auto_approve === true`:
  - `critical = (result.approvalReasons ?? []).filter(isCriticalReason)` onde
    `isCriticalReason ∈ { migration, auth_security, infra, deploy, critical_deps, file_deletion }`.
  - `critical.length === 0` → registra a aprovação como **auto-aprovada/resolvida**
    (`recordApproval` + resolve com `resolvedBy='scheduler'`) e enfileira
    `agentQueue.add('resume', { kind:'resume', runId }, { priority: JOB_PRIORITY.resume })`.
  - `critical.length > 0` → mantém `awaiting_approval`, registra approval pendente
    com os motivos, e comenta no Linear: "⏸️ Agendado pausado — aprovação humana
    necessária (motivo: …). Adicione `approved` para liberar." (reusa o caminho
    de approve-via-label do MAC-22).

`isCriticalReason` é função pura exportada (testável). `plan` e `cost_limit` **não**
são bloqueantes p/ auto-aprovação.

### 6. CRUD REST (`routes/schedules.ts`)

Bearer = `RUNNER_AUTH_TOKEN` (igual `/admin`, MAC-32). Rotas:
- `POST /schedules` — body `{ name, cron, title, description, tz?, auto_approve?, enabled? }`.
  Valida cron (`cron-parser`); inválido → 400. Insere → `upsertSchedule` (se enabled).
  201 com a row.
- `GET /schedules` — lista (mais recentes primeiro).
- `GET /schedules/:id` — uma; 404 se não existe.
- `PATCH /schedules/:id` — atualiza campos. Se `cron`/`tz` mudou ou `enabled` virou
  true → `upsertSchedule`; se `enabled` virou false → `removeSchedule`. 404 se não
  existe; 400 se cron novo inválido.
- `DELETE /schedules/:id` — remove a row + `removeSchedule(id)`. 204.
- `GET /schedules/:id/runs` — histórico (runs com aquele `schedule_id`, via
  `listRuns` estendido com filtro). 

Registrada no `index.ts` (`app.route('/', schedulesRoute)`).

### 7. Linear gateway — `createIssue` (`packages/linear`)

Adiciona ao `LinearGateway`:
```ts
createIssue(input: {
  title: string;
  description: string;
  teamId: string;
  labelIds?: string[];
}): Promise<IssueContext>;
```
Impl via `linearClient.createIssue({ teamId, title, description, labelIds })`, lê o
`issue` criado e devolve o mesmo shape de `getIssue` (`{ id, identifier, title, description }`).

### 8. Reconciliação no boot

Na subida do worker (junto do resume de órfãos, MAC-34): carrega
`listSchedules({ enabled: true })` e faz `upsertSchedule` de cada (idempotente).
Cobre Redis flush / deploy novo / primeira subida.

### 9. Camada de dados (`schedules.ts`)

`createSchedule`, `listSchedules`, `getSchedule`, `updateSchedule`, `deleteSchedule`,
`touchSchedule`, `hasActiveRunForSchedule`. Espelha o estilo de `runs.ts`/`lessons.ts`.
`runs.ts` ganha `createRun` aceitando `scheduleId`/`autoApprove` e `getRun` expondo
`autoApprove`/`scheduleId`; `listRuns` aceita filtro opcional `scheduleId`.

### 10. env novos (`env.ts`)

```
LINEAR_TEAM_ID            string  -- obrigatório (criar issue agendada)
SCHEDULER_TZ              string  default 'UTC'   -- (default global; cada schedule tem seu tz)
LINEAR_SCHEDULED_LABEL_ID string opcional         -- label `scheduled` nas issues criadas
```

## Escopo / não-objetivos (follow-up)

- Tools MCP de schedules (REST já cobre; MCP vira fachada depois).
- Painel Grafana de agendamentos.
- Agendamento one-shot (data única) — só cron no MVP.
- UI/seed — agendamentos criados via API.

## Tratamento de erros

- Cron inválido → 400 no CRUD (nunca chega a virar scheduler).
- Falha ao criar issue / enfileirar no disparo → loga, não derruba o worker; próximo
  tick tenta de novo.
- Schedule deletado/disabled com scheduler órfão no Redis → o handler remove no
  próximo disparo (auto-cura).
- Kill switch pausado → não dispara (consistente com webhook/worker).

## Testes

- `cron` válido/inválido (validação do POST/PATCH).
- `isCriticalReason` — cada reason → crítico vs não (auto-aprova vs segura).
- CRUD data-layer de `schedules` (mock db no estilo dos testes de rota existentes).
- `hasActiveRunForSchedule` — terminal vs não-terminal.
- Rotas `schedules` shape/404/400 (padrão de `routes/stats.test.ts`/`runs.test.ts`).
- Integração BullMQ/scheduleWorker + auto-aprovação E2E = validação manual em prod
  (criar schedule com cron de 1 min, ver issue criada → run → auto-resume → PR).

## Arquivos prováveis (confirmar no plano)

- `apps/orchestrator-api/src/db/schema.ts` — tabela `schedules` + colunas em `runs`.
- `apps/orchestrator-api/drizzle/0003_*.sql` — migration (drizzle-kit generate).
- `apps/orchestrator-api/src/schedules.ts` — data layer + `hasActiveRunForSchedule`.
- `apps/orchestrator-api/src/scheduleQueue.ts` — fila + upsert/remove helpers.
- `apps/orchestrator-api/src/scheduleWorker.ts` — worker de disparo.
- `apps/orchestrator-api/src/routes/schedules.ts` — CRUD REST.
- `apps/orchestrator-api/src/runs.ts` — `createRun`/`getRun`/`listRuns` (scheduleId/autoApprove).
- `apps/orchestrator-api/src/worker.ts` — auto-aprovação + `isCriticalReason`.
- `apps/orchestrator-api/src/index.ts` — registra rota + sobe scheduleWorker + reconciliação.
- `apps/orchestrator-api/src/env.ts` — envs novos.
- `packages/linear/src/index.ts` — `createIssue`.
