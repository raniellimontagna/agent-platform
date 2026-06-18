import { describe, expect, it } from 'vitest';
import { decideAfterReview } from './review.js';

const opts = { maxReviewRounds: 1, maxCostPerRunUsd: 2 };
const base = { reviewRounds: 0, lastReview: '', totalCostUsd: 0 };

describe('decideAfterReview', () => {
  it('APROVADO seco → pr', () => {
    const r = decideAfterReview({ ...base, review: '**Veredito**: APROVADO' }, opts);
    expect(r).toBe('pr');
  });

  it('REPROVADO com rounds < teto → coding', () => {
    const r = decideAfterReview({ ...base, review: 'Veredito: REPROVADO' }, opts);
    expect(r).toBe('coding');
  });

  it('APROVADO COM RESSALVAS com rounds < teto → coding', () => {
    const r = decideAfterReview({ ...base, review: 'Veredito: APROVADO COM RESSALVAS' }, opts);
    expect(r).toBe('coding');
  });

  it('APROVADO COM RESSALVAS só operacional → pr', () => {
    const r = decideAfterReview(
      {
        ...base,
        review:
          'Veredito: APROVADO COM RESSALVAS\nValidação operacional ausente: anexar evidência do E2E real e consulta ao banco com sandbox_backend = docker.',
      },
      opts,
    );
    expect(r).toBe('pr');
  });

  it('REPROVADO com rounds == teto → failed', () => {
    const r = decideAfterReview({ ...base, reviewRounds: 1, review: 'Veredito: REPROVADO' }, opts);
    expect(r).toBe('failed');
  });

  it('APROVADO COM RESSALVAS com rounds == teto → pr manual', () => {
    const r = decideAfterReview(
      { ...base, reviewRounds: 1, review: 'Veredito: APROVADO COM RESSALVAS' },
      opts,
    );
    expect(r).toBe('pr');
  });

  it('no-progress REPROVADO (parecer idêntico ao anterior) → failed', () => {
    const review = 'Veredito: REPROVADO\nmesmo problema';
    const r = decideAfterReview(
      { ...base, reviewRounds: 1, lastReview: review, review },
      { maxReviewRounds: 3, maxCostPerRunUsd: 2 },
    );
    expect(r).toBe('failed');
  });

  it('custo acumulado >= teto com REPROVADO → failed', () => {
    const r = decideAfterReview({ ...base, review: 'Veredito: REPROVADO', totalCostUsd: 2 }, opts);
    expect(r).toBe('failed');
  });

  it('sem veredito parseável (—) → pr', () => {
    const r = decideAfterReview({ ...base, review: 'parecer sem rótulo' }, opts);
    expect(r).toBe('pr');
  });
});
