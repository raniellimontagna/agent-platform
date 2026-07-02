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
  runInstagramGraphResearch,
} from './instagramGraphResearch.js';
import { extractInstagramHandles, instagramProfileUrl } from './researchInstagram.js';
import {
  RESEARCH_HEADINGS,
  formatLandingPageBrief,
  formatPolicyLimitLine,
  formatResearchPackHeader,
  sanitizeStoredText,
  truncateBlock,
} from './researchOutput.js';
import {
  DEFAULT_SCRAPING_LIMITS,
  type ScrapingLimits,
  buildScrapingPolicy,
  extractExplicitUrls,
} from './scrapingPolicy.js';

export const DATA_COLLECTOR_AGENT_KEY = 'data-collector-agent';
export { extractInstagramHandles } from './researchInstagram.js';

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
    ...formatResearchPackHeader(job.issueIdentifier, generatedAt),
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
    RESEARCH_HEADINGS.sources,
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
      lines.push('#### Summary', '', truncateBlock(source.summary, MAX_SUMMARY_CHARS), '');
    }
    if (source.markdown) {
      lines.push('#### Extract', '', truncateBlock(source.markdown, MAX_EXTRACT_CHARS), '');
    }
  }

  const instagramSources = sources.filter((source) =>
    source.url.toLowerCase().includes('instagram.com/'),
  );
  if (instagramHandles.length > 0 || instagramSources.length > 0) {
    lines.push(...formatInstagramGraphFindings(instagramGraphFindings));
    lines.push(...formatApifyInstagramFindings(apifyInstagramFindings));
    lines.push(RESEARCH_HEADINGS.instagramFindings, '');
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
          `- ${source.id}: ${source.title}${source.summary ? ` — ${truncateBlock(source.summary, 300)}` : ''}`,
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
  lines.push(RESEARCH_HEADINGS.limitations, '');
  lines.push(formatPolicyLimitLine(limits));
  if (failed.length === 0) {
    lines.push(
      '- Coleta limitada a URLs explícitas da issue/plano; não executa crawl amplo nesta fase.',
    );
  } else {
    lines.push(`- ${failed.length} fonte(s) falharam e precisam de revisão manual.`);
  }
  return sanitizeStoredText(lines.join('\n').trim(), persistedSecrets);
}

function configuredSecrets(opts: FirecrawlResearchOptions): string[] {
  return [opts.apiKey, opts.instagramGraph?.accessToken, opts.apifyInstagram?.token].filter(
    (value): value is string => Boolean(value),
  );
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
