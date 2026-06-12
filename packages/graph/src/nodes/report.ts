import type { LinearGateway } from '@agent-platform/linear';
import type { AgentStateType } from '../state.js';

export interface ReportDeps {
  linear: LinearGateway;
}

/** Extrai a linha do veredito do parecer do critic (MAC-18). Exportado p/ teste. */
export function verdictOf(review?: string): string {
  if (!review) return '—';
  // Exige os dois-pontos do rótulo "Veredito:" — evita casar a palavra solta.
  const m = review.match(/Veredito\**\s*:\s*\**\s*([^\n*]+)/i);
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
    const verdict = verdictOf(state.review);
    const reproved = /REPROVADO/i.test(verdict);
    const testsFailed = state.testsPassed === false;
    // ✅ só quando o run terminou E passou na validação E não foi reprovado;
    // ⚠️ quando terminou mas há falha de validação/revisão; ❌ quando o run falhou.
    const icon = !ok ? '❌' : reproved || testsFailed ? '⚠️' : '✅';

    const lines = [`## ${icon} Resultado — ${state.issueIdentifier}`, ''];
    lines.push(`**Status:** \`${state.status}\``);

    if (state.prUrl) lines.push(`**PR:** ${state.prUrl}`);
    if (state.branch) {
      const sha = state.commitSha ? ` (\`${state.commitSha.slice(0, 7)}\`)` : '';
      lines.push(`**Branch:** \`${state.branch}\`${sha}`);
    }
    if (state.pushed) {
      lines.push(`**Validação:** ${testsLabel(state.testsPassed)}`);
      lines.push(`**Revisão (critic):** ${verdict}`);
    }
    const cost = (state.planCostUsd ?? 0) + (state.codeCostUsd ?? 0) + (state.reviewCostUsd ?? 0);
    if (cost > 0) lines.push(`**Custo estimado:** ~$${cost.toFixed(4)}`);
    if (state.summary) lines.push(`\n${state.summary}`);
    if (!ok && state.error) lines.push(`\n\`\`\`\n${state.error}\n\`\`\``);

    await deps.linear.comment(state.issueId, lines.join('\n'));
    return {};
  };
}
