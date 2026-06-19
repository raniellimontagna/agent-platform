import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { higgsfieldTools } from './higgsfieldTools.js';

vi.mock('../env.js', () => ({
  env: {
    RUNNER_AUTH_TOKEN: 'token',
    RUNNER_ARTIFACTS_DIR: '/tmp/artifacts',
    HIGGSFIELD_PREFERRED_IMAGE_MODELS: 'seedream_v5_lite,flux_2',
    HIGGSFIELD_GENERATE_TIMEOUT: '10m',
    HIGGSFIELD_POLL_INTERVAL: '5s',
  },
}));

vi.mock('../executor/higgsfieldTool.js', async () => {
  const actual = await vi.importActual<typeof import('../executor/higgsfieldTool.js')>(
    '../executor/higgsfieldTool.js',
  );
  return {
    ...actual,
    generateHiggsfieldImage: vi.fn(async () => ({
      model: 'seedream_v5_lite',
      costCredits: 1,
      jobId: 'job-1',
      resultUrl: 'https://cdn.example.com/asset.jpg',
      artifactPath: '/tmp/artifacts/higgsfield/run/asset.jpg',
      metadataPath: '/tmp/artifacts/higgsfield/run/asset.json',
      commands: [],
    })),
  };
});

const app = new Hono();
app.route('/', higgsfieldTools);

describe('higgsfieldTools route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exige bearer token', async () => {
    const res = await app.request('/tools/higgsfield/generate-image', {
      method: 'POST',
      body: JSON.stringify({ prompt: 'hero' }),
    });

    expect(res.status).toBe(401);
  });

  it('gera imagem via wrapper governado', async () => {
    const res = await app.request('/tools/higgsfield/generate-image', {
      method: 'POST',
      headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'hero', runId: 'run-1' }),
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      model: 'seedream_v5_lite',
      jobId: 'job-1',
      artifactPath: '/tmp/artifacts/higgsfield/run/asset.jpg',
    });
  });
});
