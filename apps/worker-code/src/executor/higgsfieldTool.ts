import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import type { CommandResult } from '../types.js';

export const DEFAULT_HIGGSFIELD_IMAGE_MODELS = [
  'seedream_v5_lite',
  'flux_2',
  'seedream_v4_5',
  'nano_banana',
  'kling_omni_image',
  'gpt_image_2',
] as const;

export interface HiggsfieldGenerateImageInput {
  prompt: string;
  model?: string;
  aspectRatio?: string;
  outputFilename?: string;
  runId?: string;
  waitTimeout?: string;
  waitInterval?: string;
}

export interface HiggsfieldToolOptions {
  artifactsDir: string;
  preferredImageModels: string[];
  timeout: string;
  interval: string;
  execHiggsfield?: ExecHiggsfield;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

export interface HiggsfieldGenerationResult {
  model: string;
  costCredits?: number;
  jobId: string;
  resultUrl: string;
  artifactPath: string;
  metadataPath: string;
  commands: CommandResult[];
}

export type ExecHiggsfield = (args: string[]) => Promise<CommandResult>;

const DEFAULT_ASPECT_RATIO = '16:9';

export function parsePreferredModels(value: string): string[] {
  const models = value
    .split(',')
    .map((model) => model.trim())
    .filter(Boolean);
  return models.length > 0 ? models : [...DEFAULT_HIGGSFIELD_IMAGE_MODELS];
}

export async function generateHiggsfieldImage(
  input: HiggsfieldGenerateImageInput,
  opts: HiggsfieldToolOptions,
): Promise<HiggsfieldGenerationResult> {
  const prompt = input.prompt.trim();
  if (!prompt) throw new Error('prompt is required');

  const model =
    input.model?.trim() || opts.preferredImageModels[0] || DEFAULT_HIGGSFIELD_IMAGE_MODELS[0];
  const aspectRatio = input.aspectRatio?.trim() || DEFAULT_ASPECT_RATIO;
  const timeout = input.waitTimeout?.trim() || opts.timeout;
  const interval = input.waitInterval?.trim() || opts.interval;
  const exec = opts.execHiggsfield ?? execHiggsfieldCli;
  const commands: CommandResult[] = [];

  const cost = await exec([
    'generate',
    'cost',
    model,
    '--prompt',
    prompt,
    '--aspect_ratio',
    aspectRatio,
    '--json',
    '--no-color',
  ]);
  commands.push(cost);
  if (cost.exitCode !== 0) throw new Error(cost.stderr || cost.stdout || 'higgsfield cost failed');
  const costCredits = extractNumber(parseJsonOutput(cost.stdout), [
    'credits',
    'credit_cost',
    'cost',
    'estimated_credits',
    'total_credits',
  ]);

  const create = await exec([
    'generate',
    'create',
    model,
    '--prompt',
    prompt,
    '--aspect_ratio',
    aspectRatio,
    '--json',
    '--no-color',
  ]);
  commands.push(create);
  if (create.exitCode !== 0)
    throw new Error(create.stderr || create.stdout || 'higgsfield create failed');
  const createJson = parseJsonOutput(create.stdout);
  const jobId = extractString(createJson, ['id', 'job_id', 'jobId', 'generation_id']);
  if (!jobId) throw new Error('higgsfield create did not return a job id');

  const wait = await exec([
    'generate',
    'wait',
    jobId,
    '--timeout',
    timeout,
    '--interval',
    interval,
    '--json',
    '--no-color',
  ]);
  commands.push(wait);
  if (wait.exitCode !== 0) throw new Error(wait.stderr || wait.stdout || 'higgsfield wait failed');
  const waitJson = parseJsonOutput(wait.stdout);
  const resultUrl = extractString(waitJson, [
    'result_url',
    'resultUrl',
    'url',
    'download_url',
    'downloadUrl',
  ]);
  if (!resultUrl) throw new Error('higgsfield wait did not return a result url');

  const response = await (opts.fetchImpl ?? fetch)(resultUrl);
  if (!response.ok) throw new Error(`failed to download Higgsfield asset: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const detectedExtension = detectImageExtension(
    bytes,
    response.headers.get('content-type'),
    resultUrl,
  );

  const generatedAt = opts.now?.() ?? new Date();
  const runSegment = safeSegment(input.runId || 'manual');
  const dir = join(opts.artifactsDir, 'higgsfield', runSegment);
  await mkdir(dir, { recursive: true });
  const requestedFilename =
    input.outputFilename ||
    `higgsfield-${model}-${generatedAt.getTime()}${detectedExtension ?? '.jpg'}`;
  const filename = withExtension(requestedFilename, detectedExtension);
  const artifactPath = join(dir, filename);
  const metadataPath = join(dir, `${basename(filename, extname(filename))}.json`);

  await writeFile(artifactPath, bytes);
  await writeFile(
    metadataPath,
    `${JSON.stringify(
      {
        provider: 'higgsfield',
        model,
        prompt,
        aspectRatio,
        costCredits,
        jobId,
        resultUrl,
        artifactPath,
        detectedExtension,
        generatedAt: generatedAt.toISOString(),
      },
      null,
      2,
    )}\n`,
  );

  return { model, costCredits, jobId, resultUrl, artifactPath, metadataPath, commands };
}

export function detectImageExtension(
  bytes: Buffer,
  contentType?: string | null,
  url?: string,
): string | undefined {
  const lowerType = contentType?.split(';')[0]?.trim().toLowerCase();
  if (lowerType === 'image/png') return '.png';
  if (lowerType === 'image/jpeg' || lowerType === 'image/jpg') return '.jpg';
  if (lowerType === 'image/webp') return '.webp';
  if (lowerType === 'image/gif') return '.gif';
  if (lowerType === 'image/avif') return '.avif';

  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return '.png';
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return '.jpg';
  if (
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return '.webp';
  }
  if (bytes.subarray(0, 3).toString('ascii') === 'GIF') return '.gif';

  const urlExtension = imageExtensionFromUrl(url);
  if (urlExtension) return urlExtension;
  return undefined;
}

function imageExtensionFromUrl(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    const extension = extname(new URL(url).pathname).toLowerCase();
    if (extension === '.jpeg') return '.jpg';
    if (['.png', '.jpg', '.webp', '.gif', '.avif'].includes(extension)) return extension;
  } catch {
    return undefined;
  }
  return undefined;
}

function withExtension(filename: string, extension?: string): string {
  const safe = safeFilename(filename);
  if (!extension) return safe;
  const current = extname(safe);
  const base = current ? safe.slice(0, -current.length) : safe;
  return `${base}${extension}`;
}

export function parseJsonOutput(stdout: string): unknown {
  const trimmed = stdout.trim();
  if (!trimmed) return {};
  try {
    return JSON.parse(trimmed);
  } catch {
    const first = trimmed.indexOf('{');
    const last = trimmed.lastIndexOf('}');
    if (first >= 0 && last > first) return JSON.parse(trimmed.slice(first, last + 1));
    const arrayFirst = trimmed.indexOf('[');
    const arrayLast = trimmed.lastIndexOf(']');
    if (arrayFirst >= 0 && arrayLast > arrayFirst) {
      return JSON.parse(trimmed.slice(arrayFirst, arrayLast + 1));
    }
    throw new Error('higgsfield returned non-json output');
  }
}

function extractString(value: unknown, keys: string[]): string | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === 'string' && item.trim()) return item.trim();
      const found = extractString(item, keys);
      if (found) return found;
    }
    return undefined;
  }
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const candidate = record[key];
    if (typeof candidate === 'string' && candidate.trim()) return candidate;
  }
  for (const candidate of Object.values(record)) {
    const found = extractString(candidate, keys);
    if (found) return found;
  }
  return undefined;
}

function extractNumber(value: unknown, keys: string[]): number | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = extractNumber(item, keys);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const candidate = record[key];
    if (typeof candidate === 'number') return candidate;
    if (typeof candidate === 'string' && candidate.trim() && !Number.isNaN(Number(candidate))) {
      return Number(candidate);
    }
  }
  for (const candidate of Object.values(record)) {
    const found = extractNumber(candidate, keys);
    if (found !== undefined) return found;
  }
  return undefined;
}

function execHiggsfieldCli(args: string[]): Promise<CommandResult> {
  const start = Date.now();
  return new Promise((resolve) => {
    const child = spawn('higgsfield', args, {
      env: {
        ...process.env,
        HOME: process.env.HIGGSFIELD_HOME ?? process.env.HOME,
        XDG_CONFIG_HOME: process.env.HIGGSFIELD_HOME
          ? `${process.env.HIGGSFIELD_HOME}/.config`
          : process.env.XDG_CONFIG_HOME,
      },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (err) => {
      resolve({
        command: `higgsfield ${args.join(' ')}`,
        exitCode: 127,
        stdout,
        stderr: String(err),
        durationMs: Date.now() - start,
      });
    });
    child.on('close', (code) => {
      resolve({
        command: `higgsfield ${args.join(' ')}`,
        exitCode: code ?? -1,
        stdout,
        stderr,
        durationMs: Date.now() - start,
      });
    });
  });
}

function safeSegment(value: string): string {
  const safe = value
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return safe || 'manual';
}

function safeFilename(value: string): string {
  const safe = value
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return safe || 'higgsfield-asset.jpg';
}
