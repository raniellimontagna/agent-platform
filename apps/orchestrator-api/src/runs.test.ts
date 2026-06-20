import { describe, expect, it } from 'vitest';
import type { NewRunInput } from './runs.js';

describe('NewRunInput', () => {
  it('accepts generic card fields while preserving linear fields', () => {
    const input: NewRunInput = {
      cardProvider: 'plane',
      cardId: 'plane-work-1',
      cardIdentifier: 'AGP-1',
      cardProjectId: 'project-1',
      linearIssueId: 'plane-work-1',
      linearIssueIdentifier: 'AGP-1',
      title: 'Plane card',
    };

    expect(input.cardProvider).toBe('plane');
  });
});
