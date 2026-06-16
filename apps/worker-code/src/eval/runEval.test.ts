import { describe, expect, it } from 'vitest';
import { compareReports } from './runEval.js';
import type { EvalReport, EvalResult } from './types.js';

describe('compareReports', () => {
  it('marca regressão quando o score agregado cai', () => {
    const trend = compareReports(
      [result('docs-note', 100)],
      90,
      report([result('docs-note', 100)]),
    );

    expect(trend.regressed).toBe(true);
    expect(trend.previousScore).toBe(100);
    expect(trend.scoreDelta).toBe(-10);
  });

  it('marca cenário específico que piorou mesmo com score agregado estável', () => {
    const trend = compareReports(
      [result('a', 90), result('b', 100), result('c', 60)],
      83,
      report([result('a', 100), result('b', 100), result('c', 50)]),
    );

    expect(trend.regressed).toBe(true);
    expect(trend.scoreDelta).toBe(0);
    expect(trend.regressedScenarios).toEqual(['a']);
  });

  it('não marca regressão quando não há baseline anterior', () => {
    expect(compareReports([result('a', 100)], 100).regressed).toBe(false);
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

function report(results: EvalResult[]): EvalReport {
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
  };
}
