import { describe, expect, it, vi } from 'vitest';
import type { Lesson } from '@agent-platform/memory';
import { buildLessonLoader } from './lessonLoader.js';

function lesson(text: string): Lesson {
  return { id: 'x', repo: 'o/r', source: 'critic', text, runId: 'r', createdAt: new Date() };
}

const deps = (over: Partial<Parameters<typeof buildLessonLoader>[1]>) => ({
  embed: vi.fn(async () => [0, 1, 2]),
  searchLessons: vi.fn(async () => [] as Lesson[]),
  listLessons: vi.fn(async () => [lesson('recência A')]),
  ...over,
});

describe('buildLessonLoader', () => {
  it('usa busca semântica quando há hits', async () => {
    const d = deps({ searchLessons: vi.fn(async () => [lesson('semântica X')]) });
    const out = await buildLessonLoader('o/r', d)('corrigir auth');
    expect(out).toBe('- semântica X');
    expect(d.embed).toHaveBeenCalled();
    expect(d.listLessons).not.toHaveBeenCalled();
  });

  it('cai pra recência quando a busca não retorna hits', async () => {
    const d = deps({});
    const out = await buildLessonLoader('o/r', d)('corrigir auth');
    expect(out).toBe('- recência A');
    expect(d.listLessons).toHaveBeenCalled();
  });

  it('cai pra recência quando o embed falha', async () => {
    const d = deps({ embed: vi.fn(async () => { throw new Error('sem modelo'); }) });
    const out = await buildLessonLoader('o/r', d)('corrigir auth');
    expect(out).toBe('- recência A');
  });

  it('cai pra recência quando a query é vazia', async () => {
    const d = deps({});
    const out = await buildLessonLoader('o/r', d)('   ');
    expect(out).toBe('- recência A');
    expect(d.embed).not.toHaveBeenCalled();
  });
});
