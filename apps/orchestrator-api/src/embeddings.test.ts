import { beforeAll, describe, expect, it, vi } from 'vitest'

const { sharpMock } = vi.hoisted(() => {
  const createPipeline = () => {
    const api = {
      resize: vi.fn(() => api),
      grayscale: vi.fn(() => api),
      greyscale: vi.fn(() => api),
      removeAlpha: vi.fn(() => api),
      ensureAlpha: vi.fn(() => api),
      raw: vi.fn(() => api),
      toColourspace: vi.fn(() => api),
      toColorspace: vi.fn(() => api),
      metadata: vi.fn(async () => ({ width: 4, height: 4, channels: 1 })),
      toBuffer: vi.fn(async (options?: { resolveWithObject?: boolean }) => {
        const data = Buffer.from([
          0, 16, 32, 48,
          64, 80, 96, 112,
          128, 144, 160, 176,
          192, 208, 224, 255,
        ])

        if (options?.resolveWithObject) {
          return {
            data,
            info: {
              width: 4,
              height: 4,
              channels: 1,
            },
          }
        }

        return data
      }),
    }

    return api
  }

  return {
    sharpMock: vi.fn(() => createPipeline()),
  }
})

vi.mock('sharp', () => ({
  default: sharpMock,
}))

let EMBEDDING_DIM: number
let embed: (input: Buffer) => Promise<number[]>

beforeAll(async () => {
  const module = await import('./embeddings')
  EMBEDDING_DIM = module.EMBEDDING_DIM
  embed = module.embed
})

describe('embed', () => {
  it('retorna um vetor de EMBEDDING_DIM normalizado', async () => {
    const vector = await embed(Buffer.from('fake-image'))

    expect(vector).toHaveLength(EMBEDDING_DIM)

    const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0))
    expect(norm).toBeGreaterThan(0)
    expect(norm).toBeCloseTo(1, 5)
  })
})
