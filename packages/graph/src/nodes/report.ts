import type { CardGateway } from '@agent-platform/cards';
import type { AgentStateType } from '../state.js';

export interface ReportDeps {
  cards: CardGateway;
}

/** Extrai a linha do veredito do parecer do critic (MAC-18). Exportado p/ teste. */
export function verdictOf(review?: string): string {
  if (!review) return '—';
  // Exige os dois-pontos do rótulo "Veredito:" — evita casar a palavra solta.
  const m = review.match(/Veredito\**\s*:\s*\**\s*([^\n*]+)/i);
  return m?.[1]?.trim() || '—';
}

/**
 * Ressalvas operacionais são observações de validação/evidência externa ao diff:
 * o coder não consegue corrigir sem violar escopo ou inventar evidência. Mantém
 * bugs/segurança/lógica/testes quebrados como bloqueantes.
 */
export function hasOnlyOperationalCaveats(review?: string): boolean {
  if (!review) return false;
  if (verdictOf(review) !== 'APROVADO COM RESSALVAS') return false;

  const text = review.toLowerCase();
  const normalized = text.replace(/\*\*/g, '');
  const problems = normalized.match(/##\s*problemas([\s\S]*?)(?:\n##\s|\n#\s|$)/i)?.[1] ?? '';
  if (/^\s*[-*]\s+\S/m.test(problems)) return false;

  const explicitlyNonBlocking =
    /nenhum (bug|problema) bloqueante|sem (bug|problema) bloqueante/.test(problems);
  if (explicitlyNonBlocking) return true;

  const operational =
    /valida[cç][aã]o operacional|evid[eê]ncia|consulta ao banco|sandbox_backend|e2e real|p[oó]s-merge|processo/.test(
      text,
    );
  const blocking =
    /bug|seguran[cç]a|vulnerab|l[oó]gica incorreta|falha funcional|quebra|regress[aã]o|teste(s)? falh/.test(
      text,
    );

  return operational && !blocking;
}

/**
 * Gate do auto-merge (MAC-67): opt-in (label → run.auto_merge) + validação ✅ +
 * critic APROVADO seco ou ressalva operacional não bloqueante.
 */
export function shouldAutoMerge(state: {
  autoMerge?: boolean;
  testsPassed?: boolean;
  review?: string;
}): boolean {
  if (state.autoMerge !== true || state.testsPassed !== true) return false;
  return verdictOf(state.review) === 'APROVADO' || hasOnlyOperationalCaveats(state.review);
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
      if (state.fixAttempts && state.fixAttempts > 0) {
        lines.push(`**Auto-correção:** ${state.fixAttempts} tentativa(s)`);
      }
      if (state.reviewRounds && state.reviewRounds > 0) {
        lines.push(`**Revisões (loop critic):** ${state.reviewRounds} volta(s)`);
      }
    }
    const cost = (state.planCostUsd ?? 0) + (state.codeCostUsd ?? 0) + (state.reviewCostUsd ?? 0);
    if (cost > 0) lines.push(`**Custo estimado:** ~$${cost.toFixed(4)}`);
    if (state.summary) lines.push(`\n${state.summary}`);
    if (!ok && state.error) lines.push(`\n\`\`\`\n${state.error}\n\`\`\``);

    await deps.cards.comment(state.issueId, lines.join('\n'));
    return {};
  };
}
