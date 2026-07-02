import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listArtifacts } from './artifacts.js';
import {
  buildMissionDetailData,
  buildRecentMissionSummaries,
  listMissionRunsForSource,
  normalizeMissionLimit,
} from './missionControlData.js';
import { listE2eMissionScenarios } from './missionScenarios.js';
import { getRun, listApprovals, listRuns, listRunsForCard } from './runs.js';

vi.mock('./artifacts.js', () => ({
  listArtifacts: vi.fn(),
}));

vi.mock('./runs.js', () => ({
  getRun: vi.fn(),
  listApprovals: vi.fn(),
  listRuns: vi.fn(),
  listRunsForCard: vi.fn(),
}));

const sourceRun = {
  id: 'run-source',
  cardProvider: 'plane',
  cardId: 'card-1',
  cardIdentifier: 'AGP-91',
  status: 'awaiting_approval',
  title: 'Research landing page',
  branch: null,
  prUrl: null,
  testsPassed: null,
  error: null,
  workflow: 'research_landing_page',
  createdAt: new Date('2026-06-30T12:00:00.000Z'),
  updatedAt: new Date('2026-06-30T12:05:00.000Z'),
};

const continuationRun = {
  ...sourceRun,
  id: 'run-continuation',
  workflow: null,
  status: 'planning',
  title: 'Research landing page - landing page',
  branch: 'agent/agp-91-landing',
  createdAt: new Date('2026-06-30T12:06:00.000Z'),
  updatedAt: new Date('2026-06-30T12:07:00.000Z'),
};

beforeEach(() => vi.clearAllMocks());

describe('normalizeMissionLimit', () => {
  it('preserves safe mission limits and falls back for unsafe values', () => {
    expect(normalizeMissionLimit('5')).toBe(5);
    expect(normalizeMissionLimit('3.9')).toBe(3);
    expect(normalizeMissionLimit('250')).toBe(100);
    expect(normalizeMissionLimit('0')).toBe(20);
    expect(normalizeMissionLimit('-4')).toBe(20);
    expect(normalizeMissionLimit('not-a-number')).toBe(20);
    expect(normalizeMissionLimit(undefined)).toBe(20);
  });
});

describe('buildRecentMissionSummaries', () => {
  it('filters to known scenarios and preserves the Mission Control JSON summary shape', async () => {
    vi.mocked(listRuns).mockResolvedValue([
      sourceRun,
      {
        ...sourceRun,
        id: 'run-ignored',
        cardId: 'card-2',
        cardIdentifier: 'AGP-92',
        workflow: 'other-workflow',
      },
    ] as never);
    vi.mocked(listRunsForCard).mockResolvedValue([sourceRun] as never);
    vi.mocked(listArtifacts).mockResolvedValue([
      {
        id: 'artifact-research',
        kind: 'research',
        createdAt: new Date('2026-06-30T12:04:00.000Z'),
      },
    ] as never);
    vi.mocked(listApprovals).mockResolvedValue([
      {
        id: 'approval-1',
        runId: 'run-source',
        reason: 'plan',
        status: 'pending',
        summary: 'Operator approval required before code generation.',
        requestedAt: new Date('2026-06-30T12:05:00.000Z'),
        resolvedAt: null,
        resolvedBy: null,
      },
    ] as never);

    const missions = await buildRecentMissionSummaries(5, listE2eMissionScenarios());

    expect(listRuns).toHaveBeenCalledWith(5, 0);
    expect(listArtifacts).toHaveBeenCalledWith('run-source');
    expect(listApprovals).toHaveBeenCalledWith('run-source');
    expect(missions).toEqual([
      {
        id: 'run-source',
        scenarioId: 'research-to-landing',
        title: 'Research landing page',
        card: {
          provider: 'plane',
          id: 'card-1',
          identifier: 'AGP-91',
        },
        state: 'awaiting_approval',
        activeStageId: 'awaiting_approval',
        stageStatuses: {
          queued: 'passed',
          planning: 'passed',
          awaiting_approval: 'active',
          collecting_research: 'locked',
          landing_generation: 'locked',
          pull_request: 'locked',
          completed: 'locked',
        },
        artifactKinds: ['research'],
        approvalStatus: 'pending',
        updatedAt: '2026-06-30T12:05:00.000Z',
        branch: null,
        prUrl: null,
        testsPassed: null,
      },
    ]);
  });
});

describe('listMissionRunsForSource', () => {
  it('groups source and continuation runs by card until the next source run window', async () => {
    vi.mocked(listRunsForCard).mockResolvedValue([
      sourceRun,
      continuationRun,
      {
        ...sourceRun,
        id: 'run-next-source',
        createdAt: new Date('2026-06-30T12:20:00.000Z'),
      },
      {
        ...continuationRun,
        id: 'run-next-continuation',
        createdAt: new Date('2026-06-30T12:21:00.000Z'),
      },
    ] as never);

    const missionRuns = await listMissionRunsForSource(sourceRun as never);

    expect(listRunsForCard).toHaveBeenCalledWith('plane', 'card-1', 20);
    expect(missionRuns.map((run) => run.id)).toEqual(['run-source', 'run-continuation']);
  });

  it('falls back to the source run when the card id is missing', async () => {
    const noCardRun = { ...sourceRun, cardId: null };

    const missionRuns = await listMissionRunsForSource(noCardRun as never);

    expect(listRunsForCard).not.toHaveBeenCalled();
    expect(missionRuns).toEqual([noCardRun]);
  });
});

describe('buildMissionDetailData', () => {
  it('returns null for missing runs or runs outside registered Mission Control scenarios', async () => {
    vi.mocked(getRun).mockResolvedValueOnce(null);

    await expect(buildMissionDetailData('missing', listE2eMissionScenarios())).resolves.toBeNull();

    vi.mocked(getRun).mockResolvedValueOnce({
      ...sourceRun,
      id: 'run-other',
      workflow: 'other-workflow',
    } as never);

    await expect(
      buildMissionDetailData('run-other', listE2eMissionScenarios()),
    ).resolves.toBeNull();
  });

  it('aggregates detail data with run-scoped artifacts and approvals', async () => {
    vi.mocked(getRun).mockResolvedValue(sourceRun as never);
    vi.mocked(listRunsForCard).mockResolvedValue([sourceRun, continuationRun] as never);
    vi.mocked(listArtifacts)
      .mockResolvedValueOnce([
        {
          id: 'artifact-research',
          kind: 'research',
          createdAt: new Date('2026-06-30T12:04:00.000Z'),
        },
      ] as never)
      .mockResolvedValueOnce([
        {
          id: 'artifact-summary',
          kind: 'summary',
          createdAt: new Date('2026-06-30T12:08:00.000Z'),
        },
      ] as never);
    vi.mocked(listApprovals)
      .mockResolvedValueOnce([
        {
          id: 'approval-1',
          runId: 'run-source',
          reason: 'plan',
          status: 'pending',
          summary: 'Operator approval required before code generation.',
          requestedAt: new Date('2026-06-30T12:05:00.000Z'),
          resolvedAt: null,
          resolvedBy: null,
        },
      ] as never)
      .mockResolvedValueOnce([] as never);

    const detail = await buildMissionDetailData('run-source', listE2eMissionScenarios());

    expect(getRun).toHaveBeenCalledWith('run-source');
    expect(detail).toMatchObject({
      scenario: { id: 'research-to-landing' },
      run: { id: 'run-source' },
      missionRuns: [{ id: 'run-source' }, { id: 'run-continuation' }],
      artifacts: [
        { id: 'artifact-research', runId: 'run-source' },
        { id: 'artifact-summary', runId: 'run-continuation' },
      ],
      approvals: [{ id: 'approval-1', runId: 'run-source' }],
    });
  });
});
