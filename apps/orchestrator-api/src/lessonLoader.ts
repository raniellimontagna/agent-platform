import { LESSON_CAP, formatLessons } from '@agent-platform/memory';
import { embed } from './embeddings.js';
import { searchLessons, listLessons } from './lessons.js';
import { logger } from './logger.js';

/**
 * MAC-45: recupera lições por relevância (busca semântica) com fallback pra
 * recência (MAC-23). Embeda a query; busca por similaridade; se o embed falhar
 * ou não houver lições embeddadas, usa as mais recentes. Sempre formata (cap+dedup).
 */
export function buildLessonLoader(
  repo: string,
  deps: {
    embed: typeof embed;
    searchLessons: typeof searchLessons;
    listLessons: typeof listLessons;
  } = { embed, searchLessons, listLessons },
) {
  return async (query: string): Promise<string> => {
    try {
      const q = query.trim();
      if (q) {
        const qEmb = await deps.embed(q);
        const hits = await deps.searchLessons(repo, qEmb, LESSON_CAP);
        if (hits.length > 0) return formatLessons(hits, LESSON_CAP);
      }
    } catch (err) {
      logger.warn({ err }, 'busca semântica de lições falhou (fallback recência)');
    }
    return formatLessons(await deps.listLessons(repo, LESSON_CAP), LESSON_CAP);
  };
}
