import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveAgentByKey } from './agents.js';
import { isPaused } from './killswitch.js';
import { agentQueue } from './queue.js';
import {
  cancelActiveRunsForCard,
  costLast24hUsd,
  createRun,
  findAwaitingApprovalRunForCard,
  hasActiveRunForCard,
  resolveApproval,
  updateRunStatus,
} from './runs.js';
import {
  PLANE_REMOVED_REASON,
  handleAiReadyCard,
  handleApprovalCard,
  handleRemovedPlaneCard,
} from './webhookRunActions.js';

vi.mock('./env.js', () => ({
  env: {
    AGENT_MAX_COST_PER_DAY_USD: 100,
  },
}));

vi.mock('./agents.js', () => ({
  DATA_COLLECTOR_AGENT_KEY: 'data-collector-agent',
  agentKeyFromLabels: vi.fn((labels: string[]) =>
    labels.includes('agent:reviewer') ? 'reviewer-agent' : 'coder-agent',
  ),
  resolveAgentByKey: vi.fn(),
}));

vi.mock('./killswitch.js', () => ({
  isPaused: vi.fn(),
}));

vi.mock('./logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('./queue.js', () => ({
  JOB_PRIORITY: { plan: 10, resume: 20 },
  agentQueue: { add: vi.fn() },
}));

vi.mock('./runs.js', () => ({
  cancelActiveRunsForCard: vi.fn(),
  costLast24hUsd: vi.fn(),
  createRun: vi.fn(),
  findAwaitingApprovalRunForCard: vi.fn(),
  hasActiveRunForCard: vi.fn(),
  resolveApproval: vi.fn(),
  updateRunStatus: vi.fn(),
}));

vi.mock('./workflows.js', () => ({
  workflowFromLabels: vi.fn((labels: string[]) =>
    labels.includes('workflow:landing-page') ? 'research_landing_page' : undefined,
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(hasActiveRunForCard).mockResolvedValue(false);
  vi.mocked(isPaused).mockResolvedValue(false);
  vi.mocked(costLast24hUsd).mockResolvedValue(0);
  vi.mocked(resolveAgentByKey).mockResolvedValue({ id: 'agent-id' } as never);
  vi.mocked(createRun).mockResolvedValue('run-1');
});

describe('handleAiReadyCard', () => {
  const baseInput = {
    provider: 'plane' as const,
    cardId: 'plane-work-1',
    cardIdentifier: 'AGP-1',
    cardProjectId: 'plane-project',
    title: 'Plane card',
    labels: ['ai-ready'],
    hasAutoMerge: false,
    targetRepoCreate: false,
  };

  it('skips when an active duplicate run already exists', async () => {
    vi.mocked(hasActiveRunForCard).mockResolvedValue(true);

    await expect(handleAiReadyCard(baseInput)).resolves.toEqual({
      skipped: true,
      reason: 'active run already exists',
    });

    expect(createRun).not.toHaveBeenCalled();
    expect(agentQueue.add).not.toHaveBeenCalled();
  });

  it('skips when agents are paused', async () => {
    vi.mocked(isPaused).mockResolvedValue(true);

    await expect(handleAiReadyCard(baseInput)).resolves.toEqual({
      skipped: true,
      reason: 'agents paused',
    });

    expect(createRun).not.toHaveBeenCalled();
    expect(agentQueue.add).not.toHaveBeenCalled();
  });

  it('skips when the daily cost budget is exhausted', async () => {
    vi.mocked(costLast24hUsd).mockResolvedValue(100);

    await expect(handleAiReadyCard(baseInput)).resolves.toEqual({
      skipped: true,
      reason: 'daily cost budget exceeded',
    });

    expect(createRun).not.toHaveBeenCalled();
    expect(agentQueue.add).not.toHaveBeenCalled();
  });

  it('skips unique-violation duplicates without enqueueing', async () => {
    vi.mocked(createRun).mockRejectedValue({ code: '23505' });

    await expect(handleAiReadyCard(baseInput)).resolves.toEqual({
      skipped: true,
      reason: 'active run exists',
    });

    expect(agentQueue.add).not.toHaveBeenCalled();
  });

  it('preserves workflow, agent, auto-merge, repo creation, createRun fields, queue payload, and plan priority', async () => {
    await expect(
      handleAiReadyCard({
        ...baseInput,
        labels: ['ai-ready', 'workflow:landing-page', 'agent:reviewer', 'repo:create'],
        hasAutoMerge: true,
        targetRepoCreate: true,
      }),
    ).resolves.toEqual({ queued: true, runId: 'run-1' });

    expect(resolveAgentByKey).toHaveBeenCalledWith('data-collector-agent');
    expect(createRun).toHaveBeenCalledWith({
      cardProvider: 'plane',
      cardId: 'plane-work-1',
      cardIdentifier: 'AGP-1',
      cardProjectId: 'plane-project',
      title: 'Plane card',
      autoMerge: true,
      agentId: 'agent-id',
      workflow: 'research_landing_page',
      targetRepoCreate: true,
    });
    expect(agentQueue.add).toHaveBeenCalledWith(
      'plan',
      { kind: 'plan', runId: 'run-1', cardProvider: 'plane', cardId: 'plane-work-1' },
      { priority: 10 },
    );
  });

  it('preserves legacy Linear createRun fields and queue payload when explicitly requested', async () => {
    await expect(
      handleAiReadyCard({
        ...baseInput,
        provider: 'linear',
        cardId: 'issue-legacy',
        cardIdentifier: 'MAC-901',
        cardProjectId: undefined,
      }),
    ).resolves.toEqual({ queued: true, runId: 'run-1' });

    expect(createRun).toHaveBeenCalledWith(
      expect.objectContaining({
        linearIssueId: 'issue-legacy',
        linearIssueIdentifier: 'MAC-901',
        cardProvider: 'linear',
        cardId: 'issue-legacy',
        cardIdentifier: 'MAC-901',
      }),
    );
    expect(agentQueue.add).toHaveBeenCalledWith(
      'plan',
      {
        kind: 'plan',
        runId: 'run-1',
        issueId: 'issue-legacy',
        cardProvider: 'linear',
        cardId: 'issue-legacy',
      },
      { priority: 10 },
    );
  });
});

describe('handleApprovalCard', () => {
  it('skips when no awaiting run exists', async () => {
    vi.mocked(findAwaitingApprovalRunForCard).mockResolvedValue(null);

    await expect(
      handleApprovalCard({
        provider: 'plane',
        cardId: 'plane-work-approval',
        cardIdentifier: 'AGP-2',
      }),
    ).resolves.toEqual({
      skipped: true,
      reason: 'nenhum run aguardando aprovação',
    });

    expect(resolveApproval).not.toHaveBeenCalled();
    expect(updateRunStatus).not.toHaveBeenCalled();
    expect(agentQueue.add).not.toHaveBeenCalled();
  });

  it('resumes awaiting runs with approval resolution, executing status, resume payload, and resume priority', async () => {
    vi.mocked(findAwaitingApprovalRunForCard).mockResolvedValue({ id: 'run-approval' });

    await expect(
      handleApprovalCard({
        provider: 'plane',
        cardId: 'plane-work-approval',
        cardIdentifier: 'AGP-2',
      }),
    ).resolves.toEqual({
      resumed: true,
      runId: 'run-approval',
    });

    expect(findAwaitingApprovalRunForCard).toHaveBeenCalledWith('plane', 'plane-work-approval');
    expect(resolveApproval).toHaveBeenCalledWith('run-approval', 'approved', 'plane');
    expect(updateRunStatus).toHaveBeenCalledWith('run-approval', 'executing');
    expect(agentQueue.add).toHaveBeenCalledWith(
      'resume',
      { kind: 'resume', runId: 'run-approval' },
      { priority: 20 },
    );
  });
});

describe('handleRemovedPlaneCard', () => {
  it('cancels active Plane runs with the current removal reason', async () => {
    vi.mocked(cancelActiveRunsForCard).mockResolvedValue(2);

    await expect(
      handleRemovedPlaneCard({
        cardId: 'plane-work-removed',
        cardIdentifier: 'AGP-3',
        action: 'archive',
        event: 'work_item',
      }),
    ).resolves.toEqual({
      cancelled: 2,
      reason: PLANE_REMOVED_REASON,
    });

    expect(cancelActiveRunsForCard).toHaveBeenCalledWith(
      'plane',
      'plane-work-removed',
      'plane work item removed',
    );
  });
});
