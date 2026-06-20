import { describe, expect, it } from 'vitest';
import { labelJustAdded } from './cardWebhook.js';

describe('labelJustAdded', () => {
  it('detects a newly added label by name or id', () => {
    expect(
      labelJustAdded({
        currentNames: ['ai-ready'],
        currentIds: [],
        previousNames: [],
        previousIds: [],
        action: 'update',
        name: 'ai-ready',
        id: 'ai-ready-id',
      }),
    ).toBe(true);
  });

  it('returns false on update when previous label state is absent', () => {
    expect(
      labelJustAdded({
        currentNames: ['ai-ready'],
        currentIds: ['ai-ready-id'],
        previousNames: undefined,
        previousIds: undefined,
        action: 'update',
        name: 'ai-ready',
        id: 'ai-ready-id',
      }),
    ).toBe(false);
  });

  it('returns false on update when the label was already present', () => {
    expect(
      labelJustAdded({
        currentNames: ['ai-ready'],
        currentIds: ['ai-ready-id'],
        previousNames: ['ai-ready'],
        previousIds: ['ai-ready-id'],
        action: 'update',
        name: 'ai-ready',
        id: 'ai-ready-id',
      }),
    ).toBe(false);
  });
});
