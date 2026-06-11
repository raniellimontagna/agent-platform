import type { LinearGateway } from '@agent-platform/linear';
import type { LlmClient } from '@agent-platform/llm';
import { END, START, StateGraph } from '@langchain/langgraph';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { type RunnerConfig, makeCoderNode } from './nodes/coder.js';
import { makePlannerNode } from './nodes/planner.js';
import { AgentState } from './state.js';

export interface GraphDeps {
  llm: LlmClient;
  linear: LinearGateway;
  runner: RunnerConfig;
}

/**
 * Cria e configura o checkpointer Postgres (cria as tabelas se faltarem).
 */
export async function createCheckpointer(connectionString: string): Promise<PostgresSaver> {
  const checkpointer = PostgresSaver.fromConnString(connectionString);
  await checkpointer.setup();
  return checkpointer;
}

/**
 * Monta a state machine do agente (MAC-14):
 *   START → planning → [⏸ aprovação humana] → coding → END
 *
 * Pausa antes de `coding` aguardando aprovação (MAC-22). Após aprovado, o run
 * é retomado com o mesmo thread_id e segue para o Coder (MAC-17), que despacha
 * ao runner. O checkpointer Postgres persiste e permite retomar (MAC-34).
 */
export function buildAgentGraph(deps: GraphDeps, checkpointer: PostgresSaver) {
  const planning = makePlannerNode(deps);
  const coding = makeCoderNode(deps);

  return new StateGraph(AgentState)
    .addNode('planning', planning)
    .addNode('coding', coding)
    .addEdge(START, 'planning')
    .addEdge('planning', 'coding')
    .addEdge('coding', END)
    .compile({ checkpointer, interruptBefore: ['coding'] });
}

export type AgentGraph = ReturnType<typeof buildAgentGraph>;
