import { eq } from 'drizzle-orm';
import { db, schema } from './db/client.js';

export type ArtifactKind = (typeof schema.artifactKind.enumValues)[number];

/**
 * Grava os artefatos de um run (MAC-44). Insere uma linha por kind cujo content
 * é não-vazio (trim); map todo vazio → no-op. Insert em lote (uma query).
 */
export async function saveArtifacts(
  runId: string,
  parts: Partial<Record<ArtifactKind, string | undefined>>,
): Promise<void> {
  const rows = (Object.entries(parts) as [ArtifactKind, string | undefined][])
    .filter(([, content]) => content?.trim())
    .map(([kind, content]) => ({ runId, kind, content: content as string }));
  if (rows.length === 0) return;
  await db.insert(schema.artifacts).values(rows);
}

/** Metadados dos artefatos de um run (sem content), mais antigos primeiro. */
export async function listArtifacts(runId: string) {
  return db
    .select({
      id: schema.artifacts.id,
      kind: schema.artifacts.kind,
      createdAt: schema.artifacts.createdAt,
    })
    .from(schema.artifacts)
    .where(eq(schema.artifacts.runId, runId))
    .orderBy(schema.artifacts.createdAt);
}

/** Um artefato com content (null se não existe). */
export async function getArtifact(id: string) {
  const [row] = await db.select().from(schema.artifacts).where(eq(schema.artifacts.id, id)).limit(1);
  return row ?? null;
}
