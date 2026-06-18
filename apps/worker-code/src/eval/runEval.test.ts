import { describe, expect, it } from 'vitest';
import { compareReports, normalizeScenarioFixture, renderMarkdown } from './runEval.js';
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

describe('normalizeScenarioFixture', () => {
  it('migra scenarioId para id sem remover os demais campos', () => {
    expect(
      normalizeScenarioFixture({
        scenarioId: 'review-noop-commit-trailers',
        title: 'Review noop',
      }),
    ).toEqual({
      scenarioId: 'review-noop-commit-trailers',
      id: 'review-noop-commit-trailers',
      title: 'Review noop',
    });
  });

  it('preserva id quando já existe', () => {
    expect(
      normalizeScenarioFixture({
        id: 'canonical-id',
        scenarioId: 'legacy-id',
      }),
    ).toEqual({
      id: 'canonical-id',
      scenarioId: 'legacy-id',
    });
  });
});

describe('renderMarkdown', () => {
  it('expõe veredito, auto-merge e motivo de bloqueio no report', () => {
    const markdown = renderMarkdown(
      report([
        result('auto-merge-blocked', 100, {
          dryRun: {
            reviewVerdict: 'APROVADO COM RESSALVAS',
            expectedAutoMerge: false,
            autoMergeBlockReason: 'Ressalva não-operacional requer revisão humana',
            reviewOutcome: 'recode',
            criticRounds: 3,
            maxReviewRounds: 3,
            commitMessage:
              'fix(worker): adjust critic loop\n\nRef: MAC-85\n\nCo-authored-by: Codex <noreply@openai.com>',
            commitAuthorName: 'Ranielli Montagna',
            commitAuthorEmail: 'raniellimontagna@hotmail.com',
            branch: 'eval/auto-merge-blocked',
            pushed: false,
            fixAttempts: 3,
            filesChanged: [],
          },
        }),
      ]),
    );

    expect(markdown).toContain('Verdict: APROVADO COM RESSALVAS');
    expect(markdown).toContain('Expected auto-merge: no');
    expect(markdown).toContain(
      'Auto-merge block reason: Ressalva não-operacional requer revisão humana',
    );
    expect(markdown).toContain('Review outcome: recode');
    expect(markdown).toContain('Critic rounds: 3/3');
    expect(markdown).toContain(
      'Commit policy: author Ranielli Montagna <raniellimontagna@hotmail.com>; Ref: present; Co-authored-by: present',
    );
  });

  it('expõe cenário no-op e auto-merge liberado', () => {
    const markdown = renderMarkdown(
      report([
        result('noop-approved', 100, {
          dryRun: {
            verdict: 'APROVADO',
            autoMergeExpected: true,
            reviewOutcome: 'no-op',
            branch: 'eval/noop-approved',
            pushed: true,
            fixAttempts: 0,
            filesChanged: [],
          },
        }),
      ]),
    );

    expect(markdown).toContain('Verdict: APROVADO');
    expect(markdown).toContain('Expected auto-merge: yes');
    expect(markdown).toContain('Review outcome: no-op');
  });

  it('faz fallback para checks quando o dry-run não traz os campos v2', () => {
    const markdown = renderMarkdown(
      report([
        result('fallback-checks', 80, {
          checks: [
            check(true, 'review verdict', 'APROVADO COM RESSALVAS operacional'),
            check(true, 'auto-merge', 'allowed for operational ressalva'),
            check(true, 'critic loop', 'recode completed after critic round 2'),
            check(true, 'review outcome', 'recode'),
            check(true, 'commit message', 'Ref: MAC-84\nCo-authored-by: Codex <noreply@openai.com>'),
          ],
        }),
      ]),
    );

    expect(markdown).toContain('Verdict: APROVADO COM RESSALVAS operacional');
    expect(markdown).toContain('Expected auto-merge: yes');
    expect(markdown).toContain('Review outcome: recode');
    expect(markdown).toContain('Commit policy: Ref: present; Co-authored-by: present');
  });

  it('não infere bloqueio a partir de textos como not blocked ou no-op', () => {
    const markdown = renderMarkdown(
      report([
        result('not-blocked-noop', 100, {
          checks: [
            check(true, 'auto-merge status', 'auto-merge not blocked; no block reason'),
            check(true, 'review outcome', 'no-op'),
          ],
        }),
      ]),
    );

    expect(markdown).toContain('Expected auto-merge: yes');
    expect(markdown).toContain('Review outcome: no-op');
    expect(markdown).not.toContain('Auto-merge block reason:');
  });

  it('só exibe block reason inferido quando auto-merge está realmente bloqueado', () => {
    const markdown = renderMarkdown(
      report([
        result('blocked-by-check', 80, {
          checks: [
            check(
              true,
              'auto-merge gate',
              'auto-merge blocked: ressalva não-operacional requer revisão humana',
            ),
          ],
        }),
      ]),
    );

    expect(markdown).toContain('Expected auto-merge: no');
    expect(markdown).toContain(
      'Auto-merge block reason: auto-merge blocked: ressalva não-operacional requer revisão humana',
    );
  });
});

function result(
  id: string,
  score: number,
  overrides: Partial<EvalResult> = {},
): EvalResult {
  return {
    id,
    title: id,
    passed: score === 100,
    score,
    changedFiles: [],
    commands: [],
    checks: [],
    artifactDir: `/tmp/${id}`,
    ...overrides,
  };
}

function check(passed: boolean, name: string, detail: string): EvalResult['checks'][number] {
  return {
    passed,
    name,
    detail,
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
