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
  /** Branch de trabalho criada pelo Coder (MAC-17/25). */
  branch: Annotation<string>(),
  /** SHA do commit gerado pelo Coder (MAC-17). */
  commitSha: Annotation<string>(),
  /** Resumo das alterações de código produzido pelo modelo. */
  summary: Annotation<string>(),
  /** Branch foi enviada (push) ao remoto — habilita abrir o PR (MAC-26). */
  pushed: Annotation<boolean>(),
  /** URL do Draft PR aberto pelo nó PR (MAC-26). */
  prUrl: Annotation<string>(),
  /** Status corrente do run (alinha com o enum run_status do banco). */
  status: Annotation<string>(),
  /** Mensagem de erro, se o run falhar. */
  error: Annotation<string>(),
});

export type AgentStateType = typeof AgentState.State;
