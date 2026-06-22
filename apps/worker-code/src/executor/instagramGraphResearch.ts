import { z } from 'zod';
import type { CommandResult } from '../types.js';

type FetchImpl = typeof fetch;

export interface InstagramGraphResearchOptions {
  accessToken?: string;
  igUserId?: string;
  baseUrl: string;
  apiVersion: string;
  timeoutMs: number;
  fetchImpl?: FetchImpl;
}

export interface BusinessDiscoveryUrlArgs {
  baseUrl: string;
  apiVersion: string;
  igUserId: string;
  targetUsername: string;
  accessToken: string;
}

export interface InstagramGraphMedia {
  id: string;
  caption?: string;
  mediaType?: string;
  mediaUrl?: string;
  permalink?: string;
  timestamp?: string;
  likeCount?: number;
  commentsCount?: number;
}

export interface InstagramGraphProfile {
  id?: string;
  username: string;
  name?: string;
  biography?: string;
  website?: string;
  followersCount?: number;
  mediaCount?: number;
  media: InstagramGraphMedia[];
}

export type InstagramGraphFinding =
  | {
      handle: string;
      status: 'succeeded';
      profile: InstagramGraphProfile;
      limitation?: string;
    }
  | {
      handle: string;
      status: 'skipped' | 'failed';
      limitation: string;
    };

export interface InstagramGraphResearchResult {
  findings: InstagramGraphFinding[];
  commands: CommandResult[];
}

const BUSINESS_DISCOVERY_FIELDS =
  'id,username,name,biography,website,followers_count,media_count,media.limit(6){id,caption,media_type,media_url,permalink,timestamp,like_count,comments_count}';

const graphResponseSchema = z
  .object({
    business_discovery: z
      .object({
        id: z.string().optional(),
        username: z.string(),
        name: z.string().optional(),
        biography: z.string().optional(),
        website: z.string().optional(),
        followers_count: z.number().optional(),
        media_count: z.number().optional(),
        media: z
          .object({
            data: z
              .array(
                z
                  .object({
                    id: z.string(),
                    caption: z.string().optional(),
                    media_type: z.string().optional(),
                    media_url: z.string().optional(),
                    permalink: z.string().optional(),
                    timestamp: z.string().optional(),
                    like_count: z.number().optional(),
                    comments_count: z.number().optional(),
                  })
                  .passthrough(),
              )
              .optional(),
          })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .optional(),
    error: z
      .object({
        message: z.string().optional(),
        type: z.string().optional(),
        code: z.number().optional(),
        error_subcode: z.number().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export function buildInstagramGraphBusinessDiscoveryUrl(args: BusinessDiscoveryUrlArgs): string {
  const url = new URL(
    `${args.baseUrl.replace(/\/+$/g, '')}/${args.apiVersion.replace(/^\/+/g, '')}/${args.igUserId}`,
  );
  url.searchParams.set(
    'fields',
    `business_discovery.username(${args.targetUsername}){${BUSINESS_DISCOVERY_FIELDS}}`,
  );
  url.searchParams.set('access_token', args.accessToken);
  return url.toString();
}

export async function runInstagramGraphResearch(
  handles: string[],
  opts: InstagramGraphResearchOptions,
): Promise<InstagramGraphResearchResult> {
  const commands: CommandResult[] = [];
  const uniqueHandles = [...new Set(handles.map((h) => h.toLowerCase()).filter(Boolean))];
  if (uniqueHandles.length === 0) return { findings: [], commands };

  if (!opts.accessToken || !opts.igUserId) {
    return {
      findings: uniqueHandles.map((handle) => ({
        handle,
        status: 'skipped',
        limitation:
          'Instagram Graph API Business Discovery skipped: INSTAGRAM_GRAPH_ACCESS_TOKEN or INSTAGRAM_GRAPH_IG_USER_ID is not configured.',
      })),
      commands,
    };
  }

  const findings: InstagramGraphFinding[] = [];
  for (const handle of uniqueHandles) {
    const started = Date.now();
    const command = `instagram graph business_discovery @${handle}`;
    try {
      const profile = await fetchBusinessDiscovery(handle, opts);
      commands.push({
        command,
        exitCode: 0,
        stdout: profile.username,
        stderr: '',
        durationMs: Date.now() - started,
      });
      findings.push({ handle, status: 'succeeded', profile });
    } catch (err) {
      const limitation = graphLimitation(err);
      commands.push({
        command,
        exitCode: 1,
        stdout: '',
        stderr: limitation,
        durationMs: Date.now() - started,
      });
      findings.push({ handle, status: 'failed', limitation });
    }
  }

  return { findings, commands };
}

async function fetchBusinessDiscovery(
  handle: string,
  opts: Required<Pick<InstagramGraphResearchOptions, 'accessToken' | 'igUserId'>> &
    InstagramGraphResearchOptions,
): Promise<InstagramGraphProfile> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    const response = await (opts.fetchImpl ?? fetch)(
      buildInstagramGraphBusinessDiscoveryUrl({
        baseUrl: opts.baseUrl,
        apiVersion: opts.apiVersion,
        igUserId: opts.igUserId,
        targetUsername: handle,
        accessToken: opts.accessToken,
      }),
      { signal: controller.signal },
    );
    const body = await response.json().catch(() => ({}));
    const parsed = graphResponseSchema.safeParse(body);
    if (!parsed.success) throw new Error('Instagram Graph API returned an invalid response.');
    if (!response.ok || parsed.data.error) {
      throw new Error(parsed.data.error?.message ?? `Instagram Graph API HTTP ${response.status}`);
    }
    const profile = parsed.data.business_discovery;
    if (!profile) {
      throw new Error(
        'Business Discovery returned no profile. The target may not be a supported Business or Creator account.',
      );
    }
    return {
      id: profile.id,
      username: profile.username,
      name: profile.name,
      biography: profile.biography,
      website: profile.website,
      followersCount: profile.followers_count,
      mediaCount: profile.media_count,
      media: (profile.media?.data ?? []).map((media) => ({
        id: media.id,
        caption: media.caption,
        mediaType: media.media_type,
        mediaUrl: media.media_url,
        permalink: media.permalink,
        timestamp: media.timestamp,
        likeCount: media.like_count,
        commentsCount: media.comments_count,
      })),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function graphLimitation(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return `Instagram Graph API Business Discovery limitation: ${redactTokenLikeValues(message)}`;
}

function redactTokenLikeValues(value: string): string {
  return value.replace(/[A-Za-z0-9_-]{20,}/g, '[redacted]');
}

export function formatInstagramGraphFindings(findings: InstagramGraphFinding[]): string[] {
  if (findings.length === 0) return [];
  const lines = ['## Instagram Graph API Findings', '', '### Sources', ''];
  for (const [index, finding] of findings.entries()) {
    lines.push(`- IG${index + 1}: @${finding.handle} via Instagram Graph API Business Discovery`);
  }
  lines.push('', '### Profile', '');
  for (const finding of findings) {
    if (finding.status !== 'succeeded') continue;
    lines.push(`- @${finding.handle} username: ${finding.profile.username}`);
    if (finding.profile.name) lines.push(`- @${finding.handle} name: ${finding.profile.name}`);
    if (finding.profile.biography) lines.push(`- @${finding.handle} bio: ${finding.profile.biography}`);
    if (finding.profile.website) lines.push(`- @${finding.handle} website: ${finding.profile.website}`);
    if (finding.profile.followersCount !== undefined) {
      lines.push(`- @${finding.handle} followers: ${finding.profile.followersCount}`);
    }
    if (finding.profile.mediaCount !== undefined) {
      lines.push(`- @${finding.handle} media count: ${finding.profile.mediaCount}`);
    }
  }
  lines.push('', '### Recent Media', '');
  const mediaLines = findings.flatMap((finding, findingIndex) =>
    finding.status === 'succeeded'
      ? finding.profile.media.map((media, mediaIndex) => {
          const parts = [
            media.permalink,
            media.timestamp,
            media.mediaType,
            media.caption ? `caption: ${truncate(media.caption, 180)}` : undefined,
            media.likeCount !== undefined ? `likes: ${media.likeCount}` : undefined,
            media.commentsCount !== undefined ? `comments: ${media.commentsCount}` : undefined,
          ].filter(Boolean);
          return `- IG${findingIndex + 1}-M${mediaIndex + 1}: ${parts.join(' | ')}`;
        })
      : [],
  );
  lines.push(...(mediaLines.length > 0 ? mediaLines : ['- No recent media returned by Business Discovery.']));
  lines.push('', '### Limitations', '');
  for (const finding of findings) {
    if (finding.status !== 'succeeded') lines.push(`- @${finding.handle}: ${finding.limitation}`);
  }
  lines.push(
    '- Business Discovery only returns supported public fields for Business/Creator accounts.',
    '- No private analytics, DMs, follower lists, demographics, or hidden content were requested.',
    '',
  );
  return lines;
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}
