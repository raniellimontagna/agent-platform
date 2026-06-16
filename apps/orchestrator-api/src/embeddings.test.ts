import { describe, expect, it, vi } from 'vitest';

const hfEnv: { cacheDir?: string; allowRemoteModels?: boolean } = {};
const pipeline = vi.fn(async () => async () => {
  const data = new Float32Array(384);
  data[0] = 1;
  return { data };
});

vi.mock('@huggingface/transformers', () => ({
  env: hfEnv,
  pipeline,
}));

const { EMBEDDING_DIM, embed } = await import('./embeddings.js');

describe('embed', () => {
  it('retorna um vetor de EMBEDDING_DIM normalizado', async () => {
    const v = await embed('corrigir bug de autenticação no login');
    expect(v).toHaveLength(EMBEDDING_DIM);
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1, 1);
    expect(pipeline).toHaveBeenCalledWith('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    expect(hfEnv.cacheDir).toBe('/app/.hf-cache');
    expect(hfEnv.allowRemoteModels).toBe(true);
  });
});
