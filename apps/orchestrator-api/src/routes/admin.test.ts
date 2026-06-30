import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listE2eMissionScenarios } from '../missionScenarios.js';
import { countRunsByStatus, getRun, listApprovals, listRuns, listRunsForCard } from '../runs.js';
import { adminRoute, renderMissionControlPage, renderMissionDetailPage } from './admin.js';

vi.mock('../runs.js', () => ({
  countRunsByStatus: vi.fn(),
  getRun: vi.fn(),
  listApprovals: vi.fn(),
  listRuns: vi.fn(),
  listRunsForCard: vi.fn(),
  ACTIVE_STATUSES: ['pending', 'planning', 'awaiting_approval', 'executing', 'reviewing'],
}));
vi.mock('../artifacts.js', () => ({
  listArtifacts: vi.fn(),
}));
vi.mock('../env.js', () => ({ env: { RUNNER_AUTH_TOKEN: 'secret', AGENT_MAX_CONCURRENCY: 3 } }));
vi.mock('../killswitch.js', () => ({ isPaused: vi.fn(), setPaused: vi.fn() }));
vi.mock('../agent.js', () => ({ getAgent: vi.fn() }));

const app = new Hono();
app.route('/', adminRoute);
const auth = { authorization: 'Bearer secret' };

beforeEach(() => vi.clearAllMocks());

describe('GET /admin/concurrency', () => {
  it('401 sem bearer', async () => {
    const res = await app.request('/admin/concurrency');
    expect(res.status).toBe(401);
  });

  it('devolve limit, active e byStatus', async () => {
    vi.mocked(countRunsByStatus).mockResolvedValue({ executing: 2, completed: 5, planning: 1 });
    const res = await app.request('/admin/concurrency', { headers: auth });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      limit: number;
      active: number;
      byStatus: Record<string, number>;
    };
    expect(body.limit).toBe(3);
    expect(body.active).toBe(3); // executing 2 + planning 1
    expect(body.byStatus).toEqual({ executing: 2, completed: 5, planning: 1 });
  });
});

describe('GET /admin/mission-control/scenarios', () => {
  it('401 sem bearer', async () => {
    const res = await app.request('/admin/mission-control/scenarios');
    expect(res.status).toBe(401);
  });

  it('devolve o registro de cenarios E2E sem disparar runs', async () => {
    const res = await app.request('/admin/mission-control/scenarios', { headers: auth });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      scenarios: [
        {
          id: 'research-to-landing',
          workflow: 'research_landing_page',
          riskLevel: 'caution',
          requiredLabels: [{ name: 'ai-ready' }, { name: 'workflow:landing-page' }],
          expectedStages: [
            { id: 'queued' },
            { id: 'planning' },
            { id: 'awaiting_approval' },
            { id: 'collecting_research' },
            { id: 'landing_generation' },
            { id: 'pull_request' },
            { id: 'completed' },
          ],
        },
      ],
    });
  });
});

describe('GET /admin/mission-control/missions', () => {
  it('401 sem bearer', async () => {
    const res = await app.request('/admin/mission-control/missions');
    expect(res.status).toBe(401);
  });

  it('devolve resumos recentes de missoes com timeline, artefatos e aprovacao', async () => {
    const { listArtifacts } = await import('../artifacts.js');
    vi.mocked(listRuns).mockResolvedValue([
      {
        id: 'run-1',
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
      },
      {
        id: 'run-ignored',
        cardProvider: 'plane',
        cardId: 'card-2',
        cardIdentifier: 'AGP-92',
        status: 'pending',
        title: 'Other workflow',
        branch: null,
        prUrl: null,
        testsPassed: null,
        error: null,
        workflow: 'other-workflow',
        createdAt: new Date('2026-06-30T12:01:00.000Z'),
        updatedAt: new Date('2026-06-30T12:01:00.000Z'),
      },
    ] as never);
    vi.mocked(listArtifacts).mockResolvedValue([
      {
        id: 'artifact-1',
        kind: 'research',
        createdAt: new Date('2026-06-30T12:04:00.000Z'),
      },
    ] as never);
    vi.mocked(listApprovals).mockResolvedValue([
      {
        id: 'approval-1',
        runId: 'run-1',
        reason: 'plan',
        status: 'pending',
        summary: 'Operator approval required before code generation.',
        requestedAt: new Date('2026-06-30T12:05:00.000Z'),
        resolvedAt: null,
        resolvedBy: null,
      },
    ] as never);

    const res = await app.request('/admin/mission-control/missions?limit=5', { headers: auth });

    expect(res.status).toBe(200);
    expect(listRuns).toHaveBeenCalledWith(5, 0);
    expect(listArtifacts).toHaveBeenCalledWith('run-1');
    expect(listApprovals).toHaveBeenCalledWith('run-1');
    await expect(res.json()).resolves.toEqual({
      missions: [
        {
          id: 'run-1',
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
      ],
    });
  });
});

describe('renderMissionControlPage', () => {
  it('renders scenario readiness, recent mission stages, and read-only mode copy', () => {
    const html = renderMissionControlPage({
      scenarios: listE2eMissionScenarios(),
      missions: [
        {
          id: 'run-1',
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
      ],
    });

    expect(html).toContain('Mission Control');
    expect(html).toContain('Read-only rehearsal mode');
    expect(html).toContain('Research to landing page');
    expect(html).toContain('required labels: ai-ready, workflow:landing-page');
    expect(html).toContain('AGP-91');
    expect(html).toContain('Awaiting approval');
    expect(html).toContain('Collecting research');
    expect(html).toContain('active');
    expect(html).toContain('locked');
    expect(html).not.toContain('Launch run');
  });
});

describe('GET /admin/mission-control', () => {
  it('renders the Mission Control dashboard shell as protected HTML', async () => {
    const { listArtifacts } = await import('../artifacts.js');
    vi.mocked(listRuns).mockResolvedValue([
      {
        id: 'run-1',
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
      },
    ] as never);
    vi.mocked(listArtifacts).mockResolvedValue([] as never);
    vi.mocked(listApprovals).mockResolvedValue([] as never);

    const res = await app.request('/admin/mission-control', { headers: auth });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const html = await res.text();
    expect(html).toContain('Mission Control');
    expect(html).toContain('Read-only rehearsal mode');
    expect(html).toContain('Research landing page');
  });
});

describe('renderMissionDetailPage', () => {
  it('renders a mission with research artifact links and PR metadata', () => {
    const scenario = listE2eMissionScenarios()[0]!;
    const html = renderMissionDetailPage({
      scenario,
      run: {
        id: 'run-1',
        cardProvider: 'plane',
        cardId: 'card-1',
        cardIdentifier: 'AGP-91',
        status: 'reviewing',
        title: 'Research landing page',
        branch: 'agent/agp-91-landing',
        prUrl: 'https://github.com/acme/site/pull/12',
        testsPassed: true,
        error: null,
        workflow: 'research_landing_page',
        createdAt: new Date('2026-06-30T12:00:00.000Z'),
        updatedAt: new Date('2026-06-30T12:10:00.000Z'),
      },
      artifacts: [
        {
          id: 'artifact-research',
          kind: 'research',
          createdAt: new Date('2026-06-30T12:06:00.000Z'),
        },
      ],
      approvals: [],
    });

    expect(html).toContain('Mission Detail');
    expect(html).toContain('Research landing page');
    expect(html).toContain('Collecting research');
    expect(html).toContain('/artifacts/artifact-research');
    expect(html).toContain('agent/agp-91-landing');
    expect(html).toContain('https://github.com/acme/site/pull/12');
    expect(html).toContain('Tests passed');
    expect(html).toContain('No approval recorded for this mission.');
  });

  it('renders approval state and empty downstream continuation for a mission awaiting approval', () => {
    const scenario = listE2eMissionScenarios()[0]!;
    const html = renderMissionDetailPage({
      scenario,
      run: {
        id: 'run-1',
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
      },
      artifacts: [
        {
          id: 'artifact-research',
          kind: 'research',
          createdAt: new Date('2026-06-30T12:04:00.000Z'),
        },
      ],
      approvals: [
        {
          id: 'approval-1',
          runId: 'run-1',
          reason: 'plan',
          status: 'pending',
          summary: 'Operator approval required before code generation.',
          requestedAt: new Date('2026-06-30T12:05:00.000Z'),
          resolvedAt: null,
          resolvedBy: null,
        },
      ],
    });

    expect(html).toContain('Awaiting approval');
    expect(html).toContain('pending');
    expect(html).toContain('Operator approval required before code generation.');
    expect(html).toContain('No downstream continuation has started yet.');
  });

  it('renders an explicit empty artifact state', () => {
    const scenario = listE2eMissionScenarios()[0]!;
    const html = renderMissionDetailPage({
      scenario,
      run: {
        id: 'run-1',
        cardProvider: 'plane',
        cardId: 'card-1',
        cardIdentifier: 'AGP-91',
        status: 'planning',
        title: 'Research landing page',
        branch: null,
        prUrl: null,
        testsPassed: null,
        error: null,
        workflow: 'research_landing_page',
        createdAt: new Date('2026-06-30T12:00:00.000Z'),
        updatedAt: new Date('2026-06-30T12:02:00.000Z'),
      },
      artifacts: [],
      approvals: [],
    });

    expect(html).toContain('No artifacts recorded for this mission.');
    expect(html).toContain('No approval recorded for this mission.');
  });
});

describe('GET /admin/mission-control/missions/:runId', () => {
  it('renders a protected mission detail page for a run id', async () => {
    const { listArtifacts } = await import('../artifacts.js');
    vi.mocked(getRun).mockResolvedValue({
      id: 'run-1',
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
    } as never);
    vi.mocked(listArtifacts).mockResolvedValue([] as never);
    vi.mocked(listApprovals).mockResolvedValue([] as never);

    const res = await app.request('/admin/mission-control/missions/run-1', { headers: auth });

    expect(res.status).toBe(200);
    expect(getRun).toHaveBeenCalledWith('run-1');
    expect(listArtifacts).toHaveBeenCalledWith('run-1');
    expect(listApprovals).toHaveBeenCalledWith('run-1');
    const html = await res.text();
    expect(html).toContain('Mission Detail');
    expect(html).toContain('Research landing page');
    expect(html).toContain('No artifacts recorded for this mission.');
  });
});

describe('GET /admin/card-runs', () => {
  it('401 sem bearer', async () => {
    const res = await app.request('/admin/card-runs?provider=plane&cardId=card-1');
    expect(res.status).toBe(401);
  });

  it('exige provider e cardId', async () => {
    const res = await app.request('/admin/card-runs?provider=plane', { headers: auth });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'provider and cardId are required' });
  });

  it('devolve runs recentes para auditoria de webhook/card', async () => {
    vi.mocked(listRunsForCard).mockResolvedValue([
      {
        id: 'run-1',
        cardProvider: 'plane',
        cardId: 'card-1',
        cardIdentifier: 'AGP-34',
        status: 'completed',
        title: 'Coleta',
        branch: 'agent/agp-34',
        prUrl: null,
        testsPassed: true,
        error: null,
        createdAt: new Date('2026-06-21T23:50:02.000Z'),
        updatedAt: new Date('2026-06-21T23:51:09.000Z'),
      },
    ] as never);

    const res = await app.request('/admin/card-runs?provider=plane&cardId=card-1', {
      headers: auth,
    });

    expect(res.status).toBe(200);
    expect(listRunsForCard).toHaveBeenCalledWith('plane', 'card-1', 20);
    await expect(res.json()).resolves.toEqual({
      runs: [
        {
          id: 'run-1',
          cardProvider: 'plane',
          cardId: 'card-1',
          cardIdentifier: 'AGP-34',
          status: 'completed',
          title: 'Coleta',
          branch: 'agent/agp-34',
          prUrl: null,
          testsPassed: true,
          error: null,
          createdAt: '2026-06-21T23:50:02.000Z',
          updatedAt: '2026-06-21T23:51:09.000Z',
        },
      ],
    });
  });
});
