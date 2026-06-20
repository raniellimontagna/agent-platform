import { afterEach, describe, expect, it, vi } from 'vitest';
import { REQUIRED_PLANE_LABELS } from './planeBootstrap.js';
import { migrateLinearCardsToPlane } from './planeMigration.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  vi.unstubAllGlobals();
});

describe('migrateLinearCardsToPlane', () => {
  it('skips cards already present by external id and creates missing cards', async () => {
    const plane = {
      listCardsByExternal: vi.fn().mockResolvedValueOnce([{ id: 'existing' }]).mockResolvedValueOnce([]),
      listComments: vi
        .fn()
        .mockResolvedValueOnce(['<p>Migrated from Linear: <a href="https://linear/MAC-1">MAC-1</a>.</p>']),
      createCard: vi.fn().mockResolvedValue({ id: 'created', identifier: 'AGP-2' }),
      comment: vi.fn(),
    };
    const linearCards = [
      {
        id: 'MAC-1',
        title: 'Existing',
        description: 'A',
        labels: [],
        priority: 'none' as const,
        state: 'Todo',
        url: 'https://linear/MAC-1',
      },
      {
        id: 'MAC-2',
        title: 'Missing',
        description: 'B',
        labels: ['ai-ready'],
        priority: 'medium' as const,
        state: 'Todo',
        url: 'https://linear/MAC-2',
      },
    ];

    const result = await migrateLinearCardsToPlane({
      plane,
      linearCards,
      labelIds: { 'ai-ready': 'label-ai-ready' },
      stateIdsByName: { Todo: 'state-todo' },
    });

    expect(result.skipped).toBe(1);
    expect(result.created).toBe(1);
    expect(result.commented).toBe(1);
    expect(result.failed).toEqual([]);
    expect(plane.createCard).toHaveBeenCalledWith(expect.objectContaining({ externalId: 'MAC-2' }));
    expect(plane.comment).toHaveBeenCalledTimes(1);
    expect(plane.comment).toHaveBeenNthCalledWith(
      1,
      'created',
      'Migrated from Linear: [MAC-2](https://linear/MAC-2).',
    );
  });

  it('records failures and keeps migrating later cards', async () => {
    const plane = {
      listCardsByExternal: vi.fn().mockResolvedValue([]),
      listComments: vi.fn().mockResolvedValue([]),
      createCard: vi
        .fn()
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce({ id: 'created-2', identifier: 'AGP-3' }),
      comment: vi.fn(),
    };

    const result = await migrateLinearCardsToPlane({
      plane: plane as never,
      linearCards: [
        {
          id: 'MAC-3',
          title: 'Fails',
          description: 'A',
          labels: [],
          priority: 'high',
          state: 'Backlog',
          url: 'https://linear/MAC-3',
        },
        {
          id: 'MAC-4',
          title: 'Passes',
          description: 'B',
          labels: [],
          priority: 'low',
          state: 'In Progress',
          url: 'https://linear/MAC-4',
        },
      ],
      labelIds: {},
      stateIdsByName: {},
    });

    expect(result).toEqual({
      created: 1,
      commented: 1,
      skipped: 0,
      failed: [{ id: 'MAC-3', error: 'boom' }],
    });
    expect(plane.comment).toHaveBeenCalledTimes(1);
    expect(plane.comment).toHaveBeenCalledWith('created-2', 'Migrated from Linear: [MAC-4](https://linear/MAC-4).');
  });

  it('does not append duplicate provenance comments for cards that already have one', async () => {
    const plane = {
      listCardsByExternal: vi.fn().mockResolvedValue([{ id: 'existing-card', identifier: 'AGP-1' }]),
      listComments: vi
        .fn()
        .mockResolvedValue(['<p>Migrated from Linear: <a href="https://linear/MAC-5">MAC-5</a>.</p>']),
      createCard: vi.fn(),
      comment: vi.fn(),
    };

    const result = await migrateLinearCardsToPlane({
      plane: plane as never,
      linearCards: [
        {
          id: 'MAC-5',
          title: 'Existing',
          description: 'A',
          labels: ['Feature'],
          priority: 'medium',
          state: 'Todo',
          url: 'https://linear/MAC-5',
        },
      ],
      labelIds: { Feature: 'label-feature' },
      stateIdsByName: { Todo: 'state-todo' },
    });

    expect(result).toEqual({
      created: 0,
      commented: 0,
      skipped: 1,
      failed: [],
    });
    expect(plane.listComments).toHaveBeenCalledWith('existing-card');
    expect(plane.createCard).not.toHaveBeenCalled();
    expect(plane.comment).not.toHaveBeenCalled();
  });

  it('backfills a missing provenance comment once for cards that already exist by external id', async () => {
    const plane = {
      listCardsByExternal: vi.fn().mockResolvedValue([{ id: 'existing-card', identifier: 'AGP-1' }]),
      listComments: vi.fn().mockResolvedValue(['<p>Already discussed elsewhere.</p>']),
      createCard: vi.fn(),
      comment: vi.fn().mockResolvedValue(undefined),
    };

    const result = await migrateLinearCardsToPlane({
      plane: plane as never,
      linearCards: [
        {
          id: 'MAC-5',
          title: 'Existing',
          description: 'A',
          labels: ['Feature'],
          priority: 'medium',
          state: 'Todo',
          url: 'https://linear/MAC-5',
        },
      ],
      labelIds: { Feature: 'label-feature' },
      stateIdsByName: { Todo: 'state-todo' },
    });

    expect(result).toEqual({
      created: 0,
      commented: 1,
      skipped: 1,
      failed: [],
    });
    expect(plane.createCard).not.toHaveBeenCalled();
    expect(plane.comment).toHaveBeenCalledWith(
      'existing-card',
      'Migrated from Linear: [MAC-5](https://linear/MAC-5).',
    );
  });

  it('maps Linear states to Plane states and preserves exact-name labels already present in Plane', async () => {
    const plane = {
      listCardsByExternal: vi.fn().mockResolvedValue([]),
      listComments: vi.fn().mockResolvedValue([]),
      createCard: vi
        .fn()
        .mockResolvedValueOnce({ id: 'created-1', identifier: 'AGP-11' })
        .mockResolvedValueOnce({ id: 'created-2', identifier: 'AGP-12' })
        .mockResolvedValueOnce({ id: 'created-3', identifier: 'AGP-13' }),
      comment: vi.fn(),
    };

    const result = await migrateLinearCardsToPlane({
      plane,
      linearCards: [
        {
          id: 'MAC-11',
          title: 'Backlog card',
          description: 'A',
          labels: ['ai-ready', 'Customer Escalation'],
          priority: 'high',
          state: 'Backlog',
          url: 'https://linear/MAC-11',
        },
        {
          id: 'MAC-12',
          title: 'Todo card',
          description: 'B',
          labels: ['Feature'],
          priority: 'medium',
          state: 'Todo',
          url: 'https://linear/MAC-12',
        },
        {
          id: 'MAC-13',
          title: 'In progress card',
          description: 'C',
          labels: [],
          priority: 'low',
          state: 'In Progress',
          url: 'https://linear/MAC-13',
        },
      ],
      labelIds: {
        'ai-ready': 'label-ai-ready',
        'Customer Escalation': 'label-customer-escalation',
        Feature: 'label-feature',
      },
      stateIdsByName: {
        Backlog: 'state-backlog',
        Unstarted: 'state-unstarted',
        Started: 'state-started',
      },
    });

    expect(result).toEqual({
      created: 3,
      commented: 3,
      skipped: 0,
      failed: [],
    });
    expect(plane.createCard).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        externalId: 'MAC-11',
        labelIds: ['label-ai-ready', 'label-customer-escalation'],
        stateId: 'state-backlog',
      }),
    );
    expect(plane.createCard).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        externalId: 'MAC-12',
        labelIds: ['label-feature'],
        stateId: 'state-unstarted',
      }),
    );
    expect(plane.createCard).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        externalId: 'MAC-13',
        labelIds: [],
        stateId: 'state-started',
      }),
    );
  });
});

describe('planeMigrationCli main', () => {
  it('reuses bootstrap label ids instead of a narrow hard-coded label map', async () => {
    const labelIds = Object.fromEntries(
      REQUIRED_PLANE_LABELS.map((name, index) => [name, `label-${index + 1}`]),
    );
    const plane = {
      kind: 'plane-gateway',
      listLabels: vi.fn().mockResolvedValue([
        { id: 'label-customer-escalation', name: 'Customer Escalation' },
      ]),
      listStates: vi.fn().mockResolvedValue([
        { id: 'state-backlog', name: 'Backlog' },
        { id: 'state-unstarted', name: 'Unstarted' },
        { id: 'state-started', name: 'Started' },
      ]),
    };
    const migrateLinearCardsToPlaneMock = vi.fn().mockResolvedValue({
      created: 1,
      skipped: 0,
      commented: 1,
      failed: [],
    });
    const ensurePlaneProjectAndLabelsMock = vi.fn().mockResolvedValue({
      projectId: 'project-9',
      labelIds,
    });
    const createPlaneGatewayMock = vi.fn().mockReturnValue(plane);

    vi.doMock('./env.js', () => ({
      env: {
        PLANE_API_KEY: 'plane-key',
        PLANE_PROJECT_ID: 'project-9',
        PLANE_BASE_URL: 'http://plane.local',
        PLANE_WORKSPACE_SLUG: 'attodev',
        LINEAR_API_KEY: 'linear-key',
        LINEAR_TEAM_ID: 'team-1',
      },
    }));
    vi.doMock('./planeBootstrap.js', () => ({
      ensurePlaneProjectAndLabels: ensurePlaneProjectAndLabelsMock,
    }));
    vi.doMock('./planeMigration.js', () => ({
      migrateLinearCardsToPlane: migrateLinearCardsToPlaneMock,
    }));
    vi.doMock('@agent-platform/plane', () => ({
      createPlaneGateway: createPlaneGatewayMock,
    }));
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            issues: {
              pageInfo: { hasNextPage: false, endCursor: null },
              nodes: [
                {
                  identifier: 'MAC-6',
                  title: 'Bootstrap labels',
                  description: 'A',
                  priority: 3,
                  url: 'https://linear/MAC-6',
                  state: {
                    name: 'Todo',
                  },
                  labels: {
                    nodes: [{ name: 'repo:create' }, { name: 'Customer Escalation' }],
                  },
                },
              ],
            },
          },
        }),
      }),
    );

    const { main } = await import('./planeMigrationCli.js');
    await main();

    expect(ensurePlaneProjectAndLabelsMock).toHaveBeenCalledWith({
      baseUrl: 'http://plane.local',
      apiKey: 'plane-key',
      workspaceSlug: 'attodev',
    });
    expect(createPlaneGatewayMock).toHaveBeenCalledWith({
      baseUrl: 'http://plane.local',
      apiKey: 'plane-key',
      workspaceSlug: 'attodev',
      projectId: 'project-9',
    });
    expect(migrateLinearCardsToPlaneMock).toHaveBeenCalledWith({
      plane,
      linearCards: [
        {
          id: 'MAC-6',
          title: 'Bootstrap labels',
          description: 'A',
          labels: ['repo:create', 'Customer Escalation'],
          priority: 'medium',
          state: 'Todo',
          url: 'https://linear/MAC-6',
        },
      ],
      labelIds: {
        ...labelIds,
        'Customer Escalation': 'label-customer-escalation',
      },
      stateIdsByName: {
        Backlog: 'state-backlog',
        Unstarted: 'state-unstarted',
        Started: 'state-started',
      },
    });
  });
});
