import { sql } from 'drizzle-orm';
import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
// EMBEDDING_DIM duplicado aqui p/ evitar que drizzle-kit (CJS) falhe ao resolver
// o import dinâmico de ../embeddings.ts. Fonte da verdade: src/embeddings.ts.
const EMBEDDING_DIM = 384;

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

/**
 * Estado de um run — uma execução do agente disparada por uma issue do Linear.
 * Reflete o fluxo descrito em docs/decisions/FLOW-agent-workflow.md.
 */
export const runStatus = pgEnum('run_status', [
  'pending',
  'planning',
  'awaiting_approval',
  'executing',
  'reviewing',
  'completed',
  'failed',
  'cancelled',
]);

/** Etapas do fluxo (uma linha por etapa executada). */
export const stepType = pgEnum('step_type', [
  'plan',
  'approval',
  'branch',
  'code',
  'test',
  'review',
  'pr',
  'comment',
]);

export const stepStatus = pgEnum('step_status', [
  'pending',
  'running',
  'succeeded',
  'failed',
  'skipped',
]);

/** Motivos que disparam aprovação humana — ver ADR-0004. */
export const approvalReason = pgEnum('approval_reason', [
  'plan',
  'migration',
  'auth_security',
  'infra',
  'deploy',
  'critical_deps',
  'cost_limit',
  'file_deletion',
]);

export const approvalStatus = pgEnum('approval_status', ['pending', 'approved', 'rejected']);

export const lessonSource = pgEnum('lesson_source', ['critic', 'validation']);

export const runs = pgTable(
  'runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    linearIssueId: text('linear_issue_id').notNull(),
    linearIssueIdentifier: text('linear_issue_identifier').notNull(),
    title: text('title').notNull(),
    status: runStatus('status').notNull().default('pending'),
    branch: text('branch'),
    prUrl: text('pr_url'),
    error: text('error'),
    testsPassed: boolean('tests_passed'),
    verdict: text('verdict'),
    fixAttempts: integer('fix_attempts'),
    sandboxBackend: text('sandbox_backend'),
    sandboxImage: text('sandbox_image'),
    sandboxNetwork: text('sandbox_network'),
    sandboxCommandCount: integer('sandbox_command_count'),
    sandboxTotalDurationMs: integer('sandbox_total_duration_ms'),
    sandboxMaxCommandDurationMs: integer('sandbox_max_command_duration_ms'),
    sandboxFailedCommand: text('sandbox_failed_command'),
    scheduleId: uuid('schedule_id').references(() => schedules.id, { onDelete: 'set null' }),
    agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
    workflow: text('workflow'),
    targetRepo: text('target_repo'),
    targetRepoCreate: boolean('target_repo_create').notNull().default(false),
    autoApprove: boolean('auto_approve').notNull().default(false),
    autoMerge: boolean('auto_merge').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    // MAC-61: no máx. 1 run ativo por agendamento (fecha a race do overlap guard).
    // schedule_id NULL (runs do webhook) é distinto em unique → webhook não afetado.
    uniqueIndex('runs_active_schedule_uq')
      .on(t.scheduleId)
      .where(
        sql`${t.status} in ('pending','planning','awaiting_approval','executing','reviewing')`,
      ),
    // MAC-47: no máx. 1 run ativo por issue (fecha a race de webhooks simultâneos).
    uniqueIndex('runs_active_issue_uq')
      .on(t.linearIssueId)
      .where(
        sql`${t.status} in ('pending','planning','awaiting_approval','executing','reviewing')`,
      ),
  ],
);

export const runSteps = pgTable('run_steps', {
  id: uuid('id').primaryKey().defaultRandom(),
  runId: uuid('run_id')
    .notNull()
    .references(() => runs.id, { onDelete: 'cascade' }),
  type: stepType('type').notNull(),
  status: stepStatus('status').notNull().default('pending'),
  model: text('model'),
  costUsd: numeric('cost_usd', { precision: 10, scale: 4 }),
  input: jsonb('input'),
  output: jsonb('output'),
  error: text('error'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const approvals = pgTable('approvals', {
  id: uuid('id').primaryKey().defaultRandom(),
  runId: uuid('run_id')
    .notNull()
    .references(() => runs.id, { onDelete: 'cascade' }),
  reason: approvalReason('reason').notNull(),
  status: approvalStatus('status').notNull().default('pending'),
  summary: text('summary').notNull(),
  requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  resolvedBy: text('resolved_by'),
});

export const lessons = pgTable('lessons', {
  id: uuid('id').primaryKey().defaultRandom(),
  repo: text('repo').notNull(),
  source: lessonSource('source').notNull(),
  category: text('category'),
  text: text('text').notNull(),
  runId: uuid('run_id').references(() => runs.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  embedding: vector('embedding'),
});

export const artifactKind = pgEnum('artifact_kind', [
  'plan',
  'patch',
  'review',
  'validation',
  'summary',
  'research',
]);

/** Artefatos produzidos por um run, guardados de forma durável (MAC-44). */
export const artifacts = pgTable(
  'artifacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    runId: uuid('run_id')
      .notNull()
      .references(() => runs.id, { onDelete: 'cascade' }),
    kind: artifactKind('kind').notNull(),
    content: text('content').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // MAC-61: FK não cria índice; listArtifacts filtra por run_id.
    index('artifacts_run_id_idx').on(t.runId),
    // MAC-61: 1 artefato por kind/run (reforça o no-dup do plan na borda do banco).
    uniqueIndex('artifacts_run_id_kind_uq').on(t.runId, t.kind),
  ],
);

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

export const agentStatus = pgEnum('agent_status', ['active', 'deprecated']);

/** Catálogo versionado de tipos de agente (MAC-42). Metadado — não executa nada. */
export const agents = pgTable(
  'agents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: text('key').notNull(),
    version: text('version').notNull(),
    description: text('description'),
    capabilities: jsonb('capabilities').notNull().default(sql`'[]'::jsonb`).$type<string[]>(),
    status: agentStatus('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex('agents_key_version_uq').on(t.key, t.version)],
);

export const toolRisk = pgEnum('tool_risk', ['safe', 'caution', 'dangerous']);
export const toolStatus = pgEnum('tool_status', ['active', 'deprecated']);

/** Catálogo versionado de ferramentas (MAC-43). Metadado — permissões declarativas. */
export const tools = pgTable(
  'tools',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: text('key').notNull(),
    version: text('version').notNull(),
    description: text('description'),
    risk: toolRisk('risk').notNull().default('safe'),
    scopes: jsonb('scopes').notNull().default(sql`'[]'::jsonb`).$type<string[]>(),
    status: toolStatus('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex('tools_key_version_uq').on(t.key, t.version)],
);

export type Run = typeof runs.$inferSelect;
export type NewRun = typeof runs.$inferInsert;
export type RunStep = typeof runSteps.$inferSelect;
export type NewRunStep = typeof runSteps.$inferInsert;
export type Approval = typeof approvals.$inferSelect;
export type NewApproval = typeof approvals.$inferInsert;
export type LessonRow = typeof lessons.$inferSelect;
export type NewLessonRow = typeof lessons.$inferInsert;
export type Schedule = typeof schedules.$inferSelect;
export type NewSchedule = typeof schedules.$inferInsert;
export type Artifact = typeof artifacts.$inferSelect;
export type NewArtifact = typeof artifacts.$inferInsert;
export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;
export type Tool = typeof tools.$inferSelect;
export type NewTool = typeof tools.$inferInsert;
