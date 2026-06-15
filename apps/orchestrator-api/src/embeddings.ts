/** Dimensão dos embeddings (all-MiniLM-L6-v2). Constante única (vector(384)). */
export const EMBEDDING_DIM = 384;

const MODEL = 'Xenova/all-MiniLM-L6-v2';

// Pipeline carregado sob demanda (lazy) e cacheado no escopo do módulo. O import
// do transformers é dinâmico p/ não pesar quem só precisa de EMBEDDING_DIM.
type Extractor = (text: string, opts: { pooling: 'mean'; normalize: boolean }) => Promise<{ data: Float32Array }>;
let extractorPromise: Promise<Extractor> | null = null;

async function getExtractor(): Promise<Extractor> {
  if (!extractorPromise) {
    extractorPromise = (async () => {
      const { pipeline, env } = await import('@huggingface/transformers');
      // Cache do modelo em volume persistente (ver compose). Default /tmp se ausente.
      env.cacheDir = process.env.HF_HOME ?? '/tmp/hf-cache';
      return (await pipeline('feature-extraction', MODEL)) as unknown as Extractor;
    })();
  }
  return extractorPromise;
}

/** Embeda um texto em um vetor de EMBEDDING_DIM floats (mean-pool + normalizado). */
export async function embed(text: string): Promise<number[]> {
  const extractor = await getExtractor();
  const output = await extractor(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}
