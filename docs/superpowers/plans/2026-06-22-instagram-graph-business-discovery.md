# Instagram Graph Business Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Instagram Graph API Business Discovery as an optional public research source for `data-collector-agent`.

**Architecture:** Create a focused `instagramGraphResearch.ts` worker module that calls Meta Graph API, validates responses, and returns structured findings plus audit commands. Wire those findings into the existing Firecrawl research path so Graph API data enriches, but does not replace, public fallback collection.

**Tech Stack:** TypeScript, Node fetch, `zod`, Vitest, existing worker-code executor patterns, existing `rtk corepack pnpm` commands.

## Global Constraints

- Use Graph API only for public Business/Creator data available through Business Discovery.
- Do not collect private analytics, DMs, follower lists, audience demographics, or account insights for third-party profiles.
- Do not automate login, bypass platform controls, scrape behind authentication, or simulate user engagement.
- Keep Graph API envs optional; missing envs must not break current Firecrawl/Playwright public collection.
- Never print or store `INSTAGRAM_GRAPH_ACCESS_TOKEN` in commands, research artifacts, errors, or logs.
- Continue to use `rtk` prefix for local commands.

---

## File Structure

- Create `apps/worker-code/src/executor/instagramGraphResearch.ts`: owns Meta request construction, response parsing, error normalization, and markdown formatting for Graph API findings.
- Create `apps/worker-code/src/executor/instagramGraphResearch.test.ts`: unit tests for URL construction, success normalization, error limitation behavior, env skipping, and token redaction.
- Modify `apps/worker-code/src/env.ts`: optional Instagram Graph API envs.
- Modify `apps/worker-code/.env.example`: placeholders for optional Instagram Graph API config.
- Modify `infra/compose/runners/.env.example`: same runner env placeholders.
- Modify `apps/worker-code/src/executor/firecrawlResearch.ts`: pass extracted handles through Graph API helper and include findings in the research pack.
- Modify `apps/worker-code/src/executor/firecrawlResearch.test.ts`: integration-level tests for combined Graph API + Firecrawl output and Graph skip behavior.
- Modify `apps/worker-code/src/executor/runJob.ts`: pass Instagram Graph env options into the data collector path.
- Modify `docs/runbooks/data-collector-agent.md`: document Business Discovery behavior, limitations, and fallback.
- Modify `docs/runbooks/secrets.md`: add optional Instagram Graph API secrets.

---

### Task 1: Add Instagram Graph Research Module

**Files:**
- Create: `apps/worker-code/src/executor/instagramGraphResearch.ts`
- Test: `apps/worker-code/src/executor/instagramGraphResearch.test.ts`

**Interfaces:**
- Consumes: `CommandResult` from `apps/worker-code/src/types.ts`.
- Produces:
  - `InstagramGraphResearchOptions`
  - `InstagramGraphProfile`
  - `InstagramGraphFinding`
  - `runInstagramGraphResearch(handles: string[], opts: InstagramGraphResearchOptions): Promise<InstagramGraphResearchResult>`
  - `buildInstagramGraphBusinessDiscoveryUrl(args: BusinessDiscoveryUrlArgs): string`
  - `formatInstagramGraphFindings(findings: InstagramGraphFinding[]): string[]`

- [ ] **Step 1: Write failing tests for URL construction and successful response normalization**

Add `apps/worker-code/src/executor/instagramGraphResearch.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import {
  buildInstagramGraphBusinessDiscoveryUrl,
  runInstagramGraphResearch,
} from './instagramGraphResearch.js';

describe('buildInstagramGraphBusinessDiscoveryUrl', () => {
  it('builds a Business Discovery URL with conservative public fields', () => {
    const url = buildInstagramGraphBusinessDiscoveryUrl({
      baseUrl: 'https://graph.facebook.com',
      apiVersion: 'v20.0',
      igUserId: '17841400000000000',
      targetUsername: 'cameraecarburador',
      accessToken: 'secret-token',
    });

    expect(url).toContain('https://graph.facebook.com/v20.0/17841400000000000?');
    expect(decodeURIComponent(url)).toContain(
      'business_discovery.username(cameraecarburador){id,username,name,biography,website,followers_count,media_count,media.limit(6){id,caption,media_type,media_url,permalink,timestamp,like_count,comments_count}}',
    );
    expect(url).toContain('access_token=secret-token');
  });
});

describe('runInstagramGraphResearch', () => {
  it('normalizes Business Discovery data without leaking token into commands or markdown', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            business_discovery: {
              id: '17890000000000000',
              username: 'cameraecarburador',
              name: 'Camera e Carburador',
              biography: 'Carros antigos e carburadores.',
              website: 'https://camera.example',
              followers_count: 1234,
              media_count: 87,
              media: {
                data: [
                  {
                    id: '17900000000000001',
                    caption: 'Motor revisado hoje.',
                    media_type: 'IMAGE',
                    media_url: 'https://cdn.example/media.jpg',
                    permalink: 'https://www.instagram.com/p/example/',
                    timestamp: '2026-06-20T12:00:00+0000',
                    like_count: 42,
                    comments_count: 3,
                  },
                ],
              },
            },
          }),
          { status: 200 },
        ),
    ) as typeof fetch;

    const result = await runInstagramGraphResearch(['cameraecarburador'], {
      accessToken: 'secret-token',
      igUserId: '17841400000000000',
      baseUrl: 'https://graph.facebook.com',
      apiVersion: 'v20.0',
      timeoutMs: 10_000,
      fetchImpl,
    });

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({
      handle: 'cameraecarburador',
      status: 'succeeded',
      profile: {
        username: 'cameraecarburador',
        followersCount: 1234,
        mediaCount: 87,
      },
    });
    expect(result.commands[0]).toMatchObject({
      command: 'instagram graph business_discovery @cameraecarburador',
      exitCode: 0,
    });
    expect(JSON.stringify(result)).not.toContain('secret-token');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
rtk corepack pnpm vitest run apps/worker-code/src/executor/instagramGraphResearch.test.ts
```

Expected: FAIL because `instagramGraphResearch.ts` does not exist.

- [ ] **Step 3: Implement the module**

Create `apps/worker-code/src/executor/instagramGraphResearch.ts` with:

```ts
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
      throw new Error('Business Discovery returned no profile. The target may not be a supported Business or Creator account.');
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
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
rtk corepack pnpm vitest run apps/worker-code/src/executor/instagramGraphResearch.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
rtk git add apps/worker-code/src/executor/instagramGraphResearch.ts apps/worker-code/src/executor/instagramGraphResearch.test.ts
rtk git commit -m "feat(research): add instagram graph discovery client"
```

---

### Task 2: Wire Graph Findings Into Firecrawl Research Packs

**Files:**
- Modify: `apps/worker-code/src/executor/firecrawlResearch.ts`
- Modify: `apps/worker-code/src/executor/firecrawlResearch.test.ts`

**Interfaces:**
- Consumes: `runInstagramGraphResearch`, `formatInstagramGraphFindings`, and `InstagramGraphResearchOptions` from Task 1.
- Produces: `FirecrawlResearchOptions.instagramGraph?: InstagramGraphResearchOptions`.

- [ ] **Step 1: Write failing integration tests**

Update `apps/worker-code/src/executor/firecrawlResearch.test.ts` imports and add tests:

```ts
it('inclui achados do Instagram Graph API junto do fallback público', async () => {
  const fetchImpl = vi.fn(async (input) => {
    const url = String(input);
    if (url.includes('graph.facebook.com')) {
      return new Response(
        JSON.stringify({
          business_discovery: {
            username: 'cameraecarburador',
            name: 'Camera e Carburador',
            followers_count: 1234,
            media_count: 87,
          },
        }),
        { status: 200 },
      );
    }
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          summary: 'Perfil público visível.',
          metadata: {
            title: '@cameraecarburador',
            sourceURL: 'https://www.instagram.com/cameraecarburador/',
          },
        },
      }),
      { status: 200 },
    );
  }) as typeof fetch;

  const result = await runFirecrawlResearchJob(
    {
      ...baseJob,
      description: 'Pesquisar @cameraecarburador para landing page.',
    },
    {
      apiKey: 'fc-test',
      baseUrl: 'https://api.firecrawl.dev',
      timeoutMs: 10_000,
      fetchImpl,
      instagramGraph: {
        accessToken: 'secret-token',
        igUserId: '17841400000000000',
        baseUrl: 'https://graph.facebook.com',
        apiVersion: 'v20.0',
        timeoutMs: 10_000,
        fetchImpl,
      },
    },
  );

  expect(result.status).toBe('succeeded');
  expect(result.research).toContain('## Instagram Graph API Findings');
  expect(result.research).toContain('@cameraecarburador name: Camera e Carburador');
  expect(result.research).toContain('@cameraecarburador followers: 1234');
  expect(result.research).toContain('## Instagram Findings');
  expect(JSON.stringify(result)).not.toContain('secret-token');
});

it('registra limitação quando Graph API não está configurada e mantém coleta pública', async () => {
  const fetchImpl = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          success: true,
          data: {
            summary: 'Perfil público visível.',
            metadata: {
              title: '@cameraecarburador',
              sourceURL: 'https://www.instagram.com/cameraecarburador/',
            },
          },
        }),
        { status: 200 },
      ),
  ) as typeof fetch;

  const result = await runFirecrawlResearchJob(
    {
      ...baseJob,
      description: 'Pesquisar @cameraecarburador para landing page.',
    },
    {
      apiKey: 'fc-test',
      baseUrl: 'https://api.firecrawl.dev',
      timeoutMs: 10_000,
      fetchImpl,
      instagramGraph: {
        baseUrl: 'https://graph.facebook.com',
        apiVersion: 'v20.0',
        timeoutMs: 10_000,
        fetchImpl,
      },
    },
  );

  expect(result.status).toBe('succeeded');
  expect(result.research).toContain('Business Discovery skipped');
  expect(result.research).toContain('## Instagram Findings');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
rtk corepack pnpm vitest run apps/worker-code/src/executor/firecrawlResearch.test.ts
```

Expected: FAIL because `instagramGraph` is not supported yet.

- [ ] **Step 3: Implement Firecrawl wiring**

Modify `apps/worker-code/src/executor/firecrawlResearch.ts`:

```ts
import {
  type InstagramGraphFinding,
  type InstagramGraphResearchOptions,
  formatInstagramGraphFindings,
  runInstagramGraphResearch,
} from './instagramGraphResearch.js';
```

Extend `FirecrawlResearchOptions`:

```ts
  instagramGraph?: InstagramGraphResearchOptions;
```

After `instagramHandles` is computed in `runFirecrawlResearchJob`, run:

```ts
  const instagramGraphResult = opts.instagramGraph
    ? await runInstagramGraphResearch(instagramHandles, opts.instagramGraph)
    : { findings: [] as InstagramGraphFinding[], commands: [] };
  commands.push(...instagramGraphResult.commands);
```

Pass `instagramGraphResult.findings` to each `buildResearchPack(...)` call.

Update `buildResearchPack` signature:

```ts
  instagramHandles: string[] = [],
  instagramGraphFindings: InstagramGraphFinding[] = [],
```

Before the existing `## Instagram Findings` block, insert:

```ts
  lines.push(...formatInstagramGraphFindings(instagramGraphFindings));
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
rtk corepack pnpm vitest run apps/worker-code/src/executor/instagramGraphResearch.test.ts apps/worker-code/src/executor/firecrawlResearch.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
rtk git add apps/worker-code/src/executor/firecrawlResearch.ts apps/worker-code/src/executor/firecrawlResearch.test.ts
rtk git commit -m "feat(research): include instagram graph findings"
```

---

### Task 3: Add Runtime Env Wiring

**Files:**
- Modify: `apps/worker-code/src/env.ts`
- Modify: `apps/worker-code/src/env.test.ts`
- Modify: `apps/worker-code/src/executor/runJob.ts`
- Modify: `apps/worker-code/.env.example`
- Modify: `infra/compose/runners/.env.example`

**Interfaces:**
- Consumes: `FirecrawlResearchOptions.instagramGraph` from Task 2.
- Produces optional env fields:
  - `INSTAGRAM_GRAPH_ACCESS_TOKEN?: string`
  - `INSTAGRAM_GRAPH_IG_USER_ID?: string`
  - `INSTAGRAM_GRAPH_BASE_URL: string`
  - `INSTAGRAM_GRAPH_API_VERSION: string`
  - `INSTAGRAM_GRAPH_TIMEOUT_MS: number`

- [ ] **Step 1: Write failing env test**

Update `apps/worker-code/src/env.test.ts` with:

```ts
it('carrega defaults opcionais do Instagram Graph API', async () => {
  const { envSchema } = await import('./env.js');
  const parsed = envSchema.parse({
    RUNNER_WORKDIR: '/tmp/work',
    RUNNER_ARTIFACTS_DIR: '/tmp/artifacts',
    LITELLM_BASE_URL: 'http://localhost:4000',
    LITELLM_API_KEY: 'sk-test',
    ORCHESTRATOR_BASE_URL: 'http://localhost:3000',
    RUNNER_AUTH_TOKEN: 'runner-token',
  });

  expect(parsed.INSTAGRAM_GRAPH_BASE_URL).toBe('https://graph.facebook.com');
  expect(parsed.INSTAGRAM_GRAPH_API_VERSION).toMatch(/^v\d+\.\d+$/);
  expect(parsed.INSTAGRAM_GRAPH_TIMEOUT_MS).toBe(30_000);
  expect(parsed.INSTAGRAM_GRAPH_ACCESS_TOKEN).toBeUndefined();
  expect(parsed.INSTAGRAM_GRAPH_IG_USER_ID).toBeUndefined();
});
```

- [ ] **Step 2: Run env test to verify it fails**

Run:

```bash
rtk corepack pnpm vitest run apps/worker-code/src/env.test.ts
```

Expected: FAIL because env fields do not exist.

- [ ] **Step 3: Add env schema fields**

Modify `apps/worker-code/src/env.ts` near Firecrawl envs:

```ts
  // Instagram Graph API Business Discovery: optional enrichment for public
  // Business/Creator profile research.
  INSTAGRAM_GRAPH_ACCESS_TOKEN: optionalNonEmpty,
  INSTAGRAM_GRAPH_IG_USER_ID: optionalNonEmpty,
  INSTAGRAM_GRAPH_BASE_URL: z.string().url().default('https://graph.facebook.com'),
  INSTAGRAM_GRAPH_API_VERSION: z.string().regex(/^v\d+\.\d+$/).default('v20.0'),
  INSTAGRAM_GRAPH_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
```

Modify `apps/worker-code/src/executor/runJob.ts` inside the `runFirecrawlResearchJob` options:

```ts
        instagramGraph: {
          accessToken: env.INSTAGRAM_GRAPH_ACCESS_TOKEN,
          igUserId: env.INSTAGRAM_GRAPH_IG_USER_ID,
          baseUrl: env.INSTAGRAM_GRAPH_BASE_URL,
          apiVersion: env.INSTAGRAM_GRAPH_API_VERSION,
          timeoutMs: env.INSTAGRAM_GRAPH_TIMEOUT_MS,
        },
```

Add to both `.env.example` files:

```dotenv
# Instagram Graph API Business Discovery: opcional; enriquece pesquisa pública
# de perfis Business/Creator com dados oficiais disponíveis pela Meta.
INSTAGRAM_GRAPH_ACCESS_TOKEN=
INSTAGRAM_GRAPH_IG_USER_ID=
INSTAGRAM_GRAPH_BASE_URL=https://graph.facebook.com
INSTAGRAM_GRAPH_API_VERSION=v20.0
INSTAGRAM_GRAPH_TIMEOUT_MS=30000
```

- [ ] **Step 4: Run env and research tests**

Run:

```bash
rtk corepack pnpm vitest run apps/worker-code/src/env.test.ts apps/worker-code/src/executor/instagramGraphResearch.test.ts apps/worker-code/src/executor/firecrawlResearch.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
rtk git add apps/worker-code/src/env.ts apps/worker-code/src/env.test.ts apps/worker-code/src/executor/runJob.ts apps/worker-code/.env.example infra/compose/runners/.env.example
rtk git commit -m "feat(worker): configure instagram graph discovery"
```

---

### Task 4: Update Docs and Full Verification

**Files:**
- Modify: `docs/runbooks/data-collector-agent.md`
- Modify: `docs/runbooks/secrets.md`

**Interfaces:**
- Consumes: env names and behavior from Tasks 1-3.
- Produces: operator documentation for setup, limitations, and rollout.

- [ ] **Step 1: Update data collector runbook**

Add a section to `docs/runbooks/data-collector-agent.md` after the Instagram handle normalization paragraph:

```md
### Instagram Graph API Business Discovery

Quando `INSTAGRAM_GRAPH_ACCESS_TOKEN` e `INSTAGRAM_GRAPH_IG_USER_ID` estão
configurados no runner, handles `@perfil` também são consultados pela Instagram
Graph API Business Discovery antes/complementando a coleta pública. Esse caminho
usa nossa conta profissional autorizada para obter campos públicos suportados de
perfis Business/Creator de terceiros: bio, website, contagem pública de
seguidores, contagem de mídia e mídia recente quando a API retorna esses campos.

Se o perfil não for Business/Creator, a permissão do app não cobrir a chamada, o
token estiver ausente ou a Meta limitar a resposta, o research pack registra a
limitação e mantém o fallback Firecrawl/Playwright público. Esse fluxo não pede
analytics privados, DMs, listas de seguidores, demografia, insights internos nem
conteúdo atrás de login.
```

- [ ] **Step 2: Update secrets runbook**

Add rows to `docs/runbooks/secrets.md` inventory:

```md
| `INSTAGRAM_GRAPH_ACCESS_TOKEN` | runner `.env` | Business Discovery opcional para `data-collector-agent` | Meta app / Graph API Explorer / token long-lived |
| `INSTAGRAM_GRAPH_IG_USER_ID` | runner `.env` | IG user raiz autorizado para Business Discovery | Meta Graph API |
```

Add special case:

```md
- **Instagram Graph API**: opcional e usado só pelo runner. Sem
  `INSTAGRAM_GRAPH_ACCESS_TOKEN` ou `INSTAGRAM_GRAPH_IG_USER_ID`, o
  `data-collector-agent` continua com coleta pública e registra que Business
  Discovery foi pulado. Rotacione o token no Meta Developers/Graph API Explorer,
  atualize o runner `.env` e reinicie o runner.
```

- [ ] **Step 3: Run formatting, lint, build, and tests**

Run:

```bash
rtk corepack pnpm biome check --write apps/worker-code/src/env.ts apps/worker-code/src/env.test.ts apps/worker-code/src/executor/instagramGraphResearch.ts apps/worker-code/src/executor/instagramGraphResearch.test.ts apps/worker-code/src/executor/firecrawlResearch.ts apps/worker-code/src/executor/firecrawlResearch.test.ts apps/worker-code/src/executor/runJob.ts docs/runbooks/data-collector-agent.md docs/runbooks/secrets.md
rtk corepack pnpm lint
rtk corepack pnpm --filter @agent-platform/worker-code build
rtk corepack pnpm test
```

Expected: all commands PASS.

- [ ] **Step 4: Commit and push**

Run:

```bash
rtk git add docs/runbooks/data-collector-agent.md docs/runbooks/secrets.md
rtk git commit -m "docs(research): document instagram graph discovery"
rtk git status --short --branch
rtk git push origin main
```

Expected: `main` pushed with the design, plan, and implementation commits.

---

## Self-Review

- Spec coverage: Tasks cover optional envs, Business Discovery module, Firecrawl fallback integration, research pack sections, error handling, token redaction, docs, and rollout.
- Placeholder scan: no `TBD`, `TODO`, `implement later`, or unspecified test instructions remain.
- Type consistency: `InstagramGraphResearchOptions`, `InstagramGraphFinding`, `runInstagramGraphResearch`, and `formatInstagramGraphFindings` are defined in Task 1 and consumed by later tasks with matching names.
