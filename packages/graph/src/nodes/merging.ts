import { type GithubGateway, parseRepoFullName } from '@agent-platform/github';
import type { CardGateway } from '@agent-platform/cards';
import type { AgentStateType } from '../state.js';
import { shouldAutoMerge } from './report.js';

export interface MergingDeps {
  github: GithubGateway;
  cards: CardGateway;
  /** Estado "Done" do time no Linear (move a issue ao mergear). */
  doneStateId: string;
}

/**
 * Nó MERGING (MAC-67): auto-merge opt-in. Roda entre `pr` e `report`. No-op se o
 * gate (label + validação ✅ + critic APROVADO seco) não passa — o Draft PR fica
 * pra merge manual. Non-fatal: falha de merge deixa o PR aberto, não derruba o run.
 */
export function makeMergingNode(deps: MergingDeps) {
  return async (state: AgentStateType): Promise<Partial<AgentStateType>> => {
    if (!shouldAutoMerge(state) || !state.prNumber) return {};
    const targetRepo = state.targetRepo ? parseRepoFullName(state.targetRepo) : undefined;
    try {
      await deps.github.mergePullRequest({
        number: state.prNumber,
        method: 'squash',
        ...(targetRepo ? { repo: targetRepo } : {}),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await deps.cards.comment(
        state.issueId,
        `## ⚠️ Auto-merge falhou — merge manual\n\n\`\`\`\n${msg}\n\`\`\``,
      );
      return {};
    }
    // Pós-merge best-effort (não reverte o merge se algo aqui falhar).
    try {
      if (state.branch) {
        if (targetRepo) await deps.github.deleteBranch(state.branch, targetRepo);
        else await deps.github.deleteBranch(state.branch);
      }
      await deps.cards.setCardState(state.issueId, deps.doneStateId);
      await deps.cards.comment(
        state.issueId,
        `## ✅ Auto-merge na main\nPR #${state.prNumber} mergeado (squash) e branch \`${state.branch}\` removida.`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await deps.cards.comment(state.issueId, `## ⚠️ Pós-merge parcial\n\`\`\`\n${msg}\n\`\`\``);
    }
    return { autoMerged: true };
  };
}
