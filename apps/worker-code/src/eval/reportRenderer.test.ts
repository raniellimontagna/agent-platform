import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './reportRenderer.js';
import type { EvalCheck, EvalReport, EvalResult } from './types.js';

describe('renderMarkdown', () => {
  it('preserves report heading, trend, dry-run, insight, and check wording', () => {
    const markdown = renderMarkdown(
      report([
        result('auto-merge-blocked', 70, {
          dryRun: {
            branch: 'eval/auto-merge-blocked',
            pushed: false,
            fixAttempts: 3,
            commitSha: 'abc123',
            diff: '',
            filesChanged: ['README.md'],
            prTitle: 'fix(eval): block merge',
            summary: 'Blocks unsafe merge.',
            reviewVerdict: 'APROVADO COM RESSALVAS',
            reviewOutcome: 'recode',
            autoMergeExpected: false,
            autoMergeBlockedBy: 'manual review required',
            criticRounds: 3,
            maxCriticRounds: 3,
            commitMessage:
              'fix(eval): block merge\n\nRef: MAC-85\n\nCo-authored-by: Codex <noreply@openai.com>',
            commitAuthor: {
              name: 'Ranielli Montagna',
              email: 'raniellimontagna@hotmail.com',
            },
          },
          checks: [
            check(false, 'isolation policy', 'allowNetwork=no; externalCalls=1'),
          ],
        }),
      ]),
    );

    expect(markdown).toContain('# Agent Eval Report');
    expect(markdown).toContain('Result: FAIL');
    expect(markdown).toContain('Previous score: 90');
    expect(markdown).toContain('Score delta: -20');
    expect(markdown).toContain('Regressed scenarios: auto-merge-blocked');
    expect(markdown).toContain('Verdict: APROVADO COM RESSALVAS');
    expect(markdown).toContain('Expected auto-merge: no');
    expect(markdown).toContain('Auto-merge block reason: manual review required');
    expect(markdown).toContain('Review outcome: recode');
    expect(markdown).toContain('Critic rounds: 3/3');
    expect(markdown).toContain('Dry-run branch: eval/auto-merge-blocked');
    expect(markdown).toContain('Dry-run pushed: false');
    expect(markdown).toContain('Dry-run fixes: 3');
    expect(markdown).toContain('Dry-run commit: abc123');
    expect(markdown).toContain(
      'Commit policy: author Ranielli Montagna <raniellimontagna@hotmail.com>; Ref: present; Co-authored-by: present',
    );
    expect(markdown).toContain('- FAIL isolation policy: allowNetwork=no; externalCalls=1');
  });
});

function result(id: string, score: number, overrides: Partial<EvalResult> = {}): EvalResult {
  return {
    id,
    title: id,
    passed: score === 100,
    score,
    changedFiles: ['README.md'],
    commands: [],
    checks: [],
    artifactDir: `/tmp/${id}`,
    ...overrides,
  };
}

function check(passed: boolean, name: string, detail: string): EvalCheck {
  return { passed, name, detail };
}

function report(results: EvalResult[]): EvalReport {
  return {
    generatedAt: '2026-06-16T00-00-00-000Z',
    passed: results.every((item) => item.passed),
    total: results.length,
    passedCount: results.filter((item) => item.passed).length,
    score: 70,
    trend: {
      previousGeneratedAt: '2026-06-15T00-00-00-000Z',
      previousScore: 90,
      scoreDelta: -20,
      regressed: true,
      regressedScenarios: ['auto-merge-blocked'],
    },
    results,
  };
}
