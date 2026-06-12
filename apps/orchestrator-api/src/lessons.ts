import type { Lesson, LessonSource } from '@agent-platform/memory';
import { desc, eq } from 'drizzle-orm';
import { db, schema } from './db/client.js';
import type { LessonRow } from './db/schema.js';

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
  await db.insert(schema.lessons).values({
    repo: input.repo,
    source: input.source,
    text: input.text,
    runId: input.runId,
    category: input.category ?? null,
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
