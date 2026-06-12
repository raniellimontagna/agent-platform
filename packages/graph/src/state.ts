import { Annotation } from '@langchain/langgraph';

/**
 * Estado do workflow do agente. Espelha o fluxo do MAC-14:
 * NEW → PLANNING → WAITING_APPROVAL → CODING → TESTING → REVIEWING → DONE/FAILED.
 * Persistido pelo checkpointer Postgres (retoma após restart — MAC-34).
 */
export const AgentState = Annotation.Root({
  runId: Annotation<string>(),
  issueId: Annotation<string>(),
  issueIdentifier: Annotation<string>(),
  title: Annotation<string>(),
  description: Annotation<string>(),
  /** Plano gerado pelo Planner (MAC-16). */
  plan: Annotation<string>(),
  /** Motivos de aprovação detectados no plano (MAC-41). */
  approvalReasons: Annotation<string[]>(),
  /** Branch de trabalho criada pelo Coder (MAC-17/25). */
  branch: Annotation<string>(),
  /** SHA do commit gerado pelo Coder (MAC-17). */
  commitSha: Annotation<string>(),
  /** Resumo das alterações de código produzido pelo modelo. */
  summary: Annotation<string>(),
  /** Branch foi enviada (push) ao remoto — habilita abrir o PR (MAC-26). */
  pushed: Annotation<boolean>(),
  /** Diff das alterações vs. base, devolvido pelo runner (MAC-18). */
  diff: Annotation<string>(),
  /** Revisão do diff produzida pelo Reviewer com `critic` (MAC-18). */
  review: Annotation<string>(),
  /** Resultado da validação no sandbox (MAC-29). undefined = não rodou. */
  testsPassed: Annotation<boolean>(),
  /** Resumo dos comandos de validação (cmd + exit code + tail). */
  testSummary: Annotation<string>(),
  /** Custo estimado por fase em USD (MAC-40). */
  planCostUsd: Annotation<number>(),
  codeCostUsd: Annotation<number>(),
  reviewCostUsd: Annotation<number>(),
  /** Título Conventional Commits (inglês) do PR (MAC-26). */
  prTitle: Annotation<string>(),
  /** URL do Draft PR aberto pelo nó PR (MAC-26). */
  prUrl: Annotation<string>(),
  /** Status corrente do run (alinha com o enum run_status do banco). */
  status: Annotation<string>(),
  /** Mensagem de erro, se o run falhar. */
  error: Annotation<string>(),
});

export type AgentStateType = typeof AgentState.State;
