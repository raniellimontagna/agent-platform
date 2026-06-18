import type { LinearGateway } from '@agent-platform/linear';
import { type LlmClient, type TokenUsage, estimateCostUsd } from '@agent-platform/llm';
import {
  criticalReasons,
  parseApprovalReasons,
  reasonLabel,
  stripApprovalReasonsLine,
} from '@agent-platform/policy';
import type { AgentStateType } from '../state.js';

export const PLANNER_SYSTEM_PROMPT = `Você é um agente planejador de engenharia de software.
Use um contrato de planejamento Superpowers-inspired: especificação clara, tarefas pequenas,
TDD quando houver mudança de comportamento, revisão objetiva e verificação antes de concluir.

Dada uma issue, produza um plano de execução claro e acionável em markdown.
Se a issue for simples, seja conciso. Se for multi-etapa, detalhe o suficiente para um agente
executor trabalhar sem contexto implícito.

O plano deve conter:
- Entendimento do problema (2-3 linhas)
- Escopo e fora de escopo, quando houver risco de expansão
- Arquivos prováveis com paths exatos e responsabilidade de cada um
- Passos de implementação em ordem, com tarefas pequenas e independentes
- Para feature/bugfix/refactor: ciclo RED/GREEN/REFACTOR, começando por teste que falha
- comandos de validação objetivos, preferindo comandos do repo como pnpm verify, testes focados e evals
- Critérios de aceite verificáveis
- Riscos e pontos que exigem aprovação humana (migrations, auth, infra, deploy)
- Self-review: gaps de escopo, placeholders, inconsistência de tipos/nomes e testes faltantes

Regras:
- Não escreva código ainda.
- Não use placeholders como TODO/TBD/"ajustar depois".
- Não invente arquivos se precisar primeiro inspecionar o repo; liste como "provável" e peça validação humana.
- Prefira YAGNI e mudanças pequenas com commits frequentes.
- Explique tradeoffs só quando eles mudam a decisão de implementação.

Na ÚLTIMA linha, emita exatamente:
APPROVAL_REASONS: <lista separada por vírgula, só os que REALMENTE se aplicam, ou "none">
Valores válidos: migration, auth_security, infra, deploy, critical_deps, file_deletion.
Inclua um valor SÓ se a tarefa de fato mexe nisso — não liste por precaução.`;

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
        { role: 'system', content: PLANNER_SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Issue ${state.issueIdentifier}: ${state.title}\n\n${state.description}`,
        },
      ],
    });

    // Approval Policies (MAC-41): lê a linha estruturada e tira ela do texto.
    const reasons = parseApprovalReasons(plan);
    const cleanPlan = stripApprovalReasonsLine(plan);
    const critical = criticalReasons(reasons);
    const criticalBlock = critical.length
      ? `\n\n**⚠️ Aprovação obrigatória — mudanças sensíveis:** ${critical.map(reasonLabel).join(', ')}.`
      : '';

    await deps.linear.comment(
      state.issueId,
      `## 🤖 Plano do agente\n\n${cleanPlan}${criticalBlock}\n\n---\n_Aguardando aprovação humana para executar._`,
    );

    return {
      plan: cleanPlan,
      approvalReasons: reasons,
      status: 'awaiting_approval',
      planCostUsd: estimateCostUsd('research', usage),
    };
  };
}
