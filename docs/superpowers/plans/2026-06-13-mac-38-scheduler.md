# MAC-38 Scheduler — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agendamentos cron que disparam runs do agente a partir de um prompt — criam uma issue no Linear, rodam o pipeline normal e auto-aprovam quando o plano não tem risco crítico.

**Architecture:** Tabela `schedules` (Postgres) como fonte da verdade; BullMQ Job Scheduler (`upsertJobScheduler`, bullmq 5.78) como motor de cron numa fila nova `agent-schedules`. Um `scheduleWorker` consome os disparos → cria issue no Linear → cria run → enfileira `plan` na fila existente. Auto-aprovação acontece no `worker.ts` (auto-resume quando não há motivo crítico do MAC-41).

**Tech Stack:** TypeScript (ESM, NodeNext), Hono, BullMQ 5.78, Drizzle (Postgres), `@linear/sdk`, `cron-parser` 4.9, vitest. Monorepo pnpm.

**Spec:** `docs/superpowers/specs/2026-06-13-mac-38-scheduler-design.md`

**Convenções:** trabalha-se direto na `main` (commit+push por task). Prefixar comandos com `rtk`. ESM imports com `.js`. Testes vitest (`pnpm test` na raiz). App alvo: `apps/orchestrator-api`. Bearer interno = `RUNNER_AUTH_TOKEN`.

---

## File Structure

- `apps/orchestrator-api/src/db/schema.ts` — **MODIFY**: tabela `schedules` + colunas `scheduleId`/`autoApprove` em `runs`.
- `apps/orchestrator-api/drizzle/0003_*.sql` — **CREATE** (via drizzle-kit generate).
- `apps/orchestrator-api/src/approvalPolicy.ts` — **CREATE**: `isCriticalReason`/`hasCriticalReason` (pura).
- `apps/orchestrator-api/src/approvalPolicy.test.ts` — **CREATE**.
- `apps/orchestrator-api/src/cron.ts` — **CREATE**: `isValidCron` (validação).
- `apps/orchestrator-api/src/cron.test.ts` — **CREATE**.
- `apps/orchestrator-api/src/scheduleQueue.ts` — **CREATE**: fila + `upsertScheduleJob`/`removeScheduleJob`.
- `apps/orchestrator-api/src/schedules.ts` — **CREATE**: data layer + `hasActiveRunForSchedule`.
- `apps/orchestrator-api/src/runs.ts` — **MODIFY**: `createRun` aceita `scheduleId`/`autoApprove`; `listRunsBySchedule`.
- `apps/orchestrator-api/src/scheduleWorker.ts` — **CREATE**: worker de disparo + reconciliação.
- `apps/orchestrator-api/src/worker.ts` — **MODIFY**: auto-aprovação no branch `plan`.
- `apps/orchestrator-api/src/routes/schedules.ts` — **CREATE**: CRUD REST.
- `apps/orchestrator-api/src/routes/schedules.test.ts` — **CREATE**.
- `apps/orchestrator-api/src/index.ts` — **MODIFY**: registra rota + sobe `scheduleWorker`.
- `apps/orchestrator-api/src/env.ts` — **MODIFY**: `LINEAR_TEAM_ID`/`SCHEDULER_TZ`/`LINEAR_SCHEDULED_LABEL_ID`.
- `apps/orchestrator-api/.env.example` — **MODIFY**: documenta os envs novos.
- `apps/orchestrator-api/package.json` — **MODIFY**: dep `cron-parser`.
- `packages/linear/src/index.ts` — **MODIFY**: `createIssue`.

---

## Task 1: Schema — tabela `schedules` + vínculo em `runs` + migration

**Files:**
- Modify: `apps/orchestrator-api/src/db/schema.ts`
- Create: `apps/orchestrator-api/drizzle/0003_*.sql` (gerado)

- [ ] **Step 1: Adicionar as colunas em `runs`**

No `pgTable('runs', {...})`, após a linha `fixAttempts: integer('fix_attempts'),` adicione:

```ts
  scheduleId: uuid('schedule_id').references(() => schedules.id, { onDelete: 'set null' }),
  autoApprove: boolean('auto_approve').notNull().default(false),
```

- [ ] **Step 2: Adicionar a tabela `schedules`**

Antes do bloco de `export type ...` (final do arquivo), adicione:

```ts
/** Agendamentos cron que disparam runs do agente a partir de um prompt (MAC-38). */
export const schedules = pgTable('schedules', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  cron: text('cron').notNull(),
  tz: text('tz').notNull().default('UTC'),
  title: text('title').notNull(),
  description: text('description').notNull(),
  autoApprove: boolean('auto_approve').notNull().default(true),
  enabled: boolean('enabled').notNull().default(true),
  lastRunAt: timestamp('last_run_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
```

E nos `export type` (final), adicione:

```ts
export type Schedule = typeof schedules.$inferSelect;
export type NewSchedule = typeof schedules.$inferInsert;
```

- [ ] **Step 3: Gerar a migration**

Run: `DATABASE_URL=postgres://x rtk pnpm --filter @agent-platform/orchestrator-api db:generate`
Expected: cria `apps/orchestrator-api/drizzle/0003_*.sql` com `CREATE TABLE "schedules"` + `ALTER TABLE "runs" ADD COLUMN "schedule_id"`/`"auto_approve"`. (DATABASE_URL é só pra satisfazer o config; generate não conecta.)

- [ ] **Step 4: Verify build**

Run: `rtk pnpm --filter @agent-platform/orchestrator-api build`
Expected: tsc OK.

- [ ] **Step 5: Commit**

```bash
rtk git add apps/orchestrator-api/src/db/schema.ts apps/orchestrator-api/drizzle
rtk git commit -m "feat(api): schema do scheduler — tabela schedules + vínculo em runs (MAC-38)"
```

---

## Task 2: Política de criticidade de aprovação (pura)

**Files:**
- Create: `apps/orchestrator-api/src/approvalPolicy.ts`
- Test: `apps/orchestrator-api/src/approvalPolicy.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/orchestrator-api/src/approvalPolicy.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { hasCriticalReason, isCriticalReason } from './approvalPolicy.js';

describe('isCriticalReason', () => {
  it('motivos críticos bloqueiam auto-aprovação', () => {
    for (const r of ['migration', 'auth_security', 'infra', 'deploy', 'critical_deps', 'file_deletion']) {
      expect(isCriticalReason(r)).toBe(true);
    }
  });

  it('plan e cost_limit não são críticos', () => {
    expect(isCriticalReason('plan')).toBe(false);
    expect(isCriticalReason('cost_limit')).toBe(false);
  });
});

describe('hasCriticalReason', () => {
  it('true se houver ao menos um crítico', () => {
    expect(hasCriticalReason(['plan', 'migration'])).toBe(true);
  });
  it('false se só houver não-críticos', () => {
    expect(hasCriticalReason(['plan', 'cost_limit'])).toBe(false);
  });
  it('false p/ lista vazia', () => {
    expect(hasCriticalReason([])).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk vitest run apps/orchestrator-api/src/approvalPolicy.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Write implementation**

Create `apps/orchestrator-api/src/approvalPolicy.ts`:

```ts
/**
 * Motivos de aprovação que NÃO podem ser auto-aprovados por um run agendado
 * (MAC-38/41): mudanças sensíveis sempre exigem humano. `plan` e `cost_limit`
 * não bloqueiam a autonomia.
 */
const CRITICAL_REASONS = new Set([
  'migration',
  'auth_security',
  'infra',
  'deploy',
  'critical_deps',
  'file_deletion',
]);

/** Um motivo de aprovação exige humano mesmo em run auto-aprovável? */
export function isCriticalReason(reason: string): boolean {
  return CRITICAL_REASONS.has(reason);
}

/** Há ao menos um motivo crítico na lista? */
export function hasCriticalReason(reasons: string[]): boolean {
  return reasons.some(isCriticalReason);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `rtk vitest run apps/orchestrator-api/src/approvalPolicy.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
rtk git add apps/orchestrator-api/src/approvalPolicy.ts apps/orchestrator-api/src/approvalPolicy.test.ts
rtk git commit -m "feat(api): política de criticidade p/ auto-aprovação (MAC-38)"
```

---

## Task 3: Validação de cron

**Files:**
- Modify: `apps/orchestrator-api/package.json`
- Create: `apps/orchestrator-api/src/cron.ts`
- Test: `apps/orchestrator-api/src/cron.test.ts`

- [ ] **Step 1: Adicionar a dependência**

Run: `rtk pnpm --filter @agent-platform/orchestrator-api add cron-parser@^4.9.0`
Expected: adiciona `"cron-parser": "^4.9.0"` em `dependencies`.

- [ ] **Step 2: Write the failing test**

Create `apps/orchestrator-api/src/cron.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { isValidCron } from './cron.js';

describe('isValidCron', () => {
  it('aceita cron válido', () => {
    expect(isValidCron('0 9 * * 1')).toBe(true); // toda 2ª às 09:00
    expect(isValidCron('*/5 * * * *')).toBe(true);
  });

  it('rejeita cron inválido', () => {
    expect(isValidCron('not a cron')).toBe(false);
    expect(isValidCron('99 99 * * *')).toBe(false);
    expect(isValidCron('')).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `rtk vitest run apps/orchestrator-api/src/cron.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 4: Write implementation**

Create `apps/orchestrator-api/src/cron.ts`:

```ts
import parser from 'cron-parser';

/**
 * Valida um pattern cron (5 campos) usando o mesmo parser que o BullMQ usa
 * internamente (MAC-38). Retorna false em vez de lançar.
 */
export function isValidCron(expr: string, tz = 'UTC'): boolean {
  if (!expr.trim()) return false;
  try {
    parser.parseExpression(expr, { tz });
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `rtk vitest run apps/orchestrator-api/src/cron.test.ts`
Expected: PASS (2 testes). Se o import default falhar em runtime, trocar por `import * as parser from 'cron-parser';` (cron-parser 4.x é CJS).

- [ ] **Step 6: Commit**

```bash
rtk git add apps/orchestrator-api/package.json apps/orchestrator-api/src/cron.ts apps/orchestrator-api/src/cron.test.ts ../../pnpm-lock.yaml
rtk git commit -m "feat(api): validação de cron com cron-parser (MAC-38)"
```

---

## Task 4: Fila + helpers do BullMQ Job Scheduler

**Files:**
- Create: `apps/orchestrator-api/src/scheduleQueue.ts`

- [ ] **Step 1: Write implementation**

Create `apps/orchestrator-api/src/scheduleQueue.ts`:

```ts
import { Queue } from 'bullmq';
import { connection } from './queue.js';

/** Fila dedicada aos disparos de agendamento (MAC-38). */
export const SCHEDULE_QUEUE = 'agent-schedules';

/** Payload de um disparo: só o id do agendamento (metadados vêm do DB). */
export interface ScheduleFireData {
  scheduleId: string;
}

export const scheduleQueue = new Queue<ScheduleFireData, unknown, string>(SCHEDULE_QUEUE, {
  connection,
  defaultJobOptions: { removeOnComplete: 100, removeOnFail: 500 },
});

/**
 * Cria/atualiza o Job Scheduler de um agendamento (cron vive no Redis).
 * A key é o id do schedule — upsert é idempotente (reagendar = re-upsert).
 */
export async function upsertScheduleJob(s: { id: string; cron: string; tz: string }): Promise<void> {
  await scheduleQueue.upsertJobScheduler(
    s.id,
    { pattern: s.cron, tz: s.tz },
    { name: 'fire', data: { scheduleId: s.id } },
  );
}

/** Remove o Job Scheduler de um agendamento. */
export async function removeScheduleJob(id: string): Promise<void> {
  await scheduleQueue.removeJobScheduler(id);
}
```

- [ ] **Step 2: Verify build**

Run: `rtk pnpm --filter @agent-platform/orchestrator-api build`
Expected: tsc OK (confirma que `upsertJobScheduler`/`removeJobScheduler` existem na versão instalada do bullmq).

- [ ] **Step 3: Commit**

```bash
rtk git add apps/orchestrator-api/src/scheduleQueue.ts
rtk git commit -m "feat(api): fila + helpers do BullMQ Job Scheduler (MAC-38)"
```

---

## Task 5: Data layer dos agendamentos + `createRun`/`listRunsBySchedule`

**Files:**
- Create: `apps/orchestrator-api/src/schedules.ts`
- Modify: `apps/orchestrator-api/src/runs.ts`

- [ ] **Step 1: Estender `createRun` (runs.ts)**

Em `apps/orchestrator-api/src/runs.ts`, troque a interface `NewRunInput`:

```ts
export interface NewRunInput {
  linearIssueId: string;
  linearIssueIdentifier: string;
  title: string;
}
```
por:
```ts
export interface NewRunInput {
  linearIssueId: string;
  linearIssueIdentifier: string;
  title: string;
  /** Agendamento que originou o run (MAC-38). */
  scheduleId?: string;
  /** Run pode ser auto-aprovado se não houver motivo crítico (MAC-38). */
  autoApprove?: boolean;
}
```

E no corpo de `createRun`, troque o objeto `.values({...})` por:
```ts
    .values({
      linearIssueId: input.linearIssueId,
      linearIssueIdentifier: input.linearIssueIdentifier,
      title: input.title,
      status: 'pending',
      ...(input.scheduleId ? { scheduleId: input.scheduleId } : {}),
      ...(input.autoApprove !== undefined ? { autoApprove: input.autoApprove } : {}),
    })
```

- [ ] **Step 2: Adicionar `listRunsBySchedule` (runs.ts)**

Após `listRuns`, adicione:
```ts
/** Histórico de runs de um agendamento, mais recentes primeiro (MAC-38). */
export async function listRunsBySchedule(scheduleId: string, limit = 50) {
  return db
    .select()
    .from(schema.runs)
    .where(eq(schema.runs.scheduleId, scheduleId))
    .orderBy(desc(schema.runs.createdAt))
    .limit(limit);
}
```
(`eq`/`desc` já estão importados em runs.ts.)

- [ ] **Step 3: Criar o data layer dos schedules**

Create `apps/orchestrator-api/src/schedules.ts`:

```ts
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from './db/client.js';
import * as schema from './db/schema.js';
import type { RunStatus } from './runs.js';

/** Status não-terminais — usados no overlap guard. */
const ACTIVE_STATUSES: RunStatus[] = [
  'pending',
  'planning',
  'awaiting_approval',
  'executing',
  'reviewing',
];

export interface NewScheduleInput {
  name: string;
  cron: string;
  title: string;
  description: string;
  tz?: string;
  autoApprove?: boolean;
  enabled?: boolean;
}

export interface SchedulePatch {
  name?: string;
  cron?: string;
  title?: string;
  description?: string;
  tz?: string;
  autoApprove?: boolean;
  enabled?: boolean;
}

/** Cria um agendamento e devolve a linha. */
export async function createSchedule(input: NewScheduleInput): Promise<schema.Schedule> {
  const [row] = await db
    .insert(schema.schedules)
    .values({
      name: input.name,
      cron: input.cron,
      title: input.title,
      description: input.description,
      ...(input.tz ? { tz: input.tz } : {}),
      ...(input.autoApprove !== undefined ? { autoApprove: input.autoApprove } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
    })
    .returning();
  // biome-ignore lint/style/noNonNullAssertion: insert ... returning sempre retorna a linha
  return row!;
}

/** Lista agendamentos, mais recentes primeiro. `enabledOnly` p/ a reconciliação. */
export async function listSchedules(opts?: { enabledOnly?: boolean }): Promise<schema.Schedule[]> {
  if (opts?.enabledOnly) {
    return db
      .select()
      .from(schema.schedules)
      .where(eq(schema.schedules.enabled, true))
      .orderBy(desc(schema.schedules.createdAt));
  }
  return db.select().from(schema.schedules).orderBy(desc(schema.schedules.createdAt));
}

/** Um agendamento pelo id (null se não existe). */
export async function getSchedule(id: string): Promise<schema.Schedule | null> {
  const [row] = await db.select().from(schema.schedules).where(eq(schema.schedules.id, id)).limit(1);
  return row ?? null;
}

/** Atualiza campos e devolve a linha (null se não existe). */
export async function updateSchedule(id: string, patch: SchedulePatch): Promise<schema.Schedule | null> {
  const [row] = await db
    .update(schema.schedules)
    .set({
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.cron !== undefined ? { cron: patch.cron } : {}),
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.tz !== undefined ? { tz: patch.tz } : {}),
      ...(patch.autoApprove !== undefined ? { autoApprove: patch.autoApprove } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
    })
    .where(eq(schema.schedules.id, id))
    .returning();
  return row ?? null;
}

/** Remove um agendamento (devolve true se removeu). */
export async function deleteSchedule(id: string): Promise<boolean> {
  const rows = await db
    .delete(schema.schedules)
    .where(eq(schema.schedules.id, id))
    .returning({ id: schema.schedules.id });
  return rows.length > 0;
}

/** Marca o último disparo. */
export async function touchSchedule(id: string): Promise<void> {
  await db.update(schema.schedules).set({ lastRunAt: new Date() }).where(eq(schema.schedules.id, id));
}

/** Há um run ainda ativo deste agendamento? (overlap guard) */
export async function hasActiveRunForSchedule(scheduleId: string): Promise<boolean> {
  const rows = await db
    .select({ id: schema.runs.id })
    .from(schema.runs)
    .where(and(eq(schema.runs.scheduleId, scheduleId), inArray(schema.runs.status, ACTIVE_STATUSES)))
    .limit(1);
  return rows.length > 0;
}
```

- [ ] **Step 4: Verify build**

Run: `rtk pnpm --filter @agent-platform/orchestrator-api build`
Expected: tsc OK.

- [ ] **Step 5: Commit**

```bash
rtk git add apps/orchestrator-api/src/schedules.ts apps/orchestrator-api/src/runs.ts
rtk git commit -m "feat(api): data layer dos agendamentos + createRun/listRunsBySchedule (MAC-38)"
```

---

## Task 6: Linear gateway — `createIssue`

**Files:**
- Modify: `packages/linear/src/index.ts`

- [ ] **Step 1: Adicionar à interface**

Em `LinearGateway` (após `comment`), adicione:
```ts
  createIssue(input: {
    title: string;
    description: string;
    teamId: string;
    labelIds?: string[];
  }): Promise<IssueContext>;
```

- [ ] **Step 2: Implementar**

No objeto retornado por `createLinearGateway`, após `comment`, adicione:
```ts
    async createIssue(input) {
      const payload = await client.createIssue({
        teamId: input.teamId,
        title: input.title,
        description: input.description,
        ...(input.labelIds?.length ? { labelIds: input.labelIds } : {}),
      });
      const issue = await payload.issue;
      if (!issue) throw new Error('Linear createIssue não retornou a issue');
      return {
        id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        description: issue.description ?? '',
      };
    },
```

- [ ] **Step 3: Verify build**

Run: `rtk pnpm --filter @agent-platform/linear build`
Expected: tsc OK.

- [ ] **Step 4: Commit**

```bash
rtk git add packages/linear/src/index.ts
rtk git commit -m "feat(linear): createIssue no gateway (MAC-38)"
```

---

## Task 7: env + `.env.example`

**Files:**
- Modify: `apps/orchestrator-api/src/env.ts`
- Modify: `apps/orchestrator-api/.env.example`

- [ ] **Step 1: Envs novos (env.ts)**

No `envSchema`, após `AGENT_MAX_REVIEW_ROUNDS`, adicione:
```ts
  // Scheduler (MAC-38): time onde as issues agendadas são criadas (obrigatório).
  LINEAR_TEAM_ID: z.string().min(1),
  // Timezone default dos agendamentos (cada schedule pode sobrescrever).
  SCHEDULER_TZ: z.string().default('UTC'),
  // Label opcional aplicada às issues criadas por agendamento.
  LINEAR_SCHEDULED_LABEL_ID: z.string().optional(),
```

- [ ] **Step 2: Documentar no `.env.example`**

Append em `apps/orchestrator-api/.env.example`:
```
# Scheduler (MAC-38)
LINEAR_TEAM_ID=043897b1-4201-46d2-bf1a-ec0af0cda65f
SCHEDULER_TZ=UTC
LINEAR_SCHEDULED_LABEL_ID=
```

- [ ] **Step 3: Verify build**

Run: `rtk pnpm --filter @agent-platform/orchestrator-api build`
Expected: tsc OK.

- [ ] **Step 4: Commit**

```bash
rtk git add apps/orchestrator-api/src/env.ts apps/orchestrator-api/.env.example
rtk git commit -m "feat(api): envs do scheduler (LINEAR_TEAM_ID/SCHEDULER_TZ/label) (MAC-38)"
```

---

## Task 8: Auto-aprovação no `worker.ts`

**Files:**
- Modify: `apps/orchestrator-api/src/worker.ts`

- [ ] **Step 1: Imports**

Adicione ao import de `./runs.js` os nomes `getRun` e `resolveApproval` (se já não estiverem). Adicione um import novo:
```ts
import { hasCriticalReason, isCriticalReason } from './approvalPolicy.js';
```
(`getRun` já é importado; garanta `resolveApproval` na lista de `./runs.js`.)

- [ ] **Step 2: Substituir o bloco de approval**

Troque o bloco atual:
```ts
      // Approval Policies (MAC-41): ao pausar p/ aprovação, registra a solicitação
      // com os motivos detectados no plano (auditoria/governança).
      if (status === 'awaiting_approval') {
        const reasons = result.approvalReasons ?? ['plan'];
        await recordApproval(runId, reasons, `Motivos: ${reasons.join(', ')}`);
      }
```
por:
```ts
      // Approval Policies (MAC-41): ao pausar p/ aprovação, registra a solicitação.
      // Scheduler (MAC-38): run auto-aprovável segue sozinho se NÃO houver motivo
      // crítico; com motivo crítico, fica aguardando humano (approve via label).
      if (status === 'awaiting_approval') {
        const reasons = result.approvalReasons ?? ['plan'];
        await recordApproval(runId, reasons, `Motivos: ${reasons.join(', ')}`);

        const run = await getRun(runId);
        if (run?.autoApprove) {
          if (hasCriticalReason(reasons)) {
            const critical = reasons.filter(isCriticalReason);
            await linear.comment(
              run.linearIssueId,
              `## ⏸️ Agendado pausado — aprovação humana necessária\nMotivo(s): ${critical.join(', ')}. Adicione a label \`approved\` para liberar.`,
            );
            log.warn({ runId, critical }, 'agendado retido — motivo crítico');
          } else {
            await resolveApproval(runId, 'approved', 'scheduler');
            await updateRunStatus(runId, 'executing');
            await agentQueue.add(
              'resume',
              { kind: 'resume', runId },
              { priority: JOB_PRIORITY.resume },
            );
            log.info({ runId }, 'agendado auto-aprovado (sem motivo crítico)');
          }
        }
      }
```
(`updateRunStatus`, `agentQueue`, `JOB_PRIORITY`, `recordApproval`, `linear`, `log` já estão no escopo do worker.)

- [ ] **Step 3: Verify build + tests**

Run: `rtk pnpm --filter @agent-platform/orchestrator-api build && rtk vitest run apps/orchestrator-api`
Expected: tsc OK; testes existentes passam.

- [ ] **Step 4: Commit**

```bash
rtk git add apps/orchestrator-api/src/worker.ts
rtk git commit -m "feat(api): auto-aprovação de runs agendados (freio por motivo crítico) (MAC-38)"
```

---

## Task 9: `scheduleWorker` — disparo + reconciliação

**Files:**
- Create: `apps/orchestrator-api/src/scheduleWorker.ts`

- [ ] **Step 1: Write implementation**

Create `apps/orchestrator-api/src/scheduleWorker.ts`:

```ts
import { Worker } from 'bullmq';
import { getAgent } from './agent.js';
import { env } from './env.js';
import { isPaused } from './killswitch.js';
import { logger } from './logger.js';
import { JOB_PRIORITY, agentQueue, connection } from './queue.js';
import { createRun } from './runs.js';
import {
  getSchedule,
  hasActiveRunForSchedule,
  listSchedules,
  touchSchedule,
} from './schedules.js';
import {
  SCHEDULE_QUEUE,
  type ScheduleFireData,
  removeScheduleJob,
  upsertScheduleJob,
} from './scheduleQueue.js';

/**
 * Worker dos disparos de agendamento (MAC-38). Cada disparo: cria a issue no
 * Linear (issue sintética), cria o run e enfileira `plan` na fila do agente.
 * Na subida, reconcilia os Job Schedulers do BullMQ a partir do banco (cobre
 * Redis flush / deploy novo), análogo ao resume de órfãos (MAC-34).
 */
export async function startScheduleWorker(): Promise<Worker<ScheduleFireData, unknown, string>> {
  const { linear } = await getAgent();

  // Reconciliação: garante um Job Scheduler p/ cada agendamento habilitado.
  const enabled = await listSchedules({ enabledOnly: true });
  for (const s of enabled) {
    await upsertScheduleJob({ id: s.id, cron: s.cron, tz: s.tz });
  }
  logger.info({ reconciled: enabled.length }, 'schedule worker started');

  return new Worker<ScheduleFireData, unknown, string>(
    SCHEDULE_QUEUE,
    async (job) => {
      const { scheduleId } = job.data;
      const log = logger.child({ scheduleId });

      // Kill switch (MAC-32): pausado → não dispara; o próximo tick tenta.
      if (await isPaused()) {
        log.warn('agents paused; skipping scheduled fire');
        return;
      }

      const schedule = await getSchedule(scheduleId);
      if (!schedule || !schedule.enabled) {
        // Agendamento sumiu/desabilitado mas o scheduler órfão disparou: limpa.
        await removeScheduleJob(scheduleId);
        log.warn('schedule ausente/desabilitado — scheduler removido');
        return;
      }

      // Overlap guard: não empilha runs se o anterior ainda está rodando.
      if (await hasActiveRunForSchedule(scheduleId)) {
        log.warn('run anterior ainda ativo — disparo ignorado');
        return;
      }

      const issue = await linear.createIssue({
        title: schedule.title,
        description: schedule.description,
        teamId: env.LINEAR_TEAM_ID,
        labelIds: env.LINEAR_SCHEDULED_LABEL_ID ? [env.LINEAR_SCHEDULED_LABEL_ID] : undefined,
      });

      const runId = await createRun({
        linearIssueId: issue.id,
        linearIssueIdentifier: issue.identifier,
        title: schedule.title,
        scheduleId,
        autoApprove: schedule.autoApprove,
      });

      await touchSchedule(scheduleId);

      await agentQueue.add(
        'plan',
        { kind: 'plan', runId, issueId: issue.id },
        { priority: JOB_PRIORITY.plan },
      );

      log.info({ runId, issue: issue.identifier }, 'scheduled run enfileirado');
    },
    { connection },
  );
}
```

- [ ] **Step 2: Verify build**

Run: `rtk pnpm --filter @agent-platform/orchestrator-api build`
Expected: tsc OK.

- [ ] **Step 3: Commit**

```bash
rtk git add apps/orchestrator-api/src/scheduleWorker.ts
rtk git commit -m "feat(api): scheduleWorker — disparo + reconciliação no boot (MAC-38)"
```

---

## Task 10: Rotas CRUD `/schedules`

**Files:**
- Create: `apps/orchestrator-api/src/routes/schedules.ts`
- Test: `apps/orchestrator-api/src/routes/schedules.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/orchestrator-api/src/routes/schedules.test.ts`:

```ts
import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createSchedule,
  deleteSchedule,
  getSchedule,
  listSchedules,
  updateSchedule,
} from '../schedules.js';
import { removeScheduleJob, upsertScheduleJob } from '../scheduleQueue.js';
import { schedulesRoute } from './schedules.js';

vi.mock('../schedules.js', () => ({
  createSchedule: vi.fn(),
  listSchedules: vi.fn(),
  getSchedule: vi.fn(),
  updateSchedule: vi.fn(),
  deleteSchedule: vi.fn(),
  listRunsBySchedule: vi.fn(),
}));
vi.mock('../scheduleQueue.js', () => ({
  upsertScheduleJob: vi.fn(),
  removeScheduleJob: vi.fn(),
}));
vi.mock('../runs.js', () => ({ listRunsBySchedule: vi.fn() }));
vi.mock('../env.js', () => ({ env: { RUNNER_AUTH_TOKEN: 'tok' } }));

const auth = { authorization: 'Bearer tok' };
const app = new Hono();
app.route('/', schedulesRoute);

beforeEach(() => vi.clearAllMocks());

describe('POST /schedules', () => {
  it('401 sem token', async () => {
    const res = await app.request('/schedules', { method: 'POST', body: '{}' });
    expect(res.status).toBe(401);
  });

  it('400 com cron inválido', async () => {
    const res = await app.request('/schedules', {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'x', cron: 'nope', title: 't', description: 'd' }),
    });
    expect(res.status).toBe(400);
    expect(createSchedule).not.toHaveBeenCalled();
  });

  it('cria e registra o scheduler', async () => {
    vi.mocked(createSchedule).mockResolvedValue({ id: 's1', cron: '0 9 * * 1', tz: 'UTC', enabled: true } as never);
    const res = await app.request('/schedules', {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'x', cron: '0 9 * * 1', title: 't', description: 'd' }),
    });
    expect(res.status).toBe(201);
    expect(upsertScheduleJob).toHaveBeenCalledWith({ id: 's1', cron: '0 9 * * 1', tz: 'UTC' });
  });
});

describe('GET /schedules/:id', () => {
  it('404 quando não existe', async () => {
    vi.mocked(getSchedule).mockResolvedValue(null);
    const res = await app.request('/schedules/missing', { headers: auth });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /schedules/:id', () => {
  it('remove row + scheduler', async () => {
    vi.mocked(deleteSchedule).mockResolvedValue(true);
    const res = await app.request('/schedules/s1', { method: 'DELETE', headers: auth });
    expect(res.status).toBe(204);
    expect(removeScheduleJob).toHaveBeenCalledWith('s1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk vitest run apps/orchestrator-api/src/routes/schedules.test.ts`
Expected: FAIL — `schedulesRoute` não existe.

- [ ] **Step 3: Write implementation**

Create `apps/orchestrator-api/src/routes/schedules.ts`:

```ts
import { type Context, Hono, type Next } from 'hono';
import { isValidCron } from '../cron.js';
import { env } from '../env.js';
import { logger } from '../logger.js';
import { listRunsBySchedule } from '../runs.js';
import {
  createSchedule,
  deleteSchedule,
  getSchedule,
  listSchedules,
  updateSchedule,
} from '../schedules.js';
import { removeScheduleJob, upsertScheduleJob } from '../scheduleQueue.js';

export const schedulesRoute = new Hono();

async function requireAuth(c: Context, next: Next) {
  if (c.req.header('authorization') !== `Bearer ${env.RUNNER_AUTH_TOKEN}`) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  await next();
}

schedulesRoute.use('/schedules', requireAuth);
schedulesRoute.use('/schedules/*', requireAuth);

/** Cria um agendamento (valida cron antes de persistir). */
schedulesRoute.post('/schedules', async (c) => {
  try {
    const body = await c.req.json().catch(() => null);
    if (!body || !body.name || !body.cron || !body.title || !body.description) {
      return c.json({ error: 'name, cron, title e description são obrigatórios' }, 400);
    }
    const tz = typeof body.tz === 'string' && body.tz ? body.tz : env.SCHEDULER_TZ;
    if (!isValidCron(body.cron, tz)) {
      return c.json({ error: 'cron inválido' }, 400);
    }
    const row = await createSchedule({
      name: body.name,
      cron: body.cron,
      title: body.title,
      description: body.description,
      tz,
      autoApprove: typeof body.auto_approve === 'boolean' ? body.auto_approve : undefined,
      enabled: typeof body.enabled === 'boolean' ? body.enabled : undefined,
    });
    if (row.enabled) {
      await upsertScheduleJob({ id: row.id, cron: row.cron, tz: row.tz });
    }
    return c.json(row, 201);
  } catch (err) {
    logger.error({ err }, 'failed to create schedule');
    return c.json({ error: 'internal server error' }, 500);
  }
});

/** Lista agendamentos. */
schedulesRoute.get('/schedules', async (c) => {
  return c.json({ schedules: await listSchedules() });
});

/** Um agendamento. */
schedulesRoute.get('/schedules/:id', async (c) => {
  const row = await getSchedule(c.req.param('id'));
  if (!row) return c.json({ error: 'not found' }, 404);
  return c.json(row);
});

/** Histórico de runs de um agendamento. */
schedulesRoute.get('/schedules/:id/runs', async (c) => {
  return c.json({ runs: await listRunsBySchedule(c.req.param('id')) });
});

/** Atualiza um agendamento e reconcilia o scheduler. */
schedulesRoute.patch('/schedules/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => null);
    if (!body) return c.json({ error: 'body inválido' }, 400);
    if (body.cron !== undefined) {
      const tz = typeof body.tz === 'string' && body.tz ? body.tz : env.SCHEDULER_TZ;
      if (!isValidCron(body.cron, tz)) return c.json({ error: 'cron inválido' }, 400);
    }
    const row = await updateSchedule(id, {
      name: body.name,
      cron: body.cron,
      title: body.title,
      description: body.description,
      tz: body.tz,
      autoApprove: typeof body.auto_approve === 'boolean' ? body.auto_approve : undefined,
      enabled: typeof body.enabled === 'boolean' ? body.enabled : undefined,
    });
    if (!row) return c.json({ error: 'not found' }, 404);
    if (row.enabled) {
      await upsertScheduleJob({ id: row.id, cron: row.cron, tz: row.tz });
    } else {
      await removeScheduleJob(row.id);
    }
    return c.json(row);
  } catch (err) {
    logger.error({ err }, 'failed to update schedule');
    return c.json({ error: 'internal server error' }, 500);
  }
});

/** Remove um agendamento + o scheduler. */
schedulesRoute.delete('/schedules/:id', async (c) => {
  const id = c.req.param('id');
  const removed = await deleteSchedule(id);
  if (!removed) return c.json({ error: 'not found' }, 404);
  await removeScheduleJob(id);
  return c.body(null, 204);
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `rtk vitest run apps/orchestrator-api/src/routes/schedules.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
rtk git add apps/orchestrator-api/src/routes/schedules.ts apps/orchestrator-api/src/routes/schedules.test.ts
rtk git commit -m "feat(api): CRUD REST /schedules (MAC-38)"
```

---

## Task 11: Wiring no `index.ts`

**Files:**
- Modify: `apps/orchestrator-api/src/index.ts`

- [ ] **Step 1: Imports + rota + worker**

Adicione aos imports:
```ts
import { schedulesRoute } from './routes/schedules.js';
import { startScheduleWorker } from './scheduleWorker.js';
```

Após `app.route('/', adminRoute);`, adicione:
```ts
app.route('/', schedulesRoute);
```

Após o bloco `startAgentWorker().catch(...)`, adicione:
```ts
// Sobe o worker dos agendamentos (MAC-38) — disparos cron + reconciliação.
startScheduleWorker().catch((err) => {
  logger.error({ err }, 'failed to start schedule worker');
});
```

- [ ] **Step 2: Verify build + tests**

Run: `rtk pnpm --filter @agent-platform/orchestrator-api build && rtk vitest run apps/orchestrator-api`
Expected: tsc OK; testes passam.

- [ ] **Step 3: Commit**

```bash
rtk git add apps/orchestrator-api/src/index.ts
rtk git commit -m "feat(api): registra /schedules + sobe scheduleWorker (MAC-38)"
```

---

## Task 12: Build + suite + push

**Files:** nenhum (verificação final).

- [ ] **Step 1: Build completo**

Run: `rtk pnpm -r build`
Expected: todos os pacotes OK.

- [ ] **Step 2: Suite completa**

Run: `rtk pnpm test`
Expected: PASS — os ~71 atuais + novos (approvalPolicy 5, cron 2, schedules route 5 = +12 ≈ 83). Sem regressão.

- [ ] **Step 3: Push**

```bash
rtk git push
```

- [ ] **Step 4: Nota de deploy/E2E (manual, fora daqui)**

- **Migration**: `0003` aplicada pelo `deploy.sh orchestrator` (roda `db:deploy`).
- **env**: preencher `LINEAR_TEAM_ID` no `.env` do LXC 201 (o `ensure_env` do deploy.sh auto-adiciona a chave do `.env.example`; o valor já vem com o id do time MAC).
- **Redeploy**: `deploy.sh orchestrator` (build --no-cache + migrate + up). Runners NÃO mudam.
- **E2E**: `POST /schedules` com cron de 1 min (`* * * * *`), `auto_approve:true`, um title/description simples → ver issue `scheduled` criada no Linear → run enfileirado → auto-resume (sem motivo crítico) → Draft PR. Depois `DELETE /schedules/:id` pra parar. Conferir `GET /schedules/:id/runs` (histórico) e que um schedule com plano "crítico" (ex.: mexer em infra) fica `awaiting_approval` em vez de auto-resumir.

---

## Self-Review (preenchido)

**Cobertura do spec:**
- Tabela `schedules` + `runs.schedule_id`/`auto_approve` + migration → Task 1. ✅
- Motor BullMQ Job Scheduler (fila + upsert/remove) → Task 4. ✅
- scheduleWorker (kill switch, overlap guard, cria issue, cria run, enfileira plan) → Task 9. ✅
- Auto-aprovação com freio de política → Task 2 (isCriticalReason) + Task 8 (worker). ✅
- Cria issue no Linear → Task 6 (`createIssue`) + Task 9 (uso). ✅
- CRUD REST + histórico → Task 10. ✅
- Reconciliação no boot → Task 9 (startScheduleWorker). ✅
- Validação de cron → Task 3. ✅
- envs (LINEAR_TEAM_ID/SCHEDULER_TZ/label) → Task 7. ✅
- Wiring (rota + worker) → Task 11. ✅
- tz default UTC → Task 1 (default coluna) + Task 7 (env). ✅
- Overlap guard → Task 5 (`hasActiveRunForSchedule`) + Task 9. ✅

**Placeholders:** nenhum — todo passo tem código/comando concreto.

**Consistência de tipos:** `NewScheduleInput`/`SchedulePatch` (Task 5) batem com os campos usados nas rotas (Task 10). `upsertScheduleJob({id,cron,tz})` (Task 4) chamado igual em Task 9/10/11. `createRun` estendido (Task 5) usado em Task 9. `isCriticalReason`/`hasCriticalReason` (Task 2) usados em Task 8. `createIssue(input)` (Task 6) chamado igual em Task 9. `schedulesRoute`/`startScheduleWorker` (Tasks 10/9) registrados em Task 11.
```
