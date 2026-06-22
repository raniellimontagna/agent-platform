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

  it('não marca auto-merge como elegível quando o PR não foi aberto', () => {
    const metrics = qualityMetricsForState({
      review: 'Veredito: APROVADO',
      testsPassed: true,
      autoMerge: true,
    } as never);

    expect(metrics.prOpened).toBe(false);
    expect(metrics.autoMergeEligible).toBe(false);
    expect(metrics.autoMergeBlockedReason).toBe('pull request not opened');
  });

  it('explica bloqueio de auto-merge quando a revisão está malformada', () => {
    const metrics = qualityMetricsForState({
      review: 'parecer sem veredito reconhecível',
      testsPassed: true,
      autoMerge: true,
    } as never);

    expect(metrics.autoMergeEligible).toBe(false);
    expect(metrics.autoMergeBlockedReason).toBe('critic verdict unrecognized');
  });

  it('distingue validação não executada de validação falhada', () => {
    const notRun = qualityMetricsForState({
      review: 'Veredito: APROVADO',
      testsPassed: undefined,
      autoMerge: true,
    } as never);
    const failed = qualityMetricsForState({
      review: 'Veredito: APROVADO',
      testsPassed: false,
      autoMerge: true,
    } as never);

    expect(notRun.autoMergeEligible).toBe(false);
    expect(failed.autoMergeEligible).toBe(false);
    expect(notRun.autoMergeBlockedReason).toBe('validation not run');
    expect(failed.autoMergeBlockedReason).toBe('validation failed');
    expect(notRun.autoMergeBlockedReason).not.toBe(failed.autoMergeBlockedReason);
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

  it('emite a linha de auto-merge quando não é elegível', () => {
    expect(
      formatQualityMetrics({
        criticVerdict: '—',
        criticRounds: 0,
        fixAttempts: 0,
        testsPassed: undefined,
        prOpened: false,
        autoMergeEligible: false,
        autoMergeBlockedReason: 'critic verdict unrecognized',
        estimatedCostUsd: 0,
      }),
    ).toContain('**Auto-merge:** bloqueado — critic verdict unrecognized');
  });
});
