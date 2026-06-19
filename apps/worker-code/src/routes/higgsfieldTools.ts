import { type Context, Hono, type Next } from 'hono';
import { z } from 'zod';
import { env } from '../env.js';
import { generateHiggsfieldImage, parsePreferredModels } from '../executor/higgsfieldTool.js';

export const higgsfieldTools = new Hono();

const generateImageSchema = z.object({
  prompt: z.string().min(1),
  model: z.string().min(1).optional(),
  aspectRatio: z.string().min(1).default('16:9'),
  outputFilename: z.string().min(1).optional(),
  runId: z.string().min(1).optional(),
  waitTimeout: z.string().min(1).optional(),
  waitInterval: z.string().min(1).optional(),
});

async function requireAuth(c: Context, next: Next) {
  if (c.req.header('authorization') !== `Bearer ${env.RUNNER_AUTH_TOKEN}`) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  await next();
}

higgsfieldTools.use('/tools/higgsfield/*', requireAuth);

higgsfieldTools.post('/tools/higgsfield/generate-image', async (c) => {
  const parsed = generateImageSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: 'invalid request', issues: parsed.error.issues }, 400);
  }

  const result = await generateHiggsfieldImage(parsed.data, {
    artifactsDir: env.RUNNER_ARTIFACTS_DIR,
    preferredImageModels: parsePreferredModels(env.HIGGSFIELD_PREFERRED_IMAGE_MODELS),
    timeout: env.HIGGSFIELD_GENERATE_TIMEOUT,
    interval: env.HIGGSFIELD_POLL_INTERVAL,
  });

  return c.json({
    model: result.model,
    costCredits: result.costCredits,
    jobId: result.jobId,
    resultUrl: result.resultUrl,
    artifactPath: result.artifactPath,
    metadataPath: result.metadataPath,
    commands: result.commands,
  });
});
