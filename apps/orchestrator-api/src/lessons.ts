import type { Lesson, LessonSource } from '@agent-platform/memory';
import { desc, eq } from 'drizzle-orm';
import { db, schema } from './db/client.js';
import type { LessonRow } from './db/schema.js';
import { embed } from './embeddings.js';
import { logger } from './logger.js';

/** Mapeia a linha do banco para o tipo puro do pacote memory. */
function toLesson(row: LessonRow): Lesson {
  return {
    id: row.id,
    repo: row.repo,
    source: row.source as LessonSource,
    category: row.category,
    text: row.text,
    runId: row.runId ?? '',
    createdAt: row.createdAt,
  };
}

/** Persiste uma lição destilada de uma falha (MAC-23). */
export async function saveLesson(input: {
  repo: string;
  source: LessonSource;
  text: string;
  runId: string;
  category?: string | null;
}): Promise<void> {
  // MAC-45: indexa a lição com o embedding do texto. Non-fatal: se falhar, grava
  // sem embedding (não perde a lição; não entra na busca semântica).
  let embedding: number[] | null = null;
  try {
    embedding = await embed(input.text);
  } catch (err) {
    logger.warn({ err }, 'embed da lição falhou (gravando sem embedding)');
  }
  await db.insert(schema.lessons).values({
    repo: input.repo,
    source: input.source,
    text: input.text,
    runId: input.runId,
    category: input.category ?? null,
    ...(embedding ? { embedding } : {}),
  });
}

/** Lições de um repo, mais recentes primeiro (MAC-23). */
export async function listLessons(repo: string, limit: number): Promise<Lesson[]> {
  const rows = await db
    .select()
    .from(schema.lessons)
    .where(eq(schema.lessons.repo, repo))
    .orderBy(desc(schema.lessons.createdAt))
    .limit(limit);
  return rows.map(toLesson);
}
