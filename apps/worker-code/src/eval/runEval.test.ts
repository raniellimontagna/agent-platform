import { describe, expect, it } from 'vitest';
import { compareReports, renderMarkdown } from './runEval.js';
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

describe('renderMarkdown', () => {
  it('expõe veredito, auto-merge, bloqueio, review flow e política de commit', () => {
    const reviewResult = result('critic-v2', 100, [
      {
        name: 'critic verdict',
        passed: true,
        detail: 'APROVADO COM RESSALVAS (operacional)',
      },
      {
        name: 'auto-merge policy',
        passed: true,
        detail: 'auto-merge expected: allowed',
      },
      {
        name: 'review flow',
        passed: true,
        detail: 'review no-op after 3 critic rounds; proceed to PR',
      },
      {
        name: 'commit policy',
        passed: true,
        detail: 'commit includes Ref: MAC-86 and Co-authored-by: Codex <noreply@openai.com>',
      },
    ]);

    const blockedResult = result('blocked-v2', 60, [
      {
        name: 'critic verdict',
        passed: true,
        detail: 'APROVADO COM RESSALVAS (não-operacional)',
      },
      {
        name: 'auto-merge policy',
        passed: false,
        detail: 'auto-merge blocked',
      },
      {
        name: 'merge block reason',
        passed: false,
        detail: 'ressalva não-operacional exige PR sem auto-merge',
      },
      {
        name: 'review flow',
        passed: false,
        detail: 'review requires recode before PR',
      },
    ]);

    const markdown = renderMarkdown(report([reviewResult, blockedResult]));

    expect(markdown).toContain('Verdict: APROVADO COM RESSALVAS (operacional)');
    expect(markdown).toContain('Expected auto-merge: auto-merge expected: allowed');
    expect(markdown).toContain('Review flow: review no-op after 3 critic rounds; proceed to PR');
    expect(markdown).toContain(
      'Commit policy: commit includes Ref: MAC-86 and Co-authored-by: Codex <noreply@openai.com>',
    );
    expect(markdown).toContain('Expected auto-merge: auto-merge blocked');
    expect(markdown).toContain('Block reason: ressalva não-operacional exige PR sem auto-merge');
    expect(markdown).toContain('Review flow: review requires recode before PR');
  });

  it('não inventa motivo de bloqueio quando o cenário segue para PR sem bloqueio', () => {
    const noopResult = result('noop-v2', 100, [
      {
        name: 'critic verdict',
        passed: true,
        detail: 'APROVADO',
      },
      {
        name: 'auto-merge policy',
        passed: true,
        detail: 'auto-merge expected: allowed',
      },
      {
        name: 'review flow',
        passed: true,
        detail: 'review no-op; proceed to PR',
      },
    ]);

    const markdown = renderMarkdown(report([noopResult]));

    expect(markdown).toContain('Verdict: APROVADO');
    expect(markdown).toContain('Expected auto-merge: auto-merge expected: allowed');
    expect(markdown).toContain('Review flow: review no-op; proceed to PR');
    expect(markdown).not.toContain('Block reason:');
  });
});

function result(
  id: string,
  score: number,
  checks: EvalResult['checks'] = [],
): EvalResult {
  return {
    id,
    title: id,
    passed: score === 100,
    score,
    changedFiles: [],
    commands: [],
    checks,
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
