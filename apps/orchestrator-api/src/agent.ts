import { createGithubGateway, parseRepoRef } from '@agent-platform/github';
import { type AgentGraph, buildAgentGraph, createCheckpointer } from '@agent-platform/graph';
import { type LinearGateway, createLinearGateway } from '@agent-platform/linear';
import { type LlmClient, createLlmClient } from '@agent-platform/llm';
import { LESSON_CAP, formatLessons } from '@agent-platform/memory';
import { env } from './env.js';
import { listLessons } from './lessons.js';

export interface Agent {
  graph: AgentGraph;
  linear: LinearGateway;
  llm: LlmClient;
}

let agentPromise: Promise<Agent> | null = null;

/**
 * Constrói o grafo + dependências uma única vez (singleton lazy), compartilhado
 * entre o worker (que dispara/retoma runs) e as rotas (aprovação).
 */
export function getAgent(): Promise<Agent> {
  if (!agentPromise) {
    agentPromise = init();
  }
  return agentPromise;
}

async function init(): Promise<Agent> {
  const llm = createLlmClient({ baseUrl: env.LITELLM_BASE_URL, apiKey: env.LITELLM_API_KEY });
  const linear = createLinearGateway(env.LINEAR_API_KEY);
  const checkpointer = await createCheckpointer(env.DATABASE_URL);

  // Injeta a credencial do GitHub na URL de clone (repo pode ser privado).
  const repoUrl = env.REPO_URL.replace('https://', `https://x-access-token:${env.GITHUB_TOKEN}@`);

  // Gateway do GitHub (MAC-26) — owner/repo derivados da URL do repo alvo.
  const github = createGithubGateway(env.GITHUB_TOKEN, parseRepoRef(env.REPO_URL));

  // Comandos de validação no sandbox (MAC-29) — uma linha por comando.
  const testCommands = env.AGENT_TEST_COMMANDS.split('\n')
    .map((c) => c.trim())
    .filter(Boolean);

  // Memory Layer (MAC-23): repo alvo e função que entrega as lições já formatadas
  // para o codegen. Fechamento sobre o repo — single-repo por deploy no MVP.
  const repoRef = parseRepoRef(env.REPO_URL);
  const repo = `${repoRef.owner}/${repoRef.repo}`;
  const loadLessons = async (): Promise<string> =>
    formatLessons(await listLessons(repo, LESSON_CAP), LESSON_CAP);

  const graph = buildAgentGraph(
    {
      llm,
      linear,
      github,
      testCommands,
      loadLessons,
      runner: {
        baseUrl: env.RUNNER_BASE_URL,
        authToken: env.RUNNER_AUTH_TOKEN,
        repoUrl,
      },
    },
    checkpointer,
  );

  return { graph, linear, llm };
}
