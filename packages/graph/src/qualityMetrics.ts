import { hasOnlyOperationalCaveats, shouldAutoMerge, verdictOf } from './nodes/report.js';
import type { AgentStateType } from './state.js';

export interface QualityMetrics {
  criticVerdict: string;
  criticRounds: number;
  fixAttempts: number;
  testsPassed?: boolean;
  prOpened: boolean;
  autoMergeEligible: boolean;
  autoMergeBlockedReason: string | null;
  estimatedCostUsd: number;
}

export function qualityMetricsForState(state: Partial<AgentStateType>): QualityMetrics {
  const criticVerdict = verdictOf(state.review);
  const prOpened = Boolean(state.prUrl);
  const autoMergeEligible =
    prOpened &&
    shouldAutoMerge({
      autoMerge: state.autoMerge,
      testsPassed: state.testsPassed,
      review: state.review,
    });

  return {
    criticVerdict,
    criticRounds: state.reviewRounds ?? 0,
    fixAttempts: state.fixAttempts ?? 0,
    testsPassed: state.testsPassed,
    prOpened,
    autoMergeEligible,
    autoMergeBlockedReason: autoMergeEligible ? null : autoMergeBlockedReason(state),
    estimatedCostUsd:
      (state.planCostUsd ?? 0) + (state.codeCostUsd ?? 0) + (state.reviewCostUsd ?? 0),
  };
}

function autoMergeBlockedReason(state: Partial<AgentStateType>): string | null {
  if (state.autoMerge !== true) return 'auto-merge not requested';
  if (state.testsPassed === undefined) return 'validation not run';
  if (state.testsPassed === false) return 'validation failed';
  if (!state.review) return 'critic verdict missing';
  const verdict = verdictOf(state.review);
  if (verdict === '—') return 'critic verdict unrecognized';
  if (verdict === 'REPROVADO') return 'critic rejected';
  if (verdict === 'APROVADO COM RESSALVAS' && !hasOnlyOperationalCaveats(state.review)) {
    return 'non-operational caveat requires manual review';
  }
  if (!state.prUrl) return 'pull request not opened';
  return null;
}

function validationLabel(value?: boolean): string {
  if (value === undefined) return 'não executada';
  return value ? 'passou' : 'falhou';
}

export function formatQualityMetrics(metrics: QualityMetrics): string[] {
  const lines = [
    `**Qualidade:** critic \`${metrics.criticVerdict}\`, validação ${validationLabel(metrics.testsPassed)}, ${metrics.prOpened ? 'PR aberto' : 'PR não aberto'}`,
    `**Loop:** ${metrics.criticRounds} volta(s) critic, ${metrics.fixAttempts} auto-correção(ões)`,
  ];

  if (metrics.autoMergeEligible) {
    lines.push('**Auto-merge:** elegível');
  } else {
    lines.push(
      metrics.autoMergeBlockedReason
        ? `**Auto-merge:** bloqueado — ${metrics.autoMergeBlockedReason}`
        : '**Auto-merge:** bloqueado',
    );
  }

  if (metrics.estimatedCostUsd > 0) {
    lines.push(`**Custo estimado por roles:** ~$${metrics.estimatedCostUsd.toFixed(4)}`);
  }

  return lines;
}
