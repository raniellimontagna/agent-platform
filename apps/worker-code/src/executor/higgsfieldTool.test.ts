import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { CommandResult } from '../types.js';
import {
  generateHiggsfieldImage,
  parseJsonOutput,
  parsePreferredModels,
} from './higgsfieldTool.js';

function command(args: string[], stdout: unknown): CommandResult {
  return {
    command: `higgsfield ${args.join(' ')}`,
    exitCode: 0,
    stdout: JSON.stringify(stdout),
    stderr: '',
    durationMs: 1,
  };
}

describe('parsePreferredModels', () => {
  it('usa lista configurada ou fallback padrão', () => {
    expect(parsePreferredModels(' seedream_v5_lite, flux_2 ')).toEqual([
      'seedream_v5_lite',
      'flux_2',
    ]);
    expect(parsePreferredModels('')).toContain('seedream_v5_lite');
  });
});

describe('parseJsonOutput', () => {
  it('tolera texto ao redor do JSON', () => {
    expect(parseJsonOutput('done\n{"id":"job-1"}\n')).toEqual({ id: 'job-1' });
  });
});

describe('generateHiggsfieldImage', () => {
  it('estima custo, cria job, espera resultado e salva asset + metadata', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'higgsfield-tool-'));
    const calls: string[][] = [];
    const execHiggsfield = vi.fn(async (args: string[]) => {
      calls.push(args);
      if (args[1] === 'cost') return command(args, { credits: 1 });
      if (args[1] === 'create') return command(args, { id: 'job-123' });
      return command(args, { result_url: 'https://cdn.example.com/asset.jpg' });
    });
    const fetchImpl = vi.fn(
      async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 }),
    ) as typeof fetch;

    const result = await generateHiggsfieldImage(
      {
        prompt: 'premium landing page hero',
        outputFilename: 'Hero Asset.JPG',
        runId: 'RUN 1',
      },
      {
        artifactsDir: dir,
        preferredImageModels: ['seedream_v5_lite'],
        timeout: '10m',
        interval: '5s',
        execHiggsfield,
        fetchImpl,
        now: () => new Date('2026-06-19T00:00:00.000Z'),
      },
    );

    expect(result.model).toBe('seedream_v5_lite');
    expect(result.costCredits).toBe(1);
    expect(result.jobId).toBe('job-123');
    expect(result.artifactPath).toMatch(/hero-asset.jpg$/);
    expect(await readFile(result.artifactPath)).toEqual(Buffer.from([1, 2, 3]));
    expect(await readFile(result.metadataPath, 'utf8')).toContain('"provider": "higgsfield"');
    expect(calls.map((args) => args.slice(0, 3))).toEqual([
      ['generate', 'cost', 'seedream_v5_lite'],
      ['generate', 'create', 'seedream_v5_lite'],
      ['generate', 'wait', 'job-123'],
    ]);
    expect(fetchImpl).toHaveBeenCalledWith('https://cdn.example.com/asset.jpg');
  });

  it('aceita job id retornado como array de string pela CLI', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'higgsfield-tool-'));
    const execHiggsfield = vi.fn(async (args: string[]) => {
      if (args[1] === 'cost') return command(args, { credits: 1 });
      if (args[1] === 'create') return command(args, ['job-array-123']);
      return command(args, { result_url: 'https://cdn.example.com/asset.jpg' });
    });
    const fetchImpl = vi.fn(
      async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 }),
    ) as typeof fetch;

    const result = await generateHiggsfieldImage(
      { prompt: 'premium landing page hero', runId: 'RUN 1' },
      {
        artifactsDir: dir,
        preferredImageModels: ['seedream_v5_lite'],
        timeout: '10m',
        interval: '5s',
        execHiggsfield,
        fetchImpl,
      },
    );

    expect(result.jobId).toBe('job-array-123');
    expect(execHiggsfield).toHaveBeenNthCalledWith(3, [
      'generate',
      'wait',
      'job-array-123',
      '--timeout',
      '10m',
      '--interval',
      '5s',
      '--json',
      '--no-color',
    ]);
  });

  it('falha antes de criar quando cost falha', async () => {
    const execHiggsfield = vi.fn(async (args: string[]) => ({
      command: `higgsfield ${args.join(' ')}`,
      exitCode: 1,
      stdout: '',
      stderr: 'not authenticated',
      durationMs: 1,
    }));

    await expect(
      generateHiggsfieldImage(
        { prompt: 'hero' },
        {
          artifactsDir: '/tmp',
          preferredImageModels: ['seedream_v5_lite'],
          timeout: '10m',
          interval: '5s',
          execHiggsfield,
        },
      ),
    ).rejects.toThrow('not authenticated');
    expect(execHiggsfield).toHaveBeenCalledTimes(1);
  });
});
