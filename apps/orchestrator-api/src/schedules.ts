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
