import type { LlmClient } from '@agent-platform/llm';

/** Máximo de lições injetadas no prompt de um run. */
export const LESSON_CAP = 10;

/** Sinal que originou a lição. */
export type LessonSource = 'critic' | 'validation';

/**
 * Lição destilada de uma falha de run, reutilizada em runs futuros do mesmo repo
 * (MAC-23). Tipo puro — independente da camada de persistência.
 */
export interface Lesson {
  id: string;
  repo: string;
  source: LessonSource;
  category?: string | null;
  text: string;
  runId: string;
  createdAt: Date;
}

/** Contrato de persistência de lições — implementado no orchestrator (Postgres). */
export interface LessonStore {
  save(lesson: Omit<Lesson, 'id' | 'createdAt'>): Promise<void>;
  list(repo: string, limit: number): Promise<Lesson[]>;
}

/** Entrada para destilar uma lição a partir de uma falha. */
export interface DistillInput {
  source: LessonSource;
  /** Parecer do critic (quando source = 'critic'). */
  review?: string;
  /** Resumo dos comandos de validação que falharam (quando source = 'validation'). */
  testSummary?: string;
}

// formatLessons e distillLesson são implementados em tasks seguintes.
