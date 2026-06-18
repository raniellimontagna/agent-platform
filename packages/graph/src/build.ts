import type { GithubGateway } from '@agent-platform/github';
import type { LinearGateway } from '@agent-platform/linear';
import type { LlmClient } from '@agent-platform/llm';
import { END, START, StateGraph } from '@langchain/langgraph';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { type DispatchFn, makeCoderNode } from './nodes/coder.js';
import { makeMergingNode } from './nodes/merging.js';
import { makePlannerNode } from './nodes/planner.js';
import { makePrNode } from './nodes/pr.js';
import { makeReportNode } from './nodes/report.js';
import { makeReviewNode } from './nodes/review.js';
import { AgentState } from './state.js';

export interface GraphDeps {
  llm: LlmClient;
  linear: LinearGateway;
  /** URL de clone do repo alvo (vai no body do job — MAC-39). */
  runnerRepoUrl: string;
  /** Despacha o job pro runner com health/failover (MAC-39). */
  dispatch: DispatchFn;
  github: GithubGateway;
  /** Branch base dos PRs abertos pelo agente (default: main). */
  baseBranch?: string;
  /** Comandos de validação rodados no sandbox após o push (MAC-29). */
  testCommands?: string[];
  /** Carrega as lições relevantes p/ a query (título+descrição) já formatadas (MAC-23/45). */
  loadLessons?: (query: string) => Promise<string>;
  /** Teto de voltas de revisão (MAC-59). */
  maxReviewRounds?: number;
  /** Teto de custo por run em USD — corta o loop (MAC-40/59). */
  maxCostPerRunUsd?: number;
  /** Estado "Done" do time no Linear p/ mover a issue após auto-merge (MAC-67). */
  doneStateId: string;
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
 *   START → planning → [⏸ aprovação] → coding → reviewing → [revisar? → revising → reviewing] → pr → report → END
 *
 * Pausa antes de `coding` aguardando aprovação (MAC-22). Após aprovado, o run é
 * retomado com o mesmo thread_id e segue para o Coder (MAC-17), que gera o
 * código e pusha a branch. Em sucesso, o Reviewer (MAC-18) revisa o diff com
 * `critic` e o nó PR (MAC-26) abre o Draft PR; em falha do coder, pula direto
 * para o report. O nó `report` (MAC-21) posta o resumo final (sucesso ou falha).
 * O checkpointer Postgres persiste e permite retomar (MAC-34).
 */
export function buildAgentGraph(deps: GraphDeps, checkpointer: PostgresSaver) {
  const planning = makePlannerNode(deps);
  const coderDeps = {
    linear: deps.linear,
    repoUrl: deps.runnerRepoUrl,
    baseBranch: deps.baseBranch ?? 'main',
    dispatch: deps.dispatch,
    testCommands: deps.testCommands ?? [],
    loadLessons: deps.loadLessons,
  };
  const coding = makeCoderNode(coderDeps);
  const revising = makeCoderNode(coderDeps, { revise: true });
  const review = makeReviewNode({
    llm: deps.llm,
    linear: deps.linear,
    maxReviewRounds: deps.maxReviewRounds ?? 1,
    maxCostPerRunUsd: deps.maxCostPerRunUsd ?? 2,
  });
  const pr = makePrNode({
    github: deps.github,
    linear: deps.linear,
    baseBranch: deps.baseBranch ?? 'main',
  });
  const merging = makeMergingNode({
    github: deps.github,
    linear: deps.linear,
    doneStateId: deps.doneStateId,
  });
  const report = makeReportNode({ linear: deps.linear });

  return (
    new StateGraph(AgentState)
      .addNode('planning', planning)
      .addNode('coding', coding)
      .addNode('revising', revising)
      .addNode('reviewing', review)
      .addNode('pr', pr)
      .addNode('merging', merging)
      .addNode('report', report)
      .addEdge(START, 'planning')
      .addEdge('planning', 'coding')
      .addConditionalEdges(
        'coding',
        (state) => (state.status === 'failed' ? 'report' : 'reviewing'),
        { reviewing: 'reviewing', report: 'report' },
      )
      // MAC-59: o critic decide revisar (volta pro coder em modo revisão) ou seguir.
      .addConditionalEdges(
        'reviewing',
        (state) =>
          state.nextAfterReview === 'coding'
            ? 'revising'
            : state.nextAfterReview === 'failed'
              ? 'report'
              : 'pr',
        { revising: 'revising', pr: 'pr', report: 'report' },
      )
      // O nó de revisão (fora do interruptBefore) re-revisa; falha vai pro report.
      .addConditionalEdges(
        'revising',
        (state) => (state.status === 'failed' ? 'report' : 'reviewing'),
        { reviewing: 'reviewing', report: 'report' },
      )
      .addEdge('pr', 'merging')
      .addEdge('merging', 'report')
      .addEdge('report', END)
      .compile({ checkpointer, interruptBefore: ['coding'] })
  );
}

export type AgentGraph = ReturnType<typeof buildAgentGraph>;
