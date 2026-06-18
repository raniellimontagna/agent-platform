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
    expect(env.FIRECRAWL_BASE_URL).toBe('https://api.firecrawl.dev');
    expect(env.FIRECRAWL_TIMEOUT_MS).toBe(60_000);
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
});
