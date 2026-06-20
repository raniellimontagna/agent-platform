import { type GithubGateway, parseRepoFullName } from '@agent-platform/github';
import type { CardGateway } from '@agent-platform/cards';
import type { AgentStateType } from '../state.js';
import { shouldAutoMerge } from './report.js';

export interface PrDeps {
  github: GithubGateway;
  cards: CardGateway;
  /** Branch base do PR (default: main). */
  baseBranch: string;
}

/**
 * Nó PR (MAC-26): abre um Draft PR no GitHub a partir da branch que o Coder
 * pushou, linkando a issue do Linear, e comenta o link no Linear (MAC-21).
 *
 * Só roda quando o Coder pushou a branch (`pushed`). Sem push, encerra como
 * `failed` sem tentar abrir PR.
 */
export function makePrNode(deps: PrDeps) {
  return async (state: AgentStateType): Promise<Partial<AgentStateType>> => {
    if (!state.pushed || !state.branch) {
      return { status: 'failed', error: state.error ?? 'branch não foi pushada; PR não aberto' };
    }

    try {
      // Título Conventional Commits em inglês (MAC-26); fallback p/ id+título.
      const title = state.prTitle?.trim()
        ? `${state.prTitle} (${state.issueIdentifier})`
        : `${state.issueIdentifier}: ${state.title}`;
      const testsLine =
        state.testsPassed === undefined
          ? ''
          : `\n## Validação\n${state.testsPassed ? '✅ passou' : '❌ falhou'}\n${state.testSummary ?? ''}`;

      const body = [
        `Closes ${state.issueIdentifier} _(via agent-platform)_.`,
        state.summary ? `\n## Resumo\n${state.summary}` : '',
        testsLine,
        state.review ? `\n## Revisão automática (critic)\n${state.review}` : '',
        state.plan ? `\n## Plano\n${state.plan}` : '',
        '\n---\n🤖 PR aberto automaticamente pelo agent-platform. Revisão humana necessária.',
      ].join('\n');

      const autoMerge = shouldAutoMerge(state);
      const pr = await deps.github.createPullRequest({
        head: state.branch,
        base: deps.baseBranch,
        title,
        body,
        draft: !autoMerge, // gate ok → PR pronto p/ merge; senão Draft (manual)
        ...(state.targetRepo ? { repo: parseRepoFullName(state.targetRepo) } : {}),
      });

      await deps.cards.comment(
        state.issueId,
        `## 🔀 Draft PR aberto\n[#${pr.number}](${pr.url}) — branch \`${state.branch}\`.`,
      );

      return { prUrl: pr.url, prNumber: pr.number, status: 'completed' };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await deps.cards.comment(
        state.issueId,
        `## ⚠️ Falha ao abrir o PR\n\n\`\`\`\n${message}\n\`\`\``,
      );
      return { status: 'failed', error: message };
    }
  };
}
