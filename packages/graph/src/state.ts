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
  /** Status corrente do run (alinha com o enum run_status do banco). */
  status: Annotation<string>(),
  /** Mensagem de erro, se o run falhar. */
  error: Annotation<string>(),
});

export type AgentStateType = typeof AgentState.State;
