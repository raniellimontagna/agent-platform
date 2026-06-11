import type { LinearGateway } from '@agent-platform/linear';
import type { AgentStateType } from '../state.js';

export interface ReportDeps {
  linear: LinearGateway;
}

/** Extrai a linha do veredito do parecer do critic (MAC-18). */
function verdictOf(review?: string): string {
  if (!review) return '—';
  const m = review.match(/Veredito\**:?\s*\**\s*([^\n*]+)/i);
  return m?.[1]?.trim() || '—';
}

/** Status da validação no sandbox (MAC-29) em texto curto. */
function testsLabel(testsPassed?: boolean): string {
  if (testsPassed === undefined) return 'não executada';
  return testsPassed ? '✅ passou' : '❌ falhou';
}

/**
 * Nó REPORT (MAC-21): posta UM comentário consolidado no Linear ao fim do run,
 * em sucesso ou falha. Os nós anteriores comentam o progresso ao vivo; este é o
 * TL;DR final — status, PR, veredito do critic, validação e branch/commit.
 */
export function makeReportNode(deps: ReportDeps) {
  return async (state: AgentStateType): Promise<Partial<AgentStateType>> => {
    const ok = state.status === 'completed';
    const header = ok
      ? `## ✅ Resultado — ${state.issueIdentifier}`
      : `## ❌ Resultado — ${state.issueIdentifier}`;

    const lines = [header, ''];
    lines.push(`**Status:** \`${state.status}\``);

    if (state.prUrl) lines.push(`**PR:** ${state.prUrl}`);
    if (state.branch) {
      const sha = state.commitSha ? ` (\`${state.commitSha.slice(0, 7)}\`)` : '';
      lines.push(`**Branch:** \`${state.branch}\`${sha}`);
    }
    if (state.pushed) {
      lines.push(`**Validação:** ${testsLabel(state.testsPassed)}`);
      lines.push(`**Revisão (critic):** ${verdictOf(state.review)}`);
    }
    if (state.summary) lines.push(`\n${state.summary}`);
    if (!ok && state.error) lines.push(`\n\`\`\`\n${state.error}\n\`\`\``);

    await deps.linear.comment(state.issueId, lines.join('\n'));
    return {};
  };
}
