import type { LinearGateway } from '@agent-platform/linear';
import { type LlmClient, type TokenUsage, estimateCostUsd } from '@agent-platform/llm';
import type { AgentStateType } from '../state.js';
import { verdictOf } from './report.js';

const SYSTEM_PROMPT = `Você é um revisor de código sênior e crítico.
Recebe a issue, o plano aprovado e o diff das alterações geradas por outro agente.
Revise o diff e produza um parecer conciso em markdown:
- **Veredito**: APROVADO | APROVADO COM RESSALVAS | REPROVADO (uma linha).
- **Problemas** (se houver): bugs, falhas de segurança, lógica incorreta — cada um com arquivo/trecho e correção sugerida.
- **Observações**: estilo, testes faltando, aderência ao plano.
Não reescreva o código todo; aponte o que importa. Se estiver bom, diga e seja breve.`;

export interface ReviewDecisionOpts {
  maxReviewRounds: number;
  maxCostPerRunUsd: number;
}

export interface ReviewDecisionArgs {
  review: string;
  reviewRounds: number;
  lastReview: string;
  totalCostUsd: number;
}

/**
 * Decide o próximo passo após a revisão do critic (MAC-59). Volta pro coder
 * (`coding`) quando o veredito é acionável (REPROVADO ou COM RESSALVAS) e ainda
 * há orçamento de voltas/custo e houve progresso; senão segue pro PR.
 * Pura e testável — sem I/O.
 */
export function decideAfterReview(
  args: ReviewDecisionArgs,
  opts: ReviewDecisionOpts,
): 'coding' | 'pr' {
  const verdict = verdictOf(args.review);
  const actionable = /REPROVAD/i.test(verdict) || /RESSALVA/i.test(verdict);
  if (!actionable) return 'pr';
  if (args.reviewRounds >= opts.maxReviewRounds) return 'pr';
  if (args.totalCostUsd >= opts.maxCostPerRunUsd) return 'pr';
  // Guarda de no-progress: parecer da volta atual igual ao anterior → para.
  if (args.reviewRounds > 0 && args.review.trim() === args.lastReview.trim()) return 'pr';
  return 'coding';
}

export interface ReviewDeps {
  llm: LlmClient;
  linear: LinearGateway;
  /** Teto de voltas de revisão (MAC-59). */
  maxReviewRounds: number;
  /** Teto de custo por run em USD — corta o loop (MAC-40/59). */
  maxCostPerRunUsd: number;
}

/**
 * Nó REVIEW (MAC-18): revisa o diff gerado pelo Coder usando o alias `critic` e
 * comenta o parecer no Linear (MAC-21). Não bloqueia o PR no MVP — apenas anota;
 * o veredito vai no corpo do Draft PR (MAC-26) para a revisão humana decidir.
 */
export function makeReviewNode(deps: ReviewDeps) {
  return async (state: AgentStateType): Promise<Partial<AgentStateType>> => {
    // Sem diff (nada gerado) não há o que revisar — segue para o PR.
    if (!state.diff?.trim()) {
      return { status: 'coding', nextAfterReview: 'pr' };
    }

    try {
      let usage: TokenUsage = { promptTokens: 0, completionTokens: 0 };
      const review = await deps.llm.complete({
        alias: 'critic',
        temperature: 0.2,
        onUsage: (u) => {
          usage = u;
        },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              `# Issue ${state.issueIdentifier}: ${state.title}`,
              `\n# Plano\n${state.plan}`,
              state.testsPassed === undefined
                ? ''
                : `\n# Validação no sandbox: ${state.testsPassed ? 'PASSOU' : 'FALHOU'}\n${state.testSummary ?? ''}`,
              `\n# Diff\n\`\`\`diff\n${state.diff}\n\`\`\``,
            ].join('\n'),
          },
        ],
      });

      const reviewCostUsd = estimateCostUsd('critic', usage);
      const totalCostUsd =
        (state.planCostUsd ?? 0) +
        (state.codeCostUsd ?? 0) +
        (state.reviewCostUsd ?? 0) +
        reviewCostUsd;

      const next = decideAfterReview(
        {
          review,
          reviewRounds: state.reviewRounds ?? 0,
          lastReview: state.lastReview ?? '',
          totalCostUsd,
        },
        { maxReviewRounds: deps.maxReviewRounds, maxCostPerRunUsd: deps.maxCostPerRunUsd },
      );

      const roundNote =
        next === 'coding'
          ? `\n\n_O agente vai tentar endereçar o parecer (revisão ${(state.reviewRounds ?? 0) + 1})._`
          : '';
      await deps.linear.comment(
        state.issueId,
        `## 🔎 Revisão do agente (critic)\n\n${review}${roundNote}`,
      );

      return {
        review,
        status: 'coding',
        reviewCostUsd,
        lastReview: review,
        lastVerdict: verdictOf(review),
        nextAfterReview: next,
        // Reducer soma: +1 só quando vai revisar; feedback alimenta o próximo job.
        reviewRounds: next === 'coding' ? 1 : 0,
        reviewFeedback: next === 'coding' ? review : '',
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Falha na revisão não derruba o run: segue para o PR sem parecer.
      await deps.linear.comment(
        state.issueId,
        `## ⚠️ Revisão automática falhou (seguindo sem parecer)\n\n\`\`\`\n${message}\n\`\`\``,
      );
      return { status: 'coding', nextAfterReview: 'pr' };
    }
  };
}
