import { describe, expect, it } from 'vitest';
import { type Lesson, formatLessons } from './index.js';
import { type DistillInput, distillLesson } from './index.js';
import type { LlmClient } from '@agent-platform/llm';

function lesson(text: string, createdAt = new Date()): Lesson {
  return { id: 'x', repo: 'o/r', source: 'critic', text, runId: 'run', createdAt };
}

describe('formatLessons', () => {
  it('retorna vazio quando não há lições', () => {
    expect(formatLessons([], 10)).toBe('');
  });

  it('formata como bullets markdown', () => {
    const out = formatLessons([lesson('Não faça A'), lesson('Sempre faça B')], 10);
    expect(out).toBe('- Não faça A\n- Sempre faça B');
  });

  it('deduplica lições textualmente iguais (ignorando caixa/espaços)', () => {
    const out = formatLessons([lesson('Não faça A'), lesson('  não  faça a ')], 10);
    expect(out).toBe('- Não faça A');
  });

  it('respeita o cap mantendo as primeiras (mais recentes)', () => {
    const out = formatLessons([lesson('A'), lesson('B'), lesson('C')], 2);
    expect(out).toBe('- A\n- B');
  });
});

function fakeLlm(reply: string): LlmClient {
  return { complete: async () => reply };
}

describe('distillLesson', () => {
  it('devolve a regra destilada do parecer do critic', async () => {
    const input: DistillInput = { source: 'critic', review: 'Veredito: REPROVADO\nFaltou tratar null.' };
    const out = await distillLesson(fakeLlm('Sempre trate null em X porque quebra Y'), input);
    expect(out).toBe('Sempre trate null em X porque quebra Y');
  });

  it('devolve null quando o modelo responde NONE', async () => {
    const out = await distillLesson(fakeLlm('NONE'), { source: 'validation', testSummary: 'timeout' });
    expect(out).toBeNull();
  });

  it('devolve null quando o modelo responde vazio', async () => {
    const out = await distillLesson(fakeLlm('   '), { source: 'critic', review: 'x' });
    expect(out).toBeNull();
  });
});
