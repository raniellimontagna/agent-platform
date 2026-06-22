import { z } from 'zod';
import type { CommandResult, Job, JobResult } from '../types.js';
import {
  type ApifyInstagramFinding,
  type ApifyInstagramResearchOptions,
  formatApifyInstagramFindings,
  runApifyInstagramResearch,
} from './apifyInstagramResearch.js';
import {
  type InstagramGraphFinding,
  type InstagramGraphResearchOptions,
  formatInstagramGraphFindings,
  redactSensitiveText,
  runInstagramGraphResearch,
} from './instagramGraphResearch.js';
import {
  DEFAULT_SCRAPING_LIMITS,
  type ScrapingLimits,
  buildScrapingPolicy,
  extractExplicitUrls,
} from './scrapingPolicy.js';

export const DATA_COLLECTOR_AGENT_KEY = 'data-collector-agent';

const MAX_SUMMARY_CHARS = 1_500;
const MAX_EXTRACT_CHARS = 4_000;

type FetchImpl = typeof fetch;

interface FirecrawlResearchOptions {
  apiKey?: string;
  baseUrl: string;
  timeoutMs: number;
  maxPages?: number;
  maxOutputChars?: number;
  rateLimitPerMinute?: number;
  fetchImpl?: FetchImpl;
  now?: () => Date;
  instagramGraph?: InstagramGraphResearchOptions;
  apifyInstagram?: ApifyInstagramResearchOptions;
}

interface ResearchSource {
  id: string;
  url: string;
  title: string;
  statusCode?: number;
  contentType?: string;
  summary?: string;
  markdown?: string;
  warning?: string;
  error?: string;
  durationMs: number;
}

const firecrawlResponseSchema = z
  .object({
    success: z.boolean().optional(),
    data: z
      .object({
        markdown: z.string().optional(),
        summary: z.string().optional(),
        warning: z.string().optional(),
        metadata: z
          .object({
            title: z.string().optional(),
            description: z.string().optional(),
            sourceURL: z.string().optional(),
            url: z.string().optional(),
            statusCode: z.number().optional(),
            contentType: z.string().optional(),
            error: z.string().optional(),
          })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .optional(),
    error: z.string().optional(),
  })
  .passthrough();

export const extractResearchUrls = extractExplicitUrls;

export function extractInstagramHandles(text: string, limit = 5): string[] {
  const handles = new Set<string>();
  for (const match of text.matchAll(/(^|[^\w.])@([a-zA-Z0-9._]{2,30})\b/g)) {
    const handle = match[2]?.replace(/\.+$/g, '').toLowerCase();
    if (!handle) continue;
    handles.add(handle);
    if (handles.size >= limit) break;
  }
  return [...handles];
}

function instagramProfileUrl(handle: string): string {
  return `https://www.instagram.com/${handle}/`;
}

export async function runFirecrawlResearchJob(
  job: Job,
  opts: FirecrawlResearchOptions,
): Promise<JobResult> {
  const commands: CommandResult[] = [];
  const persistedSecrets = configuredSecrets(opts);
  const base: JobResult = {
    runId: job.runId,
    status: 'failed',
    branch: job.branch,
    commands,
    pushed: false,
    testsPassed: true,
  };

  const instagramHandles = extractInstagramHandles(
    [job.title, job.description, job.plan].join('\n'),
  );
  const instagramGraphResult = opts.instagramGraph
    ? await runInstagramGraphResearch(instagramHandles, opts.instagramGraph)
    : { findings: [] as InstagramGraphFinding[], commands: [] };
  commands.push(...instagramGraphResult.commands);
  const graphSuccesses = instagramGraphResult.findings.filter(
    (finding): finding is Extract<InstagramGraphFinding, { status: 'succeeded' }> =>
      finding.status === 'succeeded',
  );
  const apifyInstagramResult = opts.apifyInstagram
    ? await runApifyInstagramResearch(instagramHandles, opts.apifyInstagram)
    : { findings: [] as ApifyInstagramFinding[], commands: [] };
  commands.push(...apifyInstagramResult.commands);
  const apifySuccesses = apifyInstagramResult.findings.filter(
    (finding): finding is Extract<ApifyInstagramFinding, { status: 'succeeded' }> =>
      finding.status === 'succeeded',
  );
  const inferredInstagramUrls = instagramHandles.map(instagramProfileUrl);
  const policy = buildScrapingPolicy({
    title: job.title,
    description: job.description,
    plan: [job.plan, ...inferredInstagramUrls].filter(Boolean).join('\n'),
    limits: {
      maxPages: opts.maxPages ?? DEFAULT_SCRAPING_LIMITS.maxPages,
      timeoutMs: opts.timeoutMs,
      maxOutputChars: opts.maxOutputChars ?? DEFAULT_SCRAPING_LIMITS.maxOutputChars,
      rateLimitPerMinute: opts.rateLimitPerMinute ?? DEFAULT_SCRAPING_LIMITS.rateLimitPerMinute,
    },
    defaults: DEFAULT_SCRAPING_LIMITS,
  });
  if (policy.urls.length === 0) {
    return {
      ...base,
      error: 'data-collector-agent precisa de pelo menos uma URL na issue ou no plano.',
      testsPassed: false,
    };
  }
  if (!policy.allowed) {
    return {
      ...base,
      error: `Política de scraping bloqueou a coleta: ${policy.reasons.join('; ')}`,
      testsPassed: false,
    };
  }

  const sources: ResearchSource[] = [];
  if (opts.apiKey) {
    for (const [index, url] of policy.urls.slice(0, policy.limits.maxPages).entries()) {
      if (!url) continue;
      const started = Date.now();
      try {
        const source = sanitizeResearchSource(
          {
            ...(await scrapeFirecrawl({
              id: `S${index + 1}`,
              url,
              apiKey: opts.apiKey,
              baseUrl: opts.baseUrl,
              timeoutMs: policy.limits.timeoutMs,
              fetchImpl: opts.fetchImpl ?? fetch,
            })),
            durationMs: Date.now() - started,
          },
          persistedSecrets,
        );
        sources.push(source);
        commands.push({
          command: sanitizeStoredText(`firecrawl scrape ${url}`, persistedSecrets),
          exitCode: 0,
          stdout: sanitizeStoredText(source.title, persistedSecrets),
          stderr: sanitizeStoredText(source.warning ?? '', persistedSecrets),
          durationMs: source.durationMs,
        });
      } catch (err) {
        const message = sanitizeStoredText(
          err instanceof Error ? err.message : String(err),
          persistedSecrets,
        );
        const source = sanitizeResearchSource(
          {
            id: `S${index + 1}`,
            url,
            title: url,
            error: message,
            durationMs: Date.now() - started,
          },
          persistedSecrets,
        );
        sources.push(source);
        commands.push({
          command: sanitizeStoredText(`firecrawl scrape ${url}`, persistedSecrets),
          exitCode: 1,
          stdout: '',
          stderr: message,
          durationMs: source.durationMs,
        });
      }
    }
  }

  const firecrawlSuccesses = sources.filter((source) => !source.error);
  const hasUsableResearch =
    firecrawlSuccesses.length > 0 || graphSuccesses.length > 0 || apifySuccesses.length > 0;
  if (!hasUsableResearch) {
    if (!opts.apiKey) {
      return {
        ...base,
        commands,
        error: 'FIRECRAWL_API_KEY não configurada no runner; configure o secret para coleta real.',
        testsPassed: false,
      };
    }
    return {
      ...base,
      commands,
      error: 'Firecrawl não conseguiu coletar nenhuma fonte.',
      summary: 'Falha na coleta de dados: nenhuma fonte retornou conteúdo utilizável.',
      research: buildResearchPack(
        job,
        sources,
        opts.now?.() ?? new Date(),
        policy.limits,
        instagramHandles,
        instagramGraphResult.findings,
        apifyInstagramResult.findings,
        persistedSecrets,
      ),
      testsPassed: false,
    };
  }

  return {
    ...base,
    status: 'succeeded',
    commands,
    summary: buildSuccessSummary(
      firecrawlSuccesses.length,
      sources.length,
      graphSuccesses.length,
      apifySuccesses.length,
      !!opts.apiKey,
    ),
    research: buildResearchPack(
      job,
      sources,
      opts.now?.() ?? new Date(),
      policy.limits,
      instagramHandles,
      instagramGraphResult.findings,
      apifyInstagramResult.findings,
      persistedSecrets,
    ),
  };
}

async function scrapeFirecrawl(args: {
  id: string;
  url: string;
  apiKey: string;
  baseUrl: string;
  timeoutMs: number;
  fetchImpl: FetchImpl;
}): Promise<Omit<ResearchSource, 'durationMs'>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), args.timeoutMs);
  try {
    const response = await args.fetchImpl(`${args.baseUrl.replace(/\/+$/g, '')}/v2/scrape`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${args.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        url: args.url,
        formats: ['markdown', 'summary'],
        onlyMainContent: true,
        timeout: args.timeoutMs,
      }),
      signal: controller.signal,
    });
    const body = await response.json().catch(() => ({}));
    const parsed = firecrawlResponseSchema.safeParse(body);
    if (!response.ok) {
      const message = parsed.success ? parsed.data.error : undefined;
      throw new Error(message ?? `Firecrawl HTTP ${response.status}`);
    }
    if (!parsed.success) {
      throw new Error('Resposta inválida do Firecrawl.');
    }
    const payload = parsed.data;
    if (payload.success === false || !payload.data) {
      throw new Error(
        payload.error ?? payload.data?.metadata?.error ?? 'Firecrawl retornou success=false.',
      );
    }
    const metadata = payload.data.metadata;
    const title = metadata?.title ?? metadata?.description ?? metadata?.sourceURL ?? args.url;
    return {
      id: args.id,
      url: metadata?.sourceURL ?? metadata?.url ?? args.url,
      title,
      statusCode: metadata?.statusCode,
      contentType: metadata?.contentType,
      summary: payload.data.summary,
      markdown: payload.data.markdown,
      warning: payload.data.warning,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function buildResearchPack(
  job: Job,
  sources: ResearchSource[],
  generatedAt: Date,
  limits: ScrapingLimits,
  instagramHandles: string[] = [],
  instagramGraphFindings: InstagramGraphFinding[] = [],
  apifyInstagramFindings: ApifyInstagramFinding[] = [],
  persistedSecrets: string[] = [],
): string {
  const lines = [
    `# Research Pack - ${job.issueIdentifier}`,
    '',
    `Generated at: ${generatedAt.toISOString()}`,
    '',
    '## Objective',
    '',
    job.title,
    '',
    '## Scope',
    '',
    job.description.trim() || 'Sem descrição adicional.',
    '',
    ...formatLandingPageBrief({
      job,
      sources,
      instagramHandles,
      graphFindings: instagramGraphFindings,
      apifyFindings: apifyInstagramFindings,
    }),
    '',
    '## Sources',
    '',
  ];

  for (const source of sources) {
    lines.push(`### ${source.id} - ${source.title}`, '');
    lines.push(`- URL: ${source.url}`);
    lines.push('- Method: firecrawl.scrape');
    if (source.statusCode) lines.push(`- Status: ${source.statusCode}`);
    if (source.contentType) lines.push(`- Content-Type: ${source.contentType}`);
    if (source.error) lines.push(`- Error: ${source.error}`);
    if (source.warning) lines.push(`- Warning: ${source.warning}`);
    lines.push('');
    if (source.summary) {
      lines.push('#### Summary', '', truncate(source.summary, MAX_SUMMARY_CHARS), '');
    }
    if (source.markdown) {
      lines.push('#### Extract', '', truncate(source.markdown, MAX_EXTRACT_CHARS), '');
    }
  }

  const instagramSources = sources.filter((source) =>
    source.url.toLowerCase().includes('instagram.com/'),
  );
  if (instagramHandles.length > 0 || instagramSources.length > 0) {
    lines.push(...formatInstagramGraphFindings(instagramGraphFindings));
    lines.push(...formatApifyInstagramFindings(apifyInstagramFindings));
    lines.push('## Instagram Findings', '');
    if (instagramHandles.length > 0) {
      lines.push('### Sources', '');
      for (const handle of instagramHandles) {
        lines.push(
          `- @${handle}: ${instagramProfileUrl(handle)} — public profile URL inferred from handle; collection is limited to content visible sem login, sem Graph API autorizada.`,
        );
      }
      lines.push('');
    }
    lines.push('### Visible facts', '');
    if (instagramSources.length === 0) {
      lines.push('- Nenhum conteúdo público do Instagram foi coletado com sucesso.', '');
    } else {
      for (const source of instagramSources) {
        lines.push(
          `- ${source.id}: ${source.title}${source.summary ? ` — ${truncate(source.summary, 300)}` : ''}`,
        );
      }
      lines.push('');
    }
    lines.push('### Limitations', '');
    lines.push(
      '- Instagram é tratado como fonte pública ou autorizada: não tenta bypass de login, captcha, rate limits, device checks ou permissões da Graph API.',
    );
    lines.push(
      '- Métricas privadas, insights, comentários completos, DMs, dados demográficos e analytics exigem export fornecido pelo usuário ou Instagram Graph API autorizada.',
      '',
    );
  }

  const failed = sources.filter((source) => source.error);
  lines.push('## Limitations', '');
  lines.push(
    `- Policy: explicit URLs only; max ${limits.maxPages} page(s), timeout ${limits.timeoutMs}ms, output cap ${limits.maxOutputChars} chars, rate ${limits.rateLimitPerMinute}/min.`,
  );
  if (failed.length === 0) {
    lines.push(
      '- Coleta limitada a URLs explícitas da issue/plano; não executa crawl amplo nesta fase.',
    );
  } else {
    lines.push(`- ${failed.length} fonte(s) falharam e precisam de revisão manual.`);
  }
  return sanitizeStoredText(lines.join('\n').trim(), persistedSecrets);
}

function formatLandingPageBrief(args: {
  job: Job;
  sources: ResearchSource[];
  instagramHandles: string[];
  graphFindings: InstagramGraphFinding[];
  apifyFindings: ApifyInstagramFinding[];
}): string[] {
  const successfulSources = args.sources.filter((source) => !source.error);
  const failedSources = args.sources.filter((source) => source.error);
  const subject = landingSubject(args);
  const evidence = landingEvidence(args).slice(0, 6);
  const seoTerms = landingSeoTerms(args);
  const primaryUrls = args.sources.map((source) => source.url).slice(0, 5);
  const hasInstagram = args.instagramHandles.length > 0;

  return [
    '## Landing Page Brief',
    '',
    '### Brand / Subject',
    '',
    `- Primary subject: ${subject}`,
    `- Request: ${args.job.title}`,
    `- Public handles: ${args.instagramHandles.length > 0 ? args.instagramHandles.map((handle) => `@${handle}`).join(', ') : 'none detected'}`,
    '',
    '### Audience Hypotheses',
    '',
    '- Treat the audience as prospects arriving from public web/social context; validate specifics against the evidence below.',
    hasInstagram
      ? '- Instagram presence suggests the page should connect social proof, visual identity, and direct contact paths.'
      : '- No Instagram handle was detected; use collected web sources as the main audience signal.',
    '',
    '### Offer And Conversion Angle',
    '',
    '- Lead with the clearest service/product promise supported by the collected sources.',
    '- Convert public facts into concise benefits; avoid claims that are not backed by the research pack.',
    '',
    '### Evidence To Reuse',
    '',
    ...bulletList(evidence, '- No reusable evidence was collected; keep claims conservative.'),
    '',
    '### Recommended Page Structure',
    '',
    '- Hero: subject, concrete value proposition, primary CTA, and visual drawn from public brand/profile cues.',
    '- Proof section: reuse follower/media/source facts only when present in the evidence.',
    '- Services/products section: describe observed offerings and avoid inventing prices or guarantees.',
    '- Objection handling: address gaps and limitations transparently when evidence is incomplete.',
    '- Final CTA: repeat the safest public contact or next-step route found in the sources.',
    '',
    '### SEO And Content Terms',
    '',
    ...bulletList(
      seoTerms,
      '- No stable SEO terms were extracted; derive terms manually from approved source copy.',
    ),
    '',
    '### Visual Direction',
    '',
    hasInstagram
      ? '- Use Instagram/profile cues as visual references, but do not copy private or hidden content.'
      : '- Use visible website/source cues for typography, imagery, color, and hierarchy.',
    '- Prefer real product/service/context imagery when available; otherwise request/generate a compliant hero asset.',
    '',
    '### Calls To Action',
    '',
    '- Primary CTA: choose the safest explicit action from the sources, such as contact, quote, booking, or profile visit.',
    '- Secondary CTA: invite users to view public proof, portfolio, services, or social profile when supported.',
    '',
    '### Risks / Gaps',
    '',
    `- Successful Firecrawl sources: ${successfulSources.length}; failed sources: ${failedSources.length}.`,
    hasInstagram
      ? '- Instagram public/authorized collection can miss hidden posts, private metrics, comments, DMs, and analytics.'
      : '- No social profile handle was available in the request.',
    '- Do not invent testimonials, prices, WhatsApp numbers, addresses, guarantees, or private analytics.',
    '',
    '### Source Handling',
    '',
    ...bulletList(
      primaryUrls.map((url) => `Use as source evidence: ${url}`),
      '- No explicit source URLs were available after policy filtering.',
    ),
  ];
}

function landingSubject(args: {
  job: Job;
  sources: ResearchSource[];
  instagramHandles: string[];
  graphFindings: InstagramGraphFinding[];
  apifyFindings: ApifyInstagramFinding[];
}): string {
  const apifyProfile = args.apifyFindings.find(
    (finding) => finding.status === 'succeeded',
  )?.profile;
  if (apifyProfile?.fullName) return `${apifyProfile.fullName} (@${apifyProfile.username})`;
  const graphProfile = args.graphFindings.find(
    (finding) => finding.status === 'succeeded',
  )?.profile;
  if (graphProfile?.name) return `${graphProfile.name} (@${graphProfile.username})`;
  const successfulSource = args.sources.find((source) => !source.error && source.title.trim());
  if (successfulSource) return successfulSource.title;
  if (args.instagramHandles[0]) return `@${args.instagramHandles[0]}`;
  return args.job.title;
}

function landingEvidence(args: {
  sources: ResearchSource[];
  graphFindings: InstagramGraphFinding[];
  apifyFindings: ApifyInstagramFinding[];
}): string[] {
  const evidence: string[] = [];
  for (const finding of args.apifyFindings) {
    if (finding.status !== 'succeeded') continue;
    const profile = finding.profile;
    if (!profile) continue;
    if (profile.fullName) evidence.push(`@${finding.handle} public name: ${profile.fullName}`);
    if (profile.biography)
      evidence.push(`@${finding.handle} bio: ${truncate(profile.biography, 220)}`);
    if (profile.followersCount !== undefined)
      evidence.push(`@${finding.handle} public followers: ${profile.followersCount}`);
    if (profile.postsCount !== undefined)
      evidence.push(`@${finding.handle} public posts/media count: ${profile.postsCount}`);
  }
  for (const finding of args.graphFindings) {
    if (finding.status !== 'succeeded') continue;
    const profile = finding.profile;
    if (profile.name) evidence.push(`@${finding.handle} Graph name: ${profile.name}`);
    if (profile.followersCount !== undefined)
      evidence.push(`@${finding.handle} Graph public followers: ${profile.followersCount}`);
    if (profile.mediaCount !== undefined)
      evidence.push(`@${finding.handle} Graph media count: ${profile.mediaCount}`);
  }
  for (const source of args.sources) {
    if (source.error) continue;
    if (source.summary) {
      evidence.push(`${source.id} summary: ${truncate(source.summary, 260)}`);
    } else {
      evidence.push(`${source.id} collected: ${source.title}`);
    }
  }
  return [...new Set(evidence)];
}

function landingSeoTerms(args: {
  job: Job;
  sources: ResearchSource[];
  instagramHandles: string[];
}): string[] {
  const text = [
    args.job.title,
    args.job.description,
    ...args.instagramHandles,
    ...args.sources.flatMap((source) => [source.title, source.summary ?? '']),
  ].join(' ');
  const terms = text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .match(/[a-z0-9][a-z0-9-]{3,}/g);
  if (!terms) return [];
  const blocked = new Set([
    'https',
    'www',
    'instagram',
    'com',
    'para',
    'page',
    'landing',
    'publico',
    'publica',
    'buscar',
    'dados',
  ]);
  return [...new Set(terms.filter((term) => !blocked.has(term)))]
    .slice(0, 10)
    .map((term) => `Term: ${term}`);
}

function bulletList(items: string[], fallback: string): string[] {
  return items.length > 0 ? items.map((item) => `- ${item}`) : [fallback];
}

function truncate(text: string, maxChars: number): string {
  const clean = text.trim();
  if (clean.length <= maxChars) return clean;
  return `${clean.slice(0, maxChars - 20).trim()}\n\n[truncated]`;
}

function configuredSecrets(opts: FirecrawlResearchOptions): string[] {
  return [opts.apiKey, opts.instagramGraph?.accessToken, opts.apifyInstagram?.token].filter(
    (value): value is string => Boolean(value),
  );
}

function sanitizeStoredText(value: string, exactSecrets: string[]): string {
  return redactSensitiveText(value, exactSecrets);
}

function sanitizeResearchSource(source: ResearchSource, exactSecrets: string[]): ResearchSource {
  return {
    ...source,
    id: sanitizeStoredText(source.id, exactSecrets),
    url: sanitizeStoredText(source.url, exactSecrets),
    title: sanitizeStoredText(source.title, exactSecrets),
    statusCode: source.statusCode,
    contentType: source.contentType
      ? sanitizeStoredText(source.contentType, exactSecrets)
      : undefined,
    summary: source.summary ? sanitizeStoredText(source.summary, exactSecrets) : undefined,
    markdown: source.markdown ? sanitizeStoredText(source.markdown, exactSecrets) : undefined,
    warning: source.warning ? sanitizeStoredText(source.warning, exactSecrets) : undefined,
    error: source.error ? sanitizeStoredText(source.error, exactSecrets) : undefined,
    durationMs: source.durationMs,
  };
}

function buildSuccessSummary(
  firecrawlSuccessCount: number,
  firecrawlSourceCount: number,
  graphSuccessCount: number,
  apifySuccessCount: number,
  firecrawlWasConfigured: boolean,
): string {
  const enrichments = [
    graphSuccessCount > 0 ? `${graphSuccessCount} perfil(is) do Instagram Graph API` : '',
    apifySuccessCount > 0 ? `${apifySuccessCount} perfil(is) via Apify Instagram` : '',
  ].filter(Boolean);
  if (firecrawlSuccessCount > 0 && enrichments.length > 0) {
    return `Research pack gerado com ${firecrawlSuccessCount}/${firecrawlSourceCount} fonte(s) Firecrawl e ${enrichments.join(' e ')}.`;
  }
  if (enrichments.length > 0) {
    return firecrawlWasConfigured
      ? `Research pack gerado com ${enrichments.join(' e ')}; fontes Firecrawl exigem revisão manual.`
      : `Research pack gerado com ${enrichments.join(' e ')}; Firecrawl não executado porque FIRECRAWL_API_KEY está ausente.`;
  }
  return `Research pack gerado com ${firecrawlSuccessCount}/${firecrawlSourceCount} fonte(s) coletada(s).`;
}
