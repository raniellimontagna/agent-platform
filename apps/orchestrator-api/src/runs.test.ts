import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMock = vi.hoisted(() => ({
  returning: vi.fn(),
  update: vi.fn(),
  set: vi.fn(),
  where: vi.fn(),
}));

vi.mock('./db/client.js', async () => {
  const schema = await vi.importActual<typeof import('./db/schema.js')>('./db/schema.js');
  return {
    db: { update: dbMock.update },
    schema,
  };
});

import { cancelActiveRunsForCard, resolveRunCardFields } from './runs.js';

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.update.mockReturnValue({ set: dbMock.set });
  dbMock.set.mockReturnValue({ where: dbMock.where });
  dbMock.where.mockReturnValue({ returning: dbMock.returning });
});

describe('resolveRunCardFields', () => {
  it('defaults generic card fields from the legacy linear inputs', () => {
    expect(
      resolveRunCardFields({
        linearIssueId: 'issue-1',
        linearIssueIdentifier: 'MAC-1',
      }),
    ).toEqual({
      cardProvider: 'linear',
      cardId: 'issue-1',
      cardIdentifier: 'MAC-1',
    });
  });

  it('preserves explicit generic card fields', () => {
    expect(
      resolveRunCardFields({
        linearIssueId: 'issue-1',
        linearIssueIdentifier: 'MAC-1',
        cardProvider: 'plane',
        cardId: 'plane-work-1',
        cardIdentifier: 'AGP-1',
      }),
    ).toEqual({
      cardProvider: 'plane',
      cardId: 'plane-work-1',
      cardIdentifier: 'AGP-1',
    });
  });
});

describe('cancelActiveRunsForCard', () => {
  it('marca runs ativos do card como cancelled e devolve a quantidade atualizada', async () => {
    dbMock.returning.mockResolvedValue([{ id: 'run-1' }, { id: 'run-2' }]);

    const count = await cancelActiveRunsForCard('plane', 'plane-work-1', 'plane work item removed');

    expect(count).toBe(2);
    expect(dbMock.update).toHaveBeenCalledTimes(1);
    expect(dbMock.set).toHaveBeenCalledWith({
      status: 'cancelled',
      error: 'plane work item removed',
    });
    expect(dbMock.where).toHaveBeenCalledTimes(1);
    expect(dbMock.returning).toHaveBeenCalledWith(
      expect.objectContaining({ id: expect.anything() }),
    );
  });
});
