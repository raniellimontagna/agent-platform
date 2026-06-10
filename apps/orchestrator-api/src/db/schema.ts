import { sql } from 'drizzle-orm';
import { jsonb, numeric, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

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

export const runs = pgTable('runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  linearIssueId: text('linear_issue_id').notNull(),
  linearIssueIdentifier: text('linear_issue_identifier').notNull(),
  title: text('title').notNull(),
  status: runStatus('status').notNull().default('pending'),
  branch: text('branch'),
  prUrl: text('pr_url'),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => sql`now()`),
});

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

export type Run = typeof runs.$inferSelect;
export type NewRun = typeof runs.$inferInsert;
export type RunStep = typeof runSteps.$inferSelect;
export type NewRunStep = typeof runSteps.$inferInsert;
export type Approval = typeof approvals.$inferSelect;
export type NewApproval = typeof approvals.$inferInsert;
