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
});
