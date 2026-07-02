import { describe, expect, it, vi } from 'vitest';
import { resolvePlanJobCardRef } from './queue.js';

vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(() => ({ add: vi.fn(), close: vi.fn() })),
}));

describe('resolvePlanJobCardRef', () => {
  it('resolves provider-aware Plane plan jobs', () => {
    expect(
      resolvePlanJobCardRef({
        cardProvider: 'plane',
        cardId: 'plane-card-1',
      }),
    ).toEqual({
      cardProvider: 'plane',
      cardId: 'plane-card-1',
    });
  });

  it('keeps explicit legacy Linear plan jobs provider-aware', () => {
    expect(
      resolvePlanJobCardRef({
        cardProvider: 'linear',
        cardId: 'linear-issue-1',
      }),
    ).toEqual({
      cardProvider: 'linear',
      cardId: 'linear-issue-1',
    });
  });

  it('resolves old missing-provider plan jobs from persisted run card fields', () => {
    expect(
      resolvePlanJobCardRef(
        {
          runId: 'run-old',
        },
        {
          cardProvider: 'plane',
          cardId: 'plane-card-from-run',
          linearIssueId: null,
        },
      ),
    ).toEqual({
      cardProvider: 'plane',
      cardId: 'plane-card-from-run',
    });
  });

  it('resolves explicit legacy Linear jobs from issueId without defaulting ambiguous jobs', () => {
    expect(
      resolvePlanJobCardRef({
        cardProvider: 'linear',
        issueId: 'linear-legacy-issue',
      }),
    ).toEqual({
      cardProvider: 'linear',
      cardId: 'linear-legacy-issue',
    });

    expect(() =>
      resolvePlanJobCardRef({
        runId: 'run-ambiguous',
        issueId: 'linear-legacy-issue',
      }),
    ).toThrow(/card provider\/card id/i);
  });

  it('rejects missing-provider plan jobs when persisted run data cannot resolve them', () => {
    expect(() =>
      resolvePlanJobCardRef(
        {
          runId: 'run-missing-card-ref',
        },
        {
          cardProvider: null,
          cardId: null,
          linearIssueId: 'legacy-linear-id',
        },
      ),
    ).toThrow(/card provider\/card id/i);
  });
});
