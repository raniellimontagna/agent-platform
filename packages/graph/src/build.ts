import type { GithubGateway } from '@agent-platform/github';
import type { LinearGateway } from '@agent-platform/linear';
import type { LlmClient } from '@agent-platform/llm';
import { END, START, StateGraph } from '@langchain/langgraph';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { type RunnerConfig, makeCoderNode } from './nodes/coder.js';
import { makePlannerNode } from './nodes/planner.js';
import { makePrNode } from './nodes/pr.js';
import { makeReviewNode } from './nodes/review.js';
import { AgentState } from './state.js';

export interface GraphDeps {
  llm: LlmClient;
  linear: LinearGateway;
  runner: RunnerConfig;
  github: GithubGateway;
  /** Branch base dos PRs abertos pelo agente (default: main). */
  baseBranch?: string;
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
 *   START → planning → [⏸ aprovação humana] → coding → review → pr → END
 *
 * Pausa antes de `coding` aguardando aprovação (MAC-22). Após aprovado, o run é
 * retomado com o mesmo thread_id e segue para o Coder (MAC-17), que gera o
 * código e pusha a branch. Em sucesso, o Reviewer (MAC-18) revisa o diff com
 * `critic` e o nó PR (MAC-26) abre o Draft PR; em falha do coder, encerra. O
 * checkpointer Postgres persiste e permite retomar (MAC-34).
 */
export function buildAgentGraph(deps: GraphDeps, checkpointer: PostgresSaver) {
  const planning = makePlannerNode(deps);
  const coding = makeCoderNode(deps);
  const review = makeReviewNode({ llm: deps.llm, linear: deps.linear });
  const pr = makePrNode({
    github: deps.github,
    linear: deps.linear,
    baseBranch: deps.baseBranch ?? 'main',
  });

  return new StateGraph(AgentState)
    .addNode('planning', planning)
    .addNode('coding', coding)
    .addNode('reviewing', review)
    .addNode('pr', pr)
    .addEdge(START, 'planning')
    .addEdge('planning', 'coding')
    .addConditionalEdges('coding', (state) => (state.status === 'failed' ? END : 'reviewing'), {
      reviewing: 'reviewing',
      [END]: END,
    })
    .addEdge('reviewing', 'pr')
    .addEdge('pr', END)
    .compile({ checkpointer, interruptBefore: ['coding'] });
}

export type AgentGraph = ReturnType<typeof buildAgentGraph>;
