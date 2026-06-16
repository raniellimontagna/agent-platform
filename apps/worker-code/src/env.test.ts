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
  });
});
