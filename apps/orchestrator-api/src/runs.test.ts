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
import { runs as runsTable } from './db/schema.js';

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.update.mockReturnValue({ set: dbMock.set });
  dbMock.set.mockReturnValue({ where: dbMock.where });
  dbMock.where.mockReturnValue({ returning: dbMock.returning });
});

describe('resolveRunCardFields', () => {
  it('defaults new generic card fields to Plane when no provider is specified', () => {
    expect(
      resolveRunCardFields({
        cardId: 'plane-work-1',
        cardIdentifier: 'AGP-1',
      }),
    ).toEqual({
      cardProvider: 'plane',
      cardId: 'plane-work-1',
      cardIdentifier: 'AGP-1',
    });
  });

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

  it('keeps explicit legacy Linear fields readable as compatibility data', () => {
    expect(
      resolveRunCardFields({
        cardProvider: 'linear',
        linearIssueId: 'issue-legacy',
        linearIssueIdentifier: 'MAC-121',
      }),
    ).toEqual({
      cardProvider: 'linear',
      cardId: 'issue-legacy',
      cardIdentifier: 'MAC-121',
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

  it('preserves explicit legacy Linear card fields as compatibility data', () => {
    expect(
      resolveRunCardFields({
        cardProvider: 'linear',
        cardId: 'issue-legacy',
        cardIdentifier: 'MAC-121',
      }),
    ).toEqual({
      cardProvider: 'linear',
      cardId: 'issue-legacy',
      cardIdentifier: 'MAC-121',
    });
  });

  it('rejects explicit Linear provider without a complete legacy-compatible identity', () => {
    expect(() =>
      resolveRunCardFields({
        cardProvider: 'linear',
        cardId: 'issue-legacy',
      }),
    ).toThrow(/requires both card id and identifier/i);
  });

  it('rejects ambiguous Linear identities when generic and legacy fields conflict', () => {
    expect(() =>
      resolveRunCardFields({
        cardProvider: 'linear',
        linearIssueId: 'issue-legacy',
        linearIssueIdentifier: 'MAC-121',
        cardId: 'plane-work-1',
        cardIdentifier: 'AGP-1',
      }),
    ).toThrow(/ambiguous/i);
  });

  it('rejects missing card identity instead of returning empty strings', () => {
    expect(() => resolveRunCardFields({})).toThrow(/requires card identity/i);
  });
});

describe('runs schema card compatibility', () => {
  it('defaults card_provider to Plane while retaining legacy Linear columns', () => {
    expect(runsTable.cardProvider.default).toBe('plane');
    expect(runsTable.linearIssueId.notNull).toBe(true);
    expect(runsTable.linearIssueIdentifier.notNull).toBe(true);
    expect(runsTable.cardId.name).toBe('card_id');
    expect(runsTable.cardIdentifier.name).toBe('card_identifier');
    expect(runsTable.cardProjectId.name).toBe('card_project_id');
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
