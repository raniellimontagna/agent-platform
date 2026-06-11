import { eq } from 'drizzle-orm';
import { db, schema } from './db/client.js';

export type RunStatus = (typeof schema.runStatus.enumValues)[number];

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
