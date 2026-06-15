import { describe, expect, it } from 'vitest';
import { EMBEDDING_DIM, embed } from './embeddings.js';

describe('embed', () => {
  // Carrega o modelo (baixa ~80MB na 1ª vez) — precisa de rede no primeiro run.
  it('retorna um vetor de EMBEDDING_DIM normalizado', async () => {
    const v = await embed('corrigir bug de autenticação no login');
    expect(v).toHaveLength(EMBEDDING_DIM);
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1, 1);
  }, 120_000);
});
