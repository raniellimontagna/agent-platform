import type { EvalReport, EvalResult, EvalTrend } from './types.js';

export function compareReports(
  results: EvalResult[],
  score: number,
  previous?: EvalReport,
): EvalTrend {
  if (!previous) return { regressed: false, regressedScenarios: [] };
  const previousScores = new Map(previous.results.map((result) => [result.id, result.score]));
  const regressedScenarios = results
    .filter((result) => {
      const previousScore = previousScores.get(result.id);
      return previousScore !== undefined && result.score < previousScore;
    })
    .map((result) => result.id);
  const scoreDelta = score - previous.score;
  return {
    previousGeneratedAt: previous.generatedAt,
    previousScore: previous.score,
    scoreDelta,
    regressed: scoreDelta < 0 || regressedScenarios.length > 0,
    regressedScenarios,
  };
}

export function reportSummary(report: EvalReport): Record<string, unknown> {
  return {
    generatedAt: report.generatedAt,
    passed: report.passed,
    total: report.total,
    passedCount: report.passedCount,
    score: report.score,
    previousScore: report.trend?.previousScore,
    scoreDelta: report.trend?.scoreDelta,
    regressed: report.trend?.regressed ?? false,
    regressedScenarios: report.trend?.regressedScenarios ?? [],
  };
}

export function formatDelta(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}
