import { describe, expect, it } from 'vitest';
import { compareReports, formatDelta, reportSummary } from './trend.js';
import type { EvalReport, EvalResult } from './types.js';

describe('compareReports', () => {
  it('marks aggregate score regressions and formats negative deltas', () => {
    const trend = compareReports([result('docs-note', 90)], 90, report([result('docs-note', 100)]));

    expect(trend).toMatchObject({
      previousGeneratedAt: '2026-06-16T00-00-00-000Z',
      previousScore: 100,
      scoreDelta: -10,
      regressed: true,
      regressedScenarios: ['docs-note'],
    });
    expect(formatDelta(trend.scoreDelta ?? 0)).toBe('-10');
  });

  it('marks scenario-specific regressions when aggregate score is stable', () => {
    const trend = compareReports(
      [result('a', 90), result('b', 100), result('c', 60)],
      83,
      report([result('a', 100), result('b', 100), result('c', 50)], { score: 83 }),
    );

    expect(trend.regressed).toBe(true);
    expect(trend.scoreDelta).toBe(0);
    expect(trend.regressedScenarios).toEqual(['a']);
  });
});

describe('reportSummary', () => {
  it('preserves history.jsonl summary fields and positive delta formatting', () => {
    const summary = reportSummary(
      report([result('docs-note', 100)], {
        score: 100,
        trend: {
          previousGeneratedAt: '2026-06-15T00-00-00-000Z',
          previousScore: 95,
          scoreDelta: 5,
          regressed: false,
          regressedScenarios: [],
        },
      }),
    );

    expect(summary).toEqual({
      generatedAt: '2026-06-16T00-00-00-000Z',
      passed: true,
      total: 1,
      passedCount: 1,
      score: 100,
      previousScore: 95,
      scoreDelta: 5,
      regressed: false,
      regressedScenarios: [],
    });
    expect(formatDelta(5)).toBe('+5');
  });
});

function result(id: string, score: number): EvalResult {
  return {
    id,
    title: id,
    passed: score === 100,
    score,
    changedFiles: [],
    commands: [],
    checks: [],
    artifactDir: `/tmp/${id}`,
  };
}

function report(results: EvalResult[], overrides: Partial<EvalReport> = {}): EvalReport {
  const score =
    results.length === 0
      ? 100
      : Math.round(results.reduce((sum, item) => sum + item.score, 0) / results.length);
  return {
    generatedAt: '2026-06-16T00-00-00-000Z',
    passed: results.every((item) => item.passed),
    total: results.length,
    passedCount: results.filter((item) => item.passed).length,
    score,
    results,
    ...overrides,
  };
}
