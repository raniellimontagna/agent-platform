import type { CardGateway, CardGatewayRegistry, CardProvider } from '@agent-platform/cards';
import {
  type GithubGateway,
  type RepoRef,
  createGithubGateway,
  parseRepoFullName,
  parseRepoRef,
} from '@agent-platform/github';
import { type AgentGraph, buildAgentGraph, createCheckpointer } from '@agent-platform/graph';
import { type LlmClient, createLlmClient } from '@agent-platform/llm';
import { createRuntimeCards } from './cards.js';
import { env } from './env.js';
import { buildLessonLoader } from './lessonLoader.js';
import { type WorkerManager, createWorkerManager, parseRunnerUrls } from './workerManager.js';

export interface GraphBinding {
  provider: CardProvider;
  cardGateway: CardGateway;
  doneStateId: string;
}

export interface Agent {
  graph: AgentGraph;
  graphs: Partial<Record<CardProvider, AgentGraph>>;
  cards: CardGatewayRegistry;
  llm: LlmClient;
  github: GithubGateway;
  workerManager: WorkerManager;
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

export function resolveGraphBinding(
  input: {
    cards: CardGatewayRegistry;
    linearDoneStateId: string;
    planeDoneStateId?: string;
  },
  provider: CardProvider,
): GraphBinding {
  return {
    provider,
    cardGateway: input.cards.forProvider(provider),
    doneStateId:
      provider === 'plane'
        ? (input.planeDoneStateId ?? input.linearDoneStateId)
        : input.linearDoneStateId,
  };
}

export function resolveAgentGraph(
  agent: Pick<Agent, 'graphs'>,
  provider: CardProvider,
): AgentGraph {
  const graph = agent.graphs[provider];
  if (!graph) {
    throw new Error(`Agent graph not configured for card provider: ${provider}`);
  }
  return graph;
}

function isGeneratedRepo(repo: RepoRef | undefined): boolean {
  return repo?.owner === env.GENERATED_REPOS_OWNER;
}

function createRoutedGithubGateway(defaultGateway: GithubGateway, generatedGateway: GithubGateway) {
  const byRepo = (repo: RepoRef | undefined) =>
    isGeneratedRepo(repo) ? generatedGateway : defaultGateway;

  return {
    createPullRequest(args: Parameters<GithubGateway['createPullRequest']>[0]) {
      return byRepo(args.repo).createPullRequest(args);
    },
    mergePullRequest(args: Parameters<GithubGateway['mergePullRequest']>[0]) {
      return byRepo(args.repo).mergePullRequest(args);
    },
    deleteBranch(
      branch: Parameters<GithubGateway['deleteBranch']>[0],
      repo?: Parameters<GithubGateway['deleteBranch']>[1],
    ) {
      return byRepo(repo).deleteBranch(branch, repo);
    },
    createRepository(input: Parameters<GithubGateway['createRepository']>[0]) {
      const gateway = input.owner === env.GENERATED_REPOS_OWNER ? generatedGateway : defaultGateway;
      return gateway.createRepository(input);
    },
  } satisfies GithubGateway;
}

async function init(): Promise<Agent> {
  const llm = createLlmClient({
    baseUrl: env.LITELLM_BASE_URL,
    apiKey: env.LITELLM_API_KEY,
    timeoutMs: env.LLM_TIMEOUT_MS,
    maxRetries: env.LLM_MAX_RETRIES,
  });
  const cards = createRuntimeCards(env);
  const checkpointer = await createCheckpointer(env.DATABASE_URL);

  // Injeta a credencial do GitHub na URL de clone (repo pode ser privado).
  const repoUrl = env.REPO_URL.replace('https://', `https://x-access-token:${env.GITHUB_TOKEN}@`);
  const resolveRepoUrl = (targetRepo: string | undefined) => {
    if (!targetRepo) return repoUrl;
    const ref = parseRepoFullName(targetRepo);
    const token =
      ref.owner === env.GENERATED_REPOS_OWNER && env.GENERATED_REPOS_TOKEN
        ? env.GENERATED_REPOS_TOKEN
        : env.GITHUB_TOKEN;
    return `https://x-access-token:${token}@github.com/${ref.owner}/${ref.repo}.git`;
  };

  // Gateway do GitHub (MAC-26) — owner/repo derivados da URL do repo alvo.
  const defaultGithub = createGithubGateway(env.GITHUB_TOKEN, parseRepoRef(env.REPO_URL));
  const generatedRepoRef = env.GENERATED_REPOS_TEMPLATE
    ? parseRepoFullName(env.GENERATED_REPOS_TEMPLATE)
    : { owner: env.GENERATED_REPOS_OWNER, repo: 'generated-repos' };
  const generatedGithub = env.GENERATED_REPOS_TOKEN
    ? createGithubGateway(env.GENERATED_REPOS_TOKEN, generatedRepoRef)
    : defaultGithub;
  const github = createRoutedGithubGateway(defaultGithub, generatedGithub);

  // Worker Manager (MAC-39): fleet de runners + health/failover no dispatch.
  const workerManager = createWorkerManager({
    baseUrls: parseRunnerUrls(env.RUNNER_BASE_URLS, env.RUNNER_BASE_URL),
    authToken: env.RUNNER_AUTH_TOKEN,
    jobTimeoutMs: env.RUNNER_JOB_TIMEOUT_MS,
  });

  // Comandos de validação no sandbox (MAC-29) — uma linha por comando.
  const testCommands = env.AGENT_TEST_COMMANDS.split('\n')
    .map((c) => c.trim())
    .filter(Boolean);

  // Memory Layer (MAC-23): repo alvo e função que entrega as lições já formatadas
  // para o codegen. Fechamento sobre o repo — single-repo por deploy no MVP.
  const repoRef = parseRepoRef(env.REPO_URL);
  const repo = `${repoRef.owner}/${repoRef.repo}`;
  const loadLessons = buildLessonLoader(repo);

  const enabledProviders = Array.from(
    new Set<CardProvider>([
      env.CARD_PRIMARY_PROVIDER,
      ...env.CARD_EXTRA_PROVIDERS.split(',')
        .map((provider) => provider.trim())
        .filter(
          (provider): provider is CardProvider => provider === 'plane' || provider === 'linear',
        ),
    ]),
  );
  const baseGraphDeps = {
    llm,
    github,
    testCommands,
    loadLessons,
    maxReviewRounds: env.AGENT_MAX_REVIEW_ROUNDS,
    maxCostPerRunUsd: env.AGENT_MAX_COST_PER_RUN_USD,
    cloudflareDeployGeneratedLandings: env.CLOUDFLARE_DEPLOY_GENERATED_LANDINGS,
    generatedReposOwner: env.GENERATED_REPOS_OWNER,
    cloudflareDeployCommands: env.CLOUDFLARE_DEPLOY_COMMANDS.split(/\n|\\n/)
      .map((c) => c.trim())
      .filter(Boolean),
    runnerRepoUrl: repoUrl,
    resolveRunnerRepoUrl: resolveRepoUrl,
    dispatch: workerManager.dispatch,
  } as const;
  const graphs: Partial<Record<CardProvider, AgentGraph>> = {};

  for (const provider of enabledProviders) {
    const binding = resolveGraphBinding(
      {
        cards,
        linearDoneStateId: env.LINEAR_DONE_STATE_ID,
        planeDoneStateId: env.PLANE_DONE_STATE_ID,
      },
      provider,
    );
    graphs[provider] = buildAgentGraph(
      {
        ...baseGraphDeps,
        cards: binding.cardGateway,
        doneStateId: binding.doneStateId,
      },
      checkpointer,
    );
  }

  const graph = graphs[cards.primary.provider] ?? graphs[env.CARD_PRIMARY_PROVIDER];
  if (!graph) {
    throw new Error(`Primary graph not configured: ${cards.primary.provider}`);
  }

  return { graph, graphs, cards, llm, github, workerManager };
}
