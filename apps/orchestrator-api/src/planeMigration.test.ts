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
        url: 'https://linear/MAC-1',
      },
      {
        id: 'MAC-2',
        title: 'Missing',
        description: 'B',
        labels: ['ai-ready'],
        priority: 'medium' as const,
        url: 'https://linear/MAC-2',
      },
    ];

    const result = await migrateLinearCardsToPlane({
      plane: plane as never,
      linearCards,
      labelIds: { 'ai-ready': 'label-ai-ready' },
    });

    expect(result.skipped).toBe(1);
    expect(result.created).toBe(1);
    expect(result.commented).toBe(2);
    expect(result.failed).toEqual([]);
    expect(plane.createCard).toHaveBeenCalledWith(expect.objectContaining({ externalId: 'MAC-2' }));
    expect(plane.comment).toHaveBeenCalledTimes(2);
    expect(plane.comment).toHaveBeenNthCalledWith(
      1,
      'existing',
      'Migrated from Linear: [MAC-1](https://linear/MAC-1).',
    );
    expect(plane.comment).toHaveBeenNthCalledWith(
      2,
      'created',
      'Migrated from Linear: [MAC-2](https://linear/MAC-2).',
    );
  });

  it('records failures and keeps migrating later cards', async () => {
    const plane = {
      listCardsByExternal: vi.fn().mockResolvedValue([]),
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
          url: 'https://linear/MAC-3',
        },
        {
          id: 'MAC-4',
          title: 'Passes',
          description: 'B',
          labels: [],
          priority: 'low',
          url: 'https://linear/MAC-4',
        },
      ],
      labelIds: {},
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

  it('retries the provenance comment for cards that already exist by external id', async () => {
    const plane = {
      listCardsByExternal: vi.fn().mockResolvedValue([{ id: 'existing-card', identifier: 'AGP-1' }]),
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
          url: 'https://linear/MAC-5',
        },
      ],
      labelIds: { Feature: 'label-feature' },
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
});

describe('planeMigrationCli main', () => {
  it('reuses bootstrap label ids instead of a narrow hard-coded label map', async () => {
    const labelIds = Object.fromEntries(
      REQUIRED_PLANE_LABELS.map((name, index) => [name, `label-${index + 1}`]),
    );
    const plane = { kind: 'plane-gateway' };
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
                  labels: {
                    nodes: [{ name: 'repo:create' }, { name: 'Feature' }],
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
          labels: ['repo:create', 'Feature'],
          priority: 'medium',
          url: 'https://linear/MAC-6',
        },
      ],
      labelIds,
    });
  });
});
