import { afterEach, describe, expect, it, vi } from 'vitest';

const originalEnv = { ...process.env };

function seedAgentEnv(input: { extraProviders?: string } = {}) {
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
  process.env.CARD_EXTRA_PROVIDERS = input.extraProviders ?? '';
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
  vi.doUnmock('@agent-platform/graph');
  vi.resetModules();
  process.env = { ...originalEnv };
});

async function importAgentWithGraphMock() {
  const buildAgentGraph = vi.fn((deps: { cards: { provider: string }; doneStateId: string }) => ({
    provider: deps.cards.provider,
    doneStateId: deps.doneStateId,
  }));
  const createCheckpointer = vi.fn(async () => ({ mocked: true }));

  vi.doMock('@agent-platform/graph', () => ({
    buildAgentGraph,
    createCheckpointer,
  }));

  const agent = await import('./agent.js');

  return { ...agent, buildAgentGraph, createCheckpointer };
}

describe('getAgent graph provider enablement', () => {
  it('builds only the Plane graph for default runtime config', async () => {
    seedAgentEnv();
    const { getAgent, buildAgentGraph } = await importAgentWithGraphMock();

    const agent = await getAgent();

    expect(Object.keys(agent.graphs)).toEqual(['plane']);
    expect(agent.graph).toBe(agent.graphs.plane);
    expect(buildAgentGraph).toHaveBeenCalledTimes(1);
    expect(buildAgentGraph.mock.calls[0]?.[0]).toMatchObject({
      cards: { provider: 'plane' },
      doneStateId: 'plane-done',
    });
  });

  it('builds a Linear graph only for explicit legacy extra-provider config', async () => {
    seedAgentEnv({ extraProviders: 'linear' });
    const { getAgent, buildAgentGraph } = await importAgentWithGraphMock();

    const agent = await getAgent();

    expect(Object.keys(agent.graphs).sort()).toEqual(['linear', 'plane']);
    expect(agent.graph).toBe(agent.graphs.plane);
    expect(buildAgentGraph).toHaveBeenCalledTimes(2);
    expect(buildAgentGraph.mock.calls.map(([deps]) => deps.cards.provider)).toEqual([
      'plane',
      'linear',
    ]);
    expect(buildAgentGraph.mock.calls.map(([deps]) => deps.doneStateId)).toEqual([
      'plane-done',
      'linear-done',
    ]);
  });
});

describe('resolveGraphBinding', () => {
  it('uses provider-specific gateway and done state for Plane and Linear graphs', async () => {
    seedAgentEnv({ extraProviders: 'linear' });
    const { resolveGraphBinding } = await import('./agent.js');

    const cards = {
      primary: { provider: 'plane', id: 'primary-plane' },
      forProvider: vi.fn((provider: 'plane' | 'linear') => ({
        provider,
        id: `${provider}-gateway`,
      })),
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
