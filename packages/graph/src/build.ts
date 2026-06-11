import type { LinearGateway } from '@agent-platform/linear';
import type { LlmClient } from '@agent-platform/llm';
import { END, START, StateGraph } from '@langchain/langgraph';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { makePlannerNode } from './nodes/planner.js';
import { AgentState, type AgentStateType } from './state.js';

export interface GraphDeps {
  llm: LlmClient;
  linear: LinearGateway;
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
 * Monta a state machine do agente (MAC-14). Pausa antes de `coding` aguardando
 * aprovação humana (MAC-22) — retomada por outra invocação com o mesmo thread_id.
 */
export function buildAgentGraph(deps: GraphDeps, checkpointer: PostgresSaver) {
  const planning = makePlannerNode(deps);

  // Stub do CODING (MAC-17) — preenchido na próxima fatia.
  const coding = async (_state: AgentStateType): Promise<Partial<AgentStateType>> => {
    return { status: 'executing' };
  };

  return new StateGraph(AgentState)
    .addNode('planning', planning)
    .addNode('coding', coding)
    .addEdge(START, 'planning')
    .addEdge('planning', 'coding')
    .addEdge('coding', END)
    .compile({ checkpointer, interruptBefore: ['coding'] });
}

export type AgentGraph = ReturnType<typeof buildAgentGraph>;
