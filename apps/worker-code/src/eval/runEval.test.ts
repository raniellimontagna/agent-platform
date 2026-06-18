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
      version: undefined,
      repo: undefined,
      candidate: undefined,
      commands: undefined,
      workerDryRun: undefined,
      expected: undefined,
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
      version: undefined,
      title: undefined,
      repo: undefined,
      candidate: undefined,
      commands: undefined,
      workerDryRun: undefined,
      expected: undefined,
    });
  });

  it('normaliza fixture v2 ad hoc para o shape canônico do harness', () => {
    expect(
      normalizeScenarioFixture({
        schemaVersion: '2',
        scenarioId: 'critic-max-rounds-3',
        title: 'Critic max rounds',
        inputs: {
          repo: {
            files: [{ path: 'README.md', content: 'hello' }],
          },
          candidate: [{ path: 'README.md', content: 'updated' }],
          workerDryRun: true,
          commands: ['pnpm test'],
        },
        review: {
          status: 'APROVADO COM RESSALVAS',
          action: 'recode',
        },
        expected: {
          finalVerdict: 'APROVADO COM RESSALVAS',
          autoMerge: {
            enabled: false,
            blockReason: 'Ressalva não-operacional requer revisão humana',
          },
          criticRounds: 3,
          maxCriticRounds: 3,
          commitRequiresRef: true,
          commitRequiresCoAuthoredBy: true,
          commitAuthorName: 'Ranielli Montagna',
          commitAuthorEmail: 'raniellimontagna@hotmail.com',
          isolation: {
            allowNetwork: false,
            allowGitHub: false,
            allowLinear: false,
            allowLiteLLM: false,
            externalCalls: [],
          },
        },
      }),
    ).toEqual({
      schemaVersion: '2',
      scenarioId: 'critic-max-rounds-3',
      title: 'Critic max rounds',
      inputs: {
        repo: {
          files: [{ path: 'README.md', content: 'hello' }],
        },
        candidate: [{ path: 'README.md', content: 'updated' }],
        workerDryRun: true,
        commands: ['pnpm test'],
      },
      review: {
        status: 'APROVADO COM RESSALVAS',
        action: 'recode',
      },
      expected: {
        finalVerdict: 'APROVADO COM RESSALVAS',
        autoMerge: {
          enabled: false,
          blockReason: 'Ressalva não-operacional requer revisão humana',
        },
        criticRounds: 3,
        maxCriticRounds: 3,
        commitRequiresRef: true,
        commitRequiresCoAuthoredBy: true,
        commitAuthorName: 'Ranielli Montagna',
        commitAuthorEmail: 'raniellimontagna@hotmail.com',
        isolation: {
          allowNetwork: false,
          allowGitHub: false,
          allowLinear: false,
          allowLiteLLM: false,
          externalCalls: [],
          externalCallsEmpty: true,
        },
        review: {
          verdict: 'APROVADO COM RESSALVAS',
          outcome: 'recode',
        },
        critic: {
          rounds: 3,
          maxRounds: 3,
        },
        commit: {
          requiresRef: true,
          requiresCoAuthoredBy: true,
          authorName: 'Ranielli Montagna',
          authorEmail: 'raniellimontagna@hotmail.com',
        },
      },
      id: 'critic-max-rounds-3',
      version: '2',
      repo: {
        files: [{ path: 'README.md', content: 'hello' }],
      },
      candidate: [{ path: 'README.md', content: 'updated' }],
      commands: ['pnpm test'],
      workerDryRun: true,
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
            check(true, 'eval verdict', 'APROVADO COM RESSALVAS operacional'),
            check(true, 'auto-merge expectation', 'yes'),
            check(true, 'critic rounds limit', '2/3'),
            check(true, 'review outcome', 'recode'),
            check(true, 'commit Ref trailer', 'present'),
            check(true, 'commit Co-authored-by trailer', 'present'),
          ],
        }),
      ]),
    );

    expect(markdown).toContain('Verdict: APROVADO COM RESSALVAS operacional');
    expect(markdown).toContain('Expected auto-merge: yes');
    expect(markdown).toContain('Review outcome: recode');
    expect(markdown).toContain('Critic rounds: 2/3');
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

  it('mostra checks estruturados do harness para commit, isolation e critic rounds', () => {
    const markdown = renderMarkdown(
      report([
        result('harness-structured', 70, {
          checks: [
            check(true, 'eval verdict', 'APROVADO'),
            check(true, 'auto-merge expectation', 'yes'),
            check(true, 'critic rounds limit', '3/3'),
            check(true, 'commit author', 'Ranielli Montagna <raniellimontagna@hotmail.com>'),
            check(true, 'commit Ref trailer', 'present'),
            check(true, 'commit Co-authored-by trailer', 'present'),
            check(
              false,
              'isolation policy',
              'allowNetwork=no; allowGitHub=no; allowLinear=no; allowLiteLLM=no; externalCalls=1',
            ),
          ],
        }),
      ]),
    );

    expect(markdown).toContain('Verdict: APROVADO');
    expect(markdown).toContain('Expected auto-merge: yes');
    expect(markdown).toContain('Critic rounds: 3/3');
    expect(markdown).toContain(
      'Commit policy: author Ranielli Montagna <raniellimontagna@hotmail.com>; Ref: present; Co-authored-by: present',
    );
    expect(markdown).toContain(
      '- FAIL isolation policy: allowNetwork=no; allowGitHub=no; allowLinear=no; allowLiteLLM=no; externalCalls=1',
    );
  });
});

function result(id: string, score: number, overrides: Partial<EvalResult> = {}): EvalResult {
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
