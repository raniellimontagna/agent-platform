import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { EMBEDDING_DIM, embed } from './embeddings.js';

// Usa o modelo VENDORIZADO no repo (apps/orchestrator-api/vendor/hf-cache) — assim
// o teste roda offline em qualquer lugar: local, CI e o sandbox do runner (que clona
// o repo, mas não alcança o HF). Sem isso, `pnpm test` quebrava no sandbox e a
// self-correction sabotava o embeddings.ts. `embed` lê o cacheDir lazy (1ª chamada).
process.env.HF_HOME ??= fileURLToPath(new URL('../vendor/hf-cache', import.meta.url));

describe('embed', () => {
  // Carrega o modelo (baixa ~80MB na 1ª vez) — precisa de rede no primeiro run.
  it('retorna um vetor de EMBEDDING_DIM normalizado', async () => {
    const v = await embed('corrigir bug de autenticação no login');
    expect(v).toHaveLength(EMBEDDING_DIM);
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1, 1);
  }, 120_000);
});
