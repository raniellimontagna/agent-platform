import type { CardGateway, CardGatewayRegistry } from '@agent-platform/cards';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAgent, resolveAgentGraph } from './agent.js';
import { agentQueue } from './queue.js';
import {
  createRun,
  findResumableRuns,
  getRun,
  recordApproval,
  recordStep,
  runCostUsd,
  updateRunStatus,
} from './runs.js';
import { startAgentWorker } from './worker.js';

type WorkerJob = {
  name: string;
  data:
    | {
        kind: 'plan';
        runId: string;
        cardProvider?: 'plane' | 'linear';
        cardId?: string;
        issueId?: string;
        context?: string;
      }
    | { kind: 'resume'; runId: string };
  opts?: { attempts?: number };
  attemptsMade?: number;
};
type WorkerProcessor = (job: WorkerJob) => Promise<void>;

const workerProcessors = vi.hoisted(() => [] as WorkerProcessor[]);
const QueueMock = vi.hoisted(() =>
  vi.fn().mockImplementation(() => ({ add: vi.fn(), close: vi.fn() })),
);
const WorkerMock = vi.hoisted(() =>
  vi.fn((_queueName: string, processor: WorkerProcessor) => {
    workerProcessors.push(processor);
    return { close: vi.fn(), on: vi.fn() };
  }),
);

vi.mock('bullmq', () => ({
  Queue: QueueMock,
  Worker: WorkerMock,
}));

vi.mock('@agent-platform/github', () => ({
  parseRepoRef: vi.fn(() => ({ owner: 'owner', repo: 'repo' })),
}));

vi.mock('@agent-platform/graph', () => ({
  verdictOf: vi.fn(() => 'APROVADO'),
}));

vi.mock('@agent-platform/memory', () => ({
  distillLesson: vi.fn(),
}));

vi.mock('./agent.js', () => ({
  getAgent: vi.fn(),
  resolveAgentGraph: vi.fn(),
}));

vi.mock('./agents.js', () => ({
  LANDING_PAGE_AGENT_KEY: 'landing-page-agent',
  ensureDefaultAgents: vi.fn().mockResolvedValue(undefined),
  getAgent: vi.fn().mockResolvedValue(null),
  resolveAgentByKey: vi.fn().mockResolvedValue({ id: 'landing-agent-id' }),
}));

vi.mock('./artifacts.js', () => ({
  saveArtifacts: vi.fn(),
}));

vi.mock('./env.js', () => ({
  env: {
    REDIS_URL: 'redis://localhost:6379',
    AGENT_MAX_CONCURRENCY: 1,
    AGENT_MAX_COST_PER_RUN_USD: 10,
    REPO_URL: 'https://github.com/owner/repo.git',
    GENERATED_REPOS_OWNER: 'attodev',
    GENERATED_REPOS_ALLOW_CREATE: false,
    GENERATED_REPOS_TEMPLATE: '',
  },
}));

vi.mock('./generatedRepos.js', () => ({
  ensureGeneratedRepository: vi.fn(),
  resolveGeneratedRepoTarget: vi.fn(() => undefined),
}));

vi.mock('./killswitch.js', () => ({
  isPaused: vi.fn().mockResolvedValue(false),
}));

vi.mock('./lessons.js', () => ({
  saveLesson: vi.fn(),
}));

vi.mock('./logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  },
}));

vi.mock('./queue.js', async () => {
  const actual = await vi.importActual<typeof import('./queue.js')>('./queue.js');
  return {
    ...actual,
    AGENT_QUEUE: 'agent-runs',
    JOB_PRIORITY: { resume: 1, plan: 2 },
    agentQueue: { add: vi.fn() },
    connection: { host: 'localhost', port: 6379, maxRetriesPerRequest: null },
  };
});

vi.mock('./runs.js', () => ({
  createRun: vi.fn(),
  findResumableRuns: vi.fn(),
  getRun: vi.fn(),
  recordApproval: vi.fn(),
  recordStep: vi.fn(),
  resolveApproval: vi.fn(),
  runCostUsd: vi.fn(),
  updateRunStatus: vi.fn(),
}));

vi.mock('./tools.js', () => ({
  ensureDefaultTools: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./workflows.js', () => ({
  formatResearchToLandingContext: vi.fn(() => 'formatted continuation context'),
  shouldStartResearchToLandingContinuation: vi.fn(() => false),
}));

function createGateway(provider: 'plane' | 'linear') {
  return {
    provider,
    getCard: vi.fn().mockResolvedValue({
      provider,
      id: `${provider}-card`,
      identifier: provider === 'plane' ? 'AGP-1' : 'MAC-1',
      title: 'Build provider cutover',
      description: 'Provider-aware description',
      labels: [],
    }),
    comment: vi.fn().mockResolvedValue(undefined),
    setCardState: vi.fn().mockResolvedValue(undefined),
    createCard: vi.fn(),
  } satisfies CardGateway;
}

function createCards() {
  const plane = createGateway('plane');
  const linear = createGateway('linear');
  const cards = {
    primary: plane,
    forProvider: vi.fn((provider: 'plane' | 'linear') => (provider === 'plane' ? plane : linear)),
  } satisfies CardGatewayRegistry;
  return { cards, plane, linear };
}

function runRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'run-1',
    cardProvider: 'plane',
    cardId: 'plane-card-1',
    linearIssueId: 'linear-legacy-1',
    linearIssueIdentifier: 'MAC-1',
    cardIdentifier: 'AGP-1',
    cardProjectId: 'plane-project',
    title: 'Build provider cutover',
    description: 'Provider-aware description',
    status: 'pending',
    agentId: null,
    autoApprove: false,
    autoMerge: false,
    targetRepo: null,
    targetRepoCreate: false,
    workflow: null,
    ...overrides,
  } as never;
}

async function startProcessor() {
  const processor = workerProcessors[0];
  if (processor) return processor;
  await startAgentWorker();
  const started = workerProcessors[0];
  if (!started) throw new Error('expected agent worker processor to be registered');
  return started;
}

describe('startAgentWorker provider resolution', () => {
  let cards: ReturnType<typeof createCards>;
  let graphInvoke: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    workerProcessors.length = 0;
    cards = createCards();
    graphInvoke = vi.fn().mockResolvedValue({
      status: 'awaiting_approval',
      plan: 'Plan body',
      planCostUsd: 0.01,
      approvalReasons: ['plan'],
    });
    vi.mocked(getAgent).mockResolvedValue({
      cards: cards.cards,
      llm: {},
      github: {},
      graphs: { plane: {}, linear: {} },
    } as never);
    vi.mocked(resolveAgentGraph).mockReturnValue({ invoke: graphInvoke } as never);
    vi.mocked(getRun).mockResolvedValue(runRow());
    vi.mocked(findResumableRuns).mockResolvedValue([]);
    vi.mocked(runCostUsd).mockResolvedValue(0);
    vi.mocked(updateRunStatus).mockResolvedValue(undefined);
    vi.mocked(recordApproval).mockResolvedValue(undefined);
    vi.mocked(recordStep).mockResolvedValue(undefined);
    vi.mocked(createRun).mockResolvedValue('landing-run');
  });

  it('processes old missing-provider plan jobs through persisted run provider/card fields', async () => {
    const processor = await startProcessor();

    await processor({
      name: 'plan',
      data: { kind: 'plan', runId: 'run-old', context: 'Extra context' },
    });

    expect(resolveAgentGraph).toHaveBeenCalledWith(expect.anything(), 'plane');
    expect(cards.cards.forProvider).toHaveBeenCalledWith('plane');
    expect(cards.plane.getCard).toHaveBeenCalledWith('plane-card-1');
    expect(graphInvoke).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'run-old',
        issueId: 'plane-card-1',
        issueIdentifier: 'AGP-1',
        description: expect.stringContaining('Extra context'),
      }),
      { configurable: { thread_id: 'run-old' } },
    );
  });

  it('keeps explicit legacy Linear plan jobs provider-aware', async () => {
    vi.mocked(getRun).mockResolvedValue(runRow({ cardProvider: null, cardId: null }));
    const processor = await startProcessor();

    await processor({
      name: 'plan',
      data: {
        kind: 'plan',
        runId: 'run-legacy',
        cardProvider: 'linear',
        cardId: 'linear-card-1',
      },
    });

    expect(resolveAgentGraph).toHaveBeenCalledWith(expect.anything(), 'linear');
    expect(cards.cards.forProvider).toHaveBeenCalledWith('linear');
    expect(cards.linear.getCard).toHaveBeenCalledWith('linear-card-1');
  });

  it('rejects ambiguous plan jobs when persisted run data has no provider/card fields', async () => {
    vi.mocked(getRun).mockResolvedValue(
      runRow({ cardProvider: null, cardId: null, linearIssueId: 'linear-legacy-1' }),
    );
    const processor = await startProcessor();

    await expect(
      processor({ name: 'plan', data: { kind: 'plan', runId: 'run-ambiguous' } }),
    ).rejects.toThrow(/card provider\/card id/i);
  });

  it('rejects resume jobs with ambiguous persisted provider/card fields', async () => {
    vi.mocked(getRun).mockResolvedValue(
      runRow({ cardProvider: null, cardId: null, linearIssueId: 'linear-legacy-1' }),
    );
    const processor = await startProcessor();

    await expect(
      processor({ name: 'resume', data: { kind: 'resume', runId: 'run-ambiguous' } }),
    ).rejects.toThrow(/card provider\/card id/i);
    expect(resolveAgentGraph).not.toHaveBeenCalled();
  });

  it('uses persisted provider/card fields for auto-approval comments', async () => {
    vi.mocked(getRun).mockResolvedValue(
      runRow({
        id: 'run-critical',
        autoApprove: true,
        cardProvider: 'plane',
        cardId: 'plane-card-critical',
      }),
    );
    graphInvoke.mockResolvedValue({
      status: 'awaiting_approval',
      plan: 'Plan body',
      planCostUsd: 0.01,
      approvalReasons: ['infra'],
    });
    const processor = await startProcessor();

    await processor({ name: 'plan', data: { kind: 'plan', runId: 'run-critical' } });

    expect(cards.cards.forProvider).toHaveBeenCalledWith('plane');
    expect(cards.plane.comment).toHaveBeenCalledWith(
      'plane-card-critical',
      expect.stringContaining('infra'),
    );
  });

  it('uses persisted provider/card fields for research-to-landing continuations', async () => {
    const workflows = await import('./workflows.js');
    vi.mocked(workflows.shouldStartResearchToLandingContinuation).mockReturnValue(true);
    vi.mocked(getRun).mockResolvedValue(
      runRow({
        workflow: 'research-to-landing',
        cardProvider: 'plane',
        cardId: 'plane-card-source',
      }),
    );
    graphInvoke.mockResolvedValue({
      status: 'completed',
      research: 'Research output',
      codeCostUsd: 0.02,
      reviewCostUsd: 0.03,
    });
    const processor = await startProcessor();

    await processor({ name: 'resume', data: { kind: 'resume', runId: 'run-source' } });

    expect(cards.cards.forProvider).toHaveBeenCalledWith('plane');
    expect(cards.plane.getCard).toHaveBeenCalledWith('plane-card-source');
    expect(createRun).toHaveBeenCalledWith(
      expect.objectContaining({
        cardProvider: 'plane',
        cardId: 'plane-card-source',
      }),
    );
    expect(agentQueue.add).toHaveBeenCalledWith(
      'plan',
      expect.objectContaining({
        kind: 'plan',
        runId: 'landing-run',
        cardProvider: 'plane',
        cardId: 'plane-card-source',
      }),
      { priority: 2 },
    );
  });
});
