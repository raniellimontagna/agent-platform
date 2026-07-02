import { copyFile, mkdir } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { env } from '../env.js';
import type { Job } from '../types.js';

const LANDING_PAGE_AGENT_KEY = 'landing-page-agent';
const LANDING_HERO_ASSET_BASENAME = 'higgsfield-hero';
export const DEFAULT_LANDING_HERO_ASSET_PATH = `public/generated/${LANDING_HERO_ASSET_BASENAME}.jpg`;

export function shouldAutoGenerateLandingMedia(job: Job): boolean {
  if (!env.HIGGSFIELD_AUTO_GENERATE_LANDING_MEDIA) return false;
  if (job.reviewFeedback?.trim()) return false;
  if (job.agentKey !== LANDING_PAGE_AGENT_KEY) return false;
  return true;
}

export function buildLandingMediaPrompt(job: Job): string {
  return [
    'Create one high-conversion landing page hero image.',
    `Business/request: ${job.title}`,
    job.description ? `Context: ${job.description}` : '',
    job.plan ? `Approved plan: ${job.plan}` : '',
    'Composition: premium editorial web hero, clear subject, useful negative space for HTML headline overlay, realistic product/service context, polished lighting, no text in image, no logos unless explicitly provided.',
    'Output: wide 16:9 image suitable for a modern Astro + React landing page.',
  ]
    .filter(Boolean)
    .join('\n');
}

export function landingHeroAssetPathForArtifact(artifactPath: string): string {
  const extension = extname(artifactPath).toLowerCase();
  const normalized = extension === '.jpeg' ? '.jpg' : extension || '.jpg';
  return `public/generated/${LANDING_HERO_ASSET_BASENAME}${normalized}`;
}

export function landingMediaContext(assetPath = DEFAULT_LANDING_HERO_ASSET_PATH): string {
  const publicPath = assetPath.replace(/^public\//, '/');
  return [
    '## Generated Higgsfield Media',
    '',
    `A Higgsfield hero image has already been generated and copied to \`${assetPath}\`.`,
    `Use it in the landing page as \`${publicPath}\` for the primary hero/visual section.`,
    'Do not create, edit, overwrite, inline, or include this binary asset in generated JSON/code output; only reference the local public URL.',
    'Do not hotlink the external Higgsfield result URL. Keep meaningful alt text and explicit image dimensions/aspect ratio.',
  ].join('\n');
}

export async function restoreLandingMediaAsset(
  dir: string,
  artifactPath: string,
  assetPath = DEFAULT_LANDING_HERO_ASSET_PATH,
): Promise<string> {
  const destination = join(dir, assetPath);
  await mkdir(join(dir, 'public/generated'), { recursive: true });
  await copyFile(artifactPath, destination);
  return assetPath;
}
