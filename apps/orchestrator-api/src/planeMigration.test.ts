import { describe, expect, it, vi } from 'vitest';
import { migrateLinearCardsToPlane } from './planeMigration.js';

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
    expect(result.failed).toEqual([]);
    expect(plane.createCard).toHaveBeenCalledWith(expect.objectContaining({ externalId: 'MAC-2' }));
    expect(plane.comment).toHaveBeenCalledWith('created', 'Migrated from Linear: [MAC-2](https://linear/MAC-2).');
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
      skipped: 0,
      failed: [{ id: 'MAC-3', error: 'boom' }],
    });
    expect(plane.comment).toHaveBeenCalledTimes(1);
    expect(plane.comment).toHaveBeenCalledWith('created-2', 'Migrated from Linear: [MAC-4](https://linear/MAC-4).');
  });
});
