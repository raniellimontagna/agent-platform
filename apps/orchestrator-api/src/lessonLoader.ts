import { LESSON_CAP, type Lesson, formatLessons } from '@agent-platform/memory';
import { embed } from './embeddings.js';
import { searchLessons, listLessons } from './lessons.js';
import { logger } from './logger.js';

export interface RetrievalDeps {
  embed: typeof embed;
  searchLessons: typeof searchLessons;
  listLessons: typeof listLessons;
}

const defaultDeps: RetrievalDeps = { embed, searchLessons, listLessons };

/**
 * MAC-45: recupera lições por relevância (busca semântica) com fallback pra
 * recência (MAC-23). Embeda a query; busca por similaridade; se o embed falhar,
 * a query for vazia, ou não houver hits → usa as mais recentes.
 */
export async function retrieveLessons(
  repo: string,
  query: string,
  k: number,
  deps: RetrievalDeps = defaultDeps,
): Promise<Lesson[]> {
  try {
    const q = query.trim();
    if (q) {
      const hits = await deps.searchLessons(repo, await deps.embed(q), k);
      if (hits.length > 0) return hits;
    }
  } catch (err) {
    logger.warn({ err }, 'busca semântica de lições falhou (fallback recência)');
  }
  return deps.listLessons(repo, k);
}

/** Loader injetado no grafo: lições relevantes já formatadas p/ o prompt (MAC-23/45). */
export function buildLessonLoader(repo: string, deps: RetrievalDeps = defaultDeps) {
  return async (query: string): Promise<string> =>
    formatLessons(await retrieveLessons(repo, query, LESSON_CAP, deps), LESSON_CAP);
}
