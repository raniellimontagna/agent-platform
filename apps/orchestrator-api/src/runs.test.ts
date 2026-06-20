import { describe, expect, it } from 'vitest';
import { resolveRunCardFields } from './runs.js';

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
