import { describe, expect, it } from 'vitest';
import { formatQualityMetrics, qualityMetricsForState } from './qualityMetrics.js';

describe('qualityMetricsForState', () => {
  it('deriva sinais de qualidade do estado do run', () => {
    const metrics = qualityMetricsForState({
      review: 'Veredito: APROVADO',
      reviewRounds: 2,
      fixAttempts: 1,
      testsPassed: true,
      prUrl: 'https://github.com/acme/repo/pull/1',
      autoMerge: true,
      planCostUsd: 0.01,
      codeCostUsd: 0.02,
      reviewCostUsd: 0.03,
    } as never);

    expect(metrics).toEqual({
      criticVerdict: 'APROVADO',
      criticRounds: 2,
      fixAttempts: 1,
      testsPassed: true,
      prOpened: true,
      autoMergeEligible: true,
      autoMergeBlockedReason: null,
      estimatedCostUsd: 0.06,
    });
  });

  it('explica bloqueio de auto-merge por validação falha', () => {
    const metrics = qualityMetricsForState({
      review: 'Veredito: APROVADO',
      testsPassed: false,
      autoMerge: true,
    } as never);

    expect(metrics.autoMergeEligible).toBe(false);
    expect(metrics.autoMergeBlockedReason).toBe('validation failed');
  });
});

describe('formatQualityMetrics', () => {
  it('formata linhas concisas para o report', () => {
    expect(
      formatQualityMetrics({
        criticVerdict: 'APROVADO',
        criticRounds: 1,
        fixAttempts: 0,
        testsPassed: true,
        prOpened: true,
        autoMergeEligible: true,
        autoMergeBlockedReason: null,
        estimatedCostUsd: 0.0123,
      }),
    ).toContain('**Qualidade:** critic `APROVADO`, validação passou, PR aberto');
  });
});
