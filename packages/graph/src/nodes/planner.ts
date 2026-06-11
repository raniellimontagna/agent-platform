import type { LinearGateway } from '@agent-platform/linear';
import { type LlmClient, type TokenUsage, estimateCostUsd } from '@agent-platform/llm';
import type { AgentStateType } from '../state.js';

const SYSTEM_PROMPT = `Você é um agente planejador de engenharia de software.
Dada uma issue, produza um plano de execução claro e acionável em markdown:
- Entendimento do problema (2-3 linhas)
- Passos de implementação (lista numerada)
- Critérios de aceite
- Riscos e pontos que exigem aprovação humana (migrations, auth, infra, deploy)
Seja conciso e objetivo. Não escreva código ainda.`;

export interface PlannerDeps {
  llm: LlmClient;
  linear: LinearGateway;
}

/**
 * Nó PLANNING (MAC-16): lê a issue, gera um plano via alias `research` e
 * comenta no Linear (MAC-21). Deixa o status em `awaiting_approval`; o grafo
 * pausa antes de `coding` (interrupt → MAC-22).
 */
export function makePlannerNode(deps: PlannerDeps) {
  return async (state: AgentStateType): Promise<Partial<AgentStateType>> => {
    let usage: TokenUsage = { promptTokens: 0, completionTokens: 0 };
    const plan = await deps.llm.complete({
      alias: 'research',
      onUsage: (u) => {
        usage = u;
      },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Issue ${state.issueIdentifier}: ${state.title}\n\n${state.description}`,
        },
      ],
    });

    await deps.linear.comment(
      state.issueId,
      `## 🤖 Plano do agente\n\n${plan}\n\n---\n_Aguardando aprovação humana para executar._`,
    );

    return { plan, status: 'awaiting_approval', planCostUsd: estimateCostUsd('research', usage) };
  };
}
