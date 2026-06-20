import { afterEach, describe, expect, it, vi } from 'vitest';

const originalEnv = { ...process.env };

function seedAgentEnv() {
  process.env.PORT = '3000';
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'info';
  process.env.DATABASE_URL = 'https://example.com/db';
  process.env.REDIS_URL = 'redis://localhost:6379';
  process.env.LITELLM_BASE_URL = 'https://example.com/llm';
  process.env.LITELLM_API_KEY = 'litellm-key';
  process.env.LINEAR_API_KEY = 'linear-key';
  process.env.LINEAR_WEBHOOK_SECRET = 'linear-secret';
  process.env.CARD_PRIMARY_PROVIDER = 'plane';
  process.env.CARD_EXTRA_PROVIDERS = 'linear';
  process.env.PLANE_BASE_URL = 'https://example.com/plane';
  process.env.PLANE_API_KEY = 'plane-key';
  process.env.PLANE_WORKSPACE_SLUG = 'workspace';
  process.env.PLANE_PROJECT_ID = 'plane-project';
  process.env.GITHUB_TOKEN = 'github-token';
  process.env.RUNNER_BASE_URL = 'https://example.com/runner';
  process.env.RUNNER_AUTH_TOKEN = 'runner-token';
  process.env.REPO_URL = 'https://github.com/example/repo.git';
  process.env.LINEAR_TEAM_ID = 'team-1';
  process.env.LINEAR_DONE_STATE_ID = 'linear-done';
  process.env.PLANE_DONE_STATE_ID = 'plane-done';
}

afterEach(() => {
  vi.resetModules();
  process.env = { ...originalEnv };
});

describe('resolveGraphBinding', () => {
  it('uses provider-specific gateway and done state for Plane and Linear graphs', async () => {
    seedAgentEnv();
    const { resolveGraphBinding } = await import('./agent.js');

    const cards = {
      primary: { provider: 'plane', id: 'primary-plane' },
      forProvider: vi.fn((provider: 'plane' | 'linear') => ({ provider, id: `${provider}-gateway` })),
    };

    expect(
      resolveGraphBinding(
        {
          cards: cards as never,
          linearDoneStateId: 'linear-done',
          planeDoneStateId: 'plane-done',
        },
        'plane',
      ),
    ).toMatchObject({
      provider: 'plane',
      doneStateId: 'plane-done',
      cardGateway: { provider: 'plane', id: 'plane-gateway' },
    });

    expect(
      resolveGraphBinding(
        {
          cards: cards as never,
          linearDoneStateId: 'linear-done',
          planeDoneStateId: 'plane-done',
        },
        'linear',
      ),
    ).toMatchObject({
      provider: 'linear',
      doneStateId: 'linear-done',
      cardGateway: { provider: 'linear', id: 'linear-gateway' },
    });
  });

  it('falls back to the Linear done state when Plane does not define one', async () => {
    seedAgentEnv();
    const { resolveGraphBinding } = await import('./agent.js');

    const cards = {
      primary: { provider: 'plane', id: 'primary-plane' },
      forProvider: vi.fn((provider: 'plane' | 'linear') => ({ provider })),
    };

    expect(
      resolveGraphBinding(
        {
          cards: cards as never,
          linearDoneStateId: 'linear-done',
        },
        'plane',
      ),
    ).toMatchObject({
      provider: 'plane',
      doneStateId: 'linear-done',
      cardGateway: { provider: 'plane' },
    });
  });
});
