import { z } from 'zod';
import type { CommandResult } from '../types.js';
import { instagramProfileUrl, normalizeInstagramHandles } from './researchInstagram.js';
import { RESEARCH_HEADINGS, redactSensitiveText, truncateInline } from './researchOutput.js';

type FetchImpl = typeof fetch;

export interface ApifyInstagramResearchOptions {
  token?: string;
  actorId: string;
  baseUrl: string;
  maxItems: number;
  timeoutMs: number;
  fetchImpl?: FetchImpl;
}

export interface ApifyInstagramProfile {
  username: string;
  fullName?: string;
  biography?: string;
  followersCount?: number;
  postsCount?: number;
  verified?: boolean;
  url?: string;
}

export interface ApifyInstagramMedia {
  id?: string;
  url?: string;
  caption?: string;
  timestamp?: string;
  likesCount?: number;
  commentsCount?: number;
}

export type ApifyInstagramFinding =
  | {
      handle: string;
      status: 'succeeded';
      actorId: string;
      profile?: ApifyInstagramProfile;
      media: ApifyInstagramMedia[];
    }
  | {
      handle: string;
      status: 'skipped' | 'failed';
      actorId: string;
      limitation: string;
    };

export interface ApifyInstagramResearchResult {
  findings: ApifyInstagramFinding[];
  commands: CommandResult[];
}

const apifyDatasetSchema = z.array(z.record(z.unknown()));
const apifyErrorSchema = z
  .object({
    error: z
      .object({
        message: z.string().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export async function runApifyInstagramResearch(
  handles: string[],
  opts: ApifyInstagramResearchOptions,
): Promise<ApifyInstagramResearchResult> {
  const uniqueHandles = normalizeInstagramHandles(handles);
  const commands: CommandResult[] = [];
  if (uniqueHandles.length === 0) return { findings: [], commands };

  if (!opts.token) {
    const limitation = 'Apify Instagram skipped: APIFY_TOKEN is not configured.';
    commands.push({
      command: 'apify instagram skipped',
      exitCode: 0,
      stdout: uniqueHandles.map((handle) => `@${handle}`).join(', '),
      stderr: limitation,
      durationMs: 0,
    });
    return {
      findings: uniqueHandles.map((handle) => ({
        handle,
        actorId: opts.actorId,
        status: 'skipped',
        limitation,
      })),
      commands,
    };
  }

  const started = Date.now();
  const command =
    uniqueHandles.length === 1
      ? `apify instagram actor @${uniqueHandles[0]}`
      : `apify instagram actor ${uniqueHandles.map((handle) => `@${handle}`).join(', ')}`;
  const apifyOpts = {
    ...opts,
    token: opts.token,
  };
  try {
    const items = await fetchApifyDatasetItems(uniqueHandles, apifyOpts);
    const findings = normalizeApifyFindings(uniqueHandles, opts.actorId, items);
    commands.push({
      command,
      exitCode: 0,
      stdout: `${items.length} item(s)`,
      stderr: '',
      durationMs: Date.now() - started,
    });
    return { findings, commands };
  } catch (err) {
    const limitation = apifyLimitation(err, [opts.token]);
    commands.push({
      command,
      exitCode: 1,
      stdout: '',
      stderr: limitation,
      durationMs: Date.now() - started,
    });
    return {
      findings: uniqueHandles.map((handle) => ({
        handle,
        actorId: opts.actorId,
        status: 'failed',
        limitation,
      })),
      commands,
    };
  }
}

async function fetchApifyDatasetItems(
  handles: string[],
  opts: Required<Pick<ApifyInstagramResearchOptions, 'token'>> & ApifyInstagramResearchOptions,
): Promise<Array<Record<string, unknown>>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    const response = await (opts.fetchImpl ?? fetch)(buildApifyActorUrl(opts), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        startUrls: handles.map((handle) => ({ url: instagramProfileUrl(handle) })),
        resultsLimit: opts.maxItems,
      }),
      signal: controller.signal,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const parsed = apifyErrorSchema.safeParse(body);
      throw new Error(
        parsed.success ? parsed.data.error?.message : `Apify HTTP ${response.status}`,
      );
    }
    const parsed = apifyDatasetSchema.safeParse(body);
    if (!parsed.success) throw new Error('Apify returned an invalid dataset response.');
    return parsed.data;
  } finally {
    clearTimeout(timeout);
  }
}

function buildApifyActorUrl(
  opts: Required<Pick<ApifyInstagramResearchOptions, 'token'>> & ApifyInstagramResearchOptions,
): string {
  const url = new URL(
    `${opts.baseUrl.replace(/\/+$/g, '')}/v2/acts/${encodeURIComponent(opts.actorId)}/run-sync-get-dataset-items`,
  );
  url.searchParams.set('token', opts.token);
  return url.toString();
}

function normalizeApifyFindings(
  handles: string[],
  actorId: string,
  items: Array<Record<string, unknown>>,
): ApifyInstagramFinding[] {
  return handles.map((handle) => {
    const matchingItems = items.filter((item) => itemBelongsToHandle(item, handle));
    const profileItem =
      matchingItems.find((item) => stringField(item, 'username') === handle) ?? matchingItems[0];
    const media = matchingItems.flatMap((item) => normalizeMedia(item));
    return {
      handle,
      actorId,
      status: 'succeeded',
      profile: profileItem ? normalizeProfile(profileItem, handle) : { username: handle },
      media,
    };
  });
}

function itemBelongsToHandle(item: Record<string, unknown>, handle: string): boolean {
  const haystack = [
    stringField(item, 'username'),
    stringField(item, 'ownerUsername'),
    stringField(item, 'inputUrl'),
    stringField(item, 'url'),
    stringField(item, 'profileUrl'),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(handle);
}

function normalizeProfile(
  item: Record<string, unknown>,
  fallbackHandle: string,
): ApifyInstagramProfile {
  return {
    username: stringField(item, 'username') ?? stringField(item, 'ownerUsername') ?? fallbackHandle,
    fullName:
      stringField(item, 'fullName') ?? stringField(item, 'full_name') ?? stringField(item, 'name'),
    biography: stringField(item, 'biography') ?? stringField(item, 'bio'),
    followersCount: numberField(item, 'followersCount') ?? numberField(item, 'followers'),
    postsCount: numberField(item, 'postsCount') ?? numberField(item, 'posts'),
    verified: booleanField(item, 'verified') ?? booleanField(item, 'isVerified'),
    url:
      stringField(item, 'url') ??
      stringField(item, 'profileUrl') ??
      instagramProfileUrl(fallbackHandle),
  };
}

function normalizeMedia(item: Record<string, unknown>): ApifyInstagramMedia[] {
  const url = stringField(item, 'url') ?? stringField(item, 'permalink');
  const shortCode =
    stringField(item, 'shortCode') ?? stringField(item, 'shortcode') ?? stringField(item, 'id');
  if (!url?.includes('/p/') && !url?.includes('/reel/') && !shortCode) return [];
  return [
    {
      id: shortCode,
      url,
      caption: stringField(item, 'caption') ?? stringField(item, 'text'),
      timestamp: stringField(item, 'timestamp') ?? stringField(item, 'takenAt'),
      likesCount: numberField(item, 'likesCount') ?? numberField(item, 'likes'),
      commentsCount: numberField(item, 'commentsCount') ?? numberField(item, 'comments'),
    },
  ];
}

function apifyLimitation(err: unknown, exactSecrets: string[] = []): string {
  const message = err instanceof Error ? err.message : String(err);
  return `Apify Instagram limitation: ${redactSensitiveText(message, exactSecrets)}`;
}

export function formatApifyInstagramFindings(findings: ApifyInstagramFinding[]): string[] {
  if (findings.length === 0) return [];
  const lines = [RESEARCH_HEADINGS.apifyInstagramFindings, '', '### Sources', ''];
  for (const [index, finding] of findings.entries()) {
    lines.push(`- AP${index + 1}: @${finding.handle} via Apify actor ${finding.actorId}`);
  }
  lines.push('', '### Profiles / Posts', '');
  for (const [index, finding] of findings.entries()) {
    if (finding.status !== 'succeeded') continue;
    const profile = finding.profile;
    if (profile) {
      lines.push(`- @${finding.handle} username: ${profile.username}`);
      if (profile.fullName) lines.push(`- @${finding.handle} name: ${profile.fullName}`);
      if (profile.biography) lines.push(`- @${finding.handle} bio: ${profile.biography}`);
      if (profile.followersCount !== undefined)
        lines.push(`- @${finding.handle} followers: ${profile.followersCount}`);
      if (profile.postsCount !== undefined)
        lines.push(`- @${finding.handle} posts: ${profile.postsCount}`);
      if (profile.verified !== undefined)
        lines.push(`- @${finding.handle} verified: ${profile.verified}`);
      if (profile.url) lines.push(`- @${finding.handle} profile URL: ${profile.url}`);
    }
    for (const [mediaIndex, media] of finding.media.entries()) {
      const parts = [
        media.url,
        media.timestamp,
        media.caption ? `caption: ${truncateInline(media.caption, 180)}` : undefined,
        media.likesCount !== undefined ? `likes: ${media.likesCount}` : undefined,
        media.commentsCount !== undefined ? `comments: ${media.commentsCount}` : undefined,
      ].filter(Boolean);
      lines.push(`- AP${index + 1}-M${mediaIndex + 1}: ${parts.join(' | ')}`);
    }
  }
  lines.push('', '### Limitations', '');
  for (const finding of findings) {
    if (finding.status !== 'succeeded') lines.push(`- @${finding.handle}: ${finding.limitation}`);
  }
  lines.push(
    '- Data was collected through Apify as an external provider for public Instagram research.',
    '- No login bypass, engagement actions, DMs, private analytics, or hidden content were requested by agent-platform.',
    '',
  );
  return lines;
}

function stringField(item: Record<string, unknown>, key: string): string | undefined {
  const value = item[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function numberField(item: Record<string, unknown>, key: string): number | undefined {
  const value = item[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function booleanField(item: Record<string, unknown>, key: string): boolean | undefined {
  const value = item[key];
  return typeof value === 'boolean' ? value : undefined;
}
