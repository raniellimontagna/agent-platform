import { desc, eq } from 'drizzle-orm';
import { db, schema } from './db/client.js';

export type RunStatus = (typeof schema.runStatus.enumValues)[number];
export type StepType = (typeof schema.stepType.enumValues)[number];
export type StepStatus = (typeof schema.stepStatus.enumValues)[number];

export interface NewRunInput {
  linearIssueId: string;
  linearIssueIdentifier: string;
  title: string;
}

/** Cria o registro do run (MAC-36) e devolve o id. */
export async function createRun(input: NewRunInput): Promise<string> {
  const [row] = await db
    .insert(schema.runs)
    .values({
      linearIssueId: input.linearIssueId,
      linearIssueIdentifier: input.linearIssueIdentifier,
      title: input.title,
      status: 'pending',
    })
    .returning({ id: schema.runs.id });
  // biome-ignore lint/style/noNonNullAssertion: insert ... returning sempre retorna a linha
  return row!.id;
}

/** Lê um run pelo id (null se não existir). */
export async function getRun(id: string) {
  const [row] = await db.select().from(schema.runs).where(eq(schema.runs.id, id)).limit(1);
  return row ?? null;
}

export async function updateRunStatus(
  runId: string,
  status: RunStatus,
  extra?: { error?: string },
): Promise<void> {
  await db
    .update(schema.runs)
    .set({ status, ...(extra?.error ? { error: extra.error } : {}) })
    .where(eq(schema.runs.id, runId));
}

/** Histórico de execuções, mais recentes primeiro (MAC-36). */
export async function listRuns(limit = 50) {
  return db.select().from(schema.runs).orderBy(desc(schema.runs.createdAt)).limit(limit);
}

/** Registra uma etapa executada com tempo e resultado (MAC-36). */
export async function recordStep(input: {
  runId: string;
  type: StepType;
  status: StepStatus;
  startedAt: Date;
  error?: string;
}): Promise<void> {
  await db.insert(schema.runSteps).values({
    runId: input.runId,
    type: input.type,
    status: input.status,
    startedAt: input.startedAt,
    finishedAt: new Date(),
    error: input.error,
  });
}

/** Etapas de um run, em ordem de criação (MAC-36). */
export async function listSteps(runId: string) {
  return db
    .select()
    .from(schema.runSteps)
    .where(eq(schema.runSteps.runId, runId))
    .orderBy(schema.runSteps.createdAt);
}
