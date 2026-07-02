import { describe, expect, it } from 'vitest';
import { createRuntimeCards } from './cards.js';

describe('createRuntimeCards', () => {
  it('registers only Plane for Plane-only runtime defaults', () => {
    const cards = createRuntimeCards({
      CARD_PRIMARY_PROVIDER: 'plane',
      CARD_EXTRA_PROVIDERS: '',
      PLANE_BASE_URL: 'http://plane.local',
      PLANE_API_KEY: 'plane-key',
      PLANE_WORKSPACE_SLUG: 'attodev',
      PLANE_PROJECT_ID: 'project-1',
    });

    expect(cards.primary.provider).toBe('plane');
    expect(cards.forProvider('plane').provider).toBe('plane');
    expect(() => cards.forProvider('linear')).toThrow('Card provider not configured: linear');
  });

  it('registers Linear only when explicit legacy env is supplied', () => {
    const cards = createRuntimeCards({
      CARD_PRIMARY_PROVIDER: 'plane',
      CARD_EXTRA_PROVIDERS: 'linear',
      PLANE_BASE_URL: 'http://plane.local',
      PLANE_API_KEY: 'plane-key',
      PLANE_WORKSPACE_SLUG: 'attodev',
      PLANE_PROJECT_ID: 'project-1',
      LINEAR_API_KEY: 'linear-key',
      LINEAR_TEAM_ID: 'team-1',
    });

    expect(cards.primary.provider).toBe('plane');
    expect(cards.forProvider('linear').provider).toBe('linear');
  });
});
