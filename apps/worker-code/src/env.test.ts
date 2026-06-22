import { describe, expect, it } from 'vitest';
import { envSchema } from './env.js';

describe('envSchema', () => {
  it('defaults self-correction to three attempts', () => {
    const env = envSchema.parse({
      RUNNER_WORKDIR: '/tmp/runner',
      RUNNER_ARTIFACTS_DIR: '/tmp/artifacts',
      LITELLM_BASE_URL: 'http://litellm.local',
      LITELLM_API_KEY: 'test-key',
      ORCHESTRATOR_BASE_URL: 'http://orchestrator.local',
      RUNNER_AUTH_TOKEN: 'test-token',
    });

    expect(env.AGENT_MAX_FIX_ATTEMPTS).toBe(3);
    expect(env.AGENT_COMMAND_ALLOWLIST).toContain('higgsfield');
    expect(env.HIGGSFIELD_HOME).toBe('/srv/agent-runners/higgsfield');
    expect(env.HIGGSFIELD_PREFERRED_IMAGE_MODELS).toContain('seedream_v5_lite');
    expect(env.HIGGSFIELD_GENERATE_TIMEOUT).toBe('10m');
    expect(env.HIGGSFIELD_POLL_INTERVAL).toBe('5s');
    expect(env.HIGGSFIELD_AUTO_GENERATE_LANDING_MEDIA).toBe(true);
    expect(env.FIRECRAWL_BASE_URL).toBe('https://api.firecrawl.dev');
    expect(env.FIRECRAWL_TIMEOUT_MS).toBe(60_000);
    expect(env.SCRAPING_MAX_PAGES).toBe(5);
    expect(env.SCRAPING_MAX_OUTPUT_CHARS).toBe(20_000);
    expect(env.SCRAPING_RATE_LIMIT_PER_MINUTE).toBe(6);
    expect(env.PLAYWRIGHT_TIMEOUT_MS).toBe(30_000);
  });

  it('trata FIRECRAWL_API_KEY vazia como ausente', () => {
    const env = envSchema.parse({
      RUNNER_WORKDIR: '/tmp/runner',
      RUNNER_ARTIFACTS_DIR: '/tmp/artifacts',
      LITELLM_BASE_URL: 'http://litellm.local',
      LITELLM_API_KEY: 'test-key',
      ORCHESTRATOR_BASE_URL: 'http://orchestrator.local',
      RUNNER_AUTH_TOKEN: 'test-token',
      FIRECRAWL_API_KEY: '',
    });

    expect(env.FIRECRAWL_API_KEY).toBeUndefined();
  });

  it('carrega defaults opcionais do Instagram Graph API', async () => {
    const { envSchema } = await import('./env.js');
    const parsed = envSchema.parse({
      RUNNER_WORKDIR: '/tmp/work',
      RUNNER_ARTIFACTS_DIR: '/tmp/artifacts',
      LITELLM_BASE_URL: 'http://localhost:4000',
      LITELLM_API_KEY: 'sk-test',
      ORCHESTRATOR_BASE_URL: 'http://localhost:3000',
      RUNNER_AUTH_TOKEN: 'runner-token',
    });

    expect(parsed.INSTAGRAM_GRAPH_BASE_URL).toBe('https://graph.facebook.com');
    expect(parsed.INSTAGRAM_GRAPH_API_VERSION).toMatch(/^v\d+\.\d+$/);
    expect(parsed.INSTAGRAM_GRAPH_TIMEOUT_MS).toBe(30_000);
    expect(parsed.INSTAGRAM_GRAPH_ACCESS_TOKEN).toBeUndefined();
    expect(parsed.INSTAGRAM_GRAPH_IG_USER_ID).toBeUndefined();
    expect(parsed.APIFY_TOKEN).toBeUndefined();
    expect(parsed.APIFY_INSTAGRAM_ACTOR_ID).toBe('shu8hvrXbJbY3Eb9W');
    expect(parsed.APIFY_BASE_URL).toBe('https://api.apify.com');
    expect(parsed.APIFY_INSTAGRAM_MAX_ITEMS).toBe(20);
    expect(parsed.APIFY_TIMEOUT_MS).toBe(300_000);
  });
});
