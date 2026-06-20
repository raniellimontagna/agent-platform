import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CommandResult } from '../types.js';

const LANDING_AGENT_KEY = 'landing-page-agent';

const LANDING_TEXT_EXTENSIONS = /\.(?:astro|css|html|jsx|mdx|tsx)$/i;
const LANDING_PATH_HINTS = [
  'landing',
  'page',
  'pages/',
  'components/',
  'content',
  'data',
  'styles',
  'test/',
  'tests/',
];

const GENERIC_COPY_PATTERNS = [
  /\btransform(?:e|ar)?\s+(?:sua|seu|your)\b/i,
  /\bunlock\s+(?:your\s+)?potential\b/i,
  /\bleverage\s+cutting-edge\b/i,
  /\bsolutions?\s+for\s+your\s+business\b/i,
  /\blorem ipsum\b/i,
  /\bplaceholder\b/i,
  /\btodo\b/i,
];

export interface LandingQualityGateInput {
  dir: string;
  filesChanged: string[];
  agentKey?: string;
}

export interface LandingQualityGateResult {
  passed: boolean;
  results: CommandResult[];
  failureTail: string;
}

export async function runLandingQualityGate(
  input: LandingQualityGateInput,
): Promise<LandingQualityGateResult> {
  if (input.agentKey !== LANDING_AGENT_KEY) {
    return { passed: true, results: [], failureTail: '' };
  }

  const candidates = input.filesChanged.filter(isLandingTextPath);
  if (candidates.length === 0) {
    return { passed: true, results: [], failureTail: '' };
  }

  const contents = await readCandidateFiles(input.dir, candidates);
  if (!contents.trim()) {
    return { passed: true, results: [], failureTail: '' };
  }

  const failures = evaluateLandingQuality(contents, {
    requiresMotionDev: await projectHasMotionDependency(input.dir),
  });
  const result: CommandResult = {
    command: 'landing-quality-gate',
    exitCode: failures.length > 0 ? 1 : 0,
    stdout: failures.length > 0 ? '' : 'landing quality gate passed',
    stderr: failures.length > 0 ? failures.map((failure) => `- ${failure}`).join('\n') : '',
    durationMs: 0,
  };

  return {
    passed: result.exitCode === 0,
    results: [result],
    failureTail: result.exitCode === 0 ? '' : `$ ${result.command}\n${result.stderr}`,
  };
}

export function evaluateLandingQuality(
  source: string,
  opts: { requiresMotionDev?: boolean } = {},
): string[] {
  const failures: string[] = [];
  const lower = source.toLowerCase();
  const sectionCount = countMatches(source, /<section\b|data-section=|id=["'][a-z0-9-]+["']/gi);
  const ctaCount = countMatches(source, /href=["']#[a-z0-9-]+["']|call-to-action|primaryCta|cta/gi);
  const faqCount = countMatches(lower, /\bfaq\b|perguntas?|d[úu]vidas?|obje[cç][õo]es?/gi);
  const mediaCount = countMatches(
    source,
    /<img\b|<picture\b|\/generated\/|background(?:Image|-image)|hero(?:Image|Media|Visual)/g,
  );
  const motionDevCount = countMatches(
    source,
    /from ["']motion(?:\/react)?["']|from ["']framer-motion["']|\b(?:animate|inView|scroll|stagger|useReducedMotion|useScroll)\s*\(/gi,
  );
  const motionFallbackCount = countMatches(
    source,
    /prefers-reduced-motion|@keyframes|transition|animation/gi,
  );
  const textLength = stripCode(source).replace(/\s+/g, ' ').trim().length;

  if (sectionCount < 6)
    failures.push(`landing must have at least 6 meaningful sections; found ${sectionCount}`);
  if (ctaCount < 2)
    failures.push(`landing must expose at least 2 conversion CTAs; found ${ctaCount}`);
  if (faqCount < 1) failures.push('landing must include an FAQ/objection-handling section');
  if (mediaCount < 1) failures.push('landing must include a real media/visual asset reference');
  if (opts.requiresMotionDev && motionDevCount < 1) {
    failures.push(
      'landing project has `motion`; use real Motion APIs/components, not CSS-only transitions',
    );
  } else if (!opts.requiresMotionDev && motionFallbackCount < 1) {
    failures.push(
      'landing must include tasteful motion or reduced-motion-aware transition styling',
    );
  }
  if (textLength < 4_500) {
    failures.push(
      `landing copy is too thin for a complete page; found ${textLength} text characters`,
    );
  }

  for (const pattern of GENERIC_COPY_PATTERNS) {
    if (pattern.test(source)) {
      failures.push(`landing contains generic or placeholder copy matching ${pattern}`);
    }
  }

  return failures;
}

async function projectHasMotionDependency(dir: string): Promise<boolean> {
  try {
    const raw = await readFile(join(dir, 'package.json'), 'utf8');
    const pkg = JSON.parse(raw) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    return Boolean(pkg.dependencies?.motion ?? pkg.devDependencies?.motion);
  } catch {
    return false;
  }
}

async function readCandidateFiles(dir: string, paths: string[]): Promise<string> {
  const chunks: string[] = [];
  for (const path of paths) {
    try {
      chunks.push(await readFile(join(dir, path), 'utf8'));
    } catch {
      // Ignore deleted or binary-looking paths; normal validation will catch missing imports.
    }
  }
  return chunks.join('\n\n');
}

function isLandingTextPath(path: string): boolean {
  const normalized = path.replaceAll('\\', '/');
  if (!LANDING_TEXT_EXTENSIONS.test(normalized)) return false;
  return LANDING_PATH_HINTS.some((hint) => normalized.toLowerCase().includes(hint));
}

function countMatches(source: string, pattern: RegExp): number {
  return source.match(pattern)?.length ?? 0;
}

function stripCode(source: string): string {
  return source
    .replace(/import\s+[^;]+;/g, '')
    .replace(/className=["'][^"']*["']/g, '')
    .replace(/[{}()[\]<>/=:"'`.,;|&$#@!*+-]/g, ' ');
}
