import type { GithubGateway } from '@agent-platform/github';
import type { LinearGateway } from '@agent-platform/linear';
import type { AgentStateType } from '../state.js';

export interface PrDeps {
  github: GithubGateway;
  linear: LinearGateway;
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
      const title = `${state.issueIdentifier}: ${state.title}`;
      const body = [
        `Closes ${state.issueIdentifier} _(via agent-platform)_.`,
        state.summary ? `\n## Resumo\n${state.summary}` : '',
        state.plan ? `\n## Plano\n${state.plan}` : '',
        '\n---\n🤖 PR aberto automaticamente pelo agent-platform. Revisão humana necessária.',
      ].join('\n');

      const pr = await deps.github.createPullRequest({
        head: state.branch,
        base: deps.baseBranch,
        title,
        body,
      });

      await deps.linear.comment(
        state.issueId,
        `## 🔀 Draft PR aberto\n[#${pr.number}](${pr.url}) — branch \`${state.branch}\`.`,
      );

      return { prUrl: pr.url, status: 'completed' };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await deps.linear.comment(
        state.issueId,
        `## ⚠️ Falha ao abrir o PR\n\n\`\`\`\n${message}\n\`\`\``,
      );
      return { status: 'failed', error: message };
    }
  };
}
