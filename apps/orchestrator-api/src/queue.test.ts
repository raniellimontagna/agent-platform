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
});
