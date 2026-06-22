import { z } from 'zod';
import type { CommandResult, Job, JobResult } from '../types.js';
import {
  type InstagramGraphFinding,
  type InstagramGraphResearchOptions,
  formatInstagramGraphFindings,
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
  if (!opts.apiKey) {
    return {
      ...base,
      error: 'FIRECRAWL_API_KEY não configurada no runner; configure o secret para coleta real.',
      testsPassed: false,
    };
  }

  const sources: ResearchSource[] = [];
  for (const [index, url] of policy.urls.slice(0, policy.limits.maxPages).entries()) {
    if (!url) continue;
    const started = Date.now();
    try {
      const source = await scrapeFirecrawl({
        id: `S${index + 1}`,
        url,
        apiKey: opts.apiKey,
        baseUrl: opts.baseUrl,
        timeoutMs: policy.limits.timeoutMs,
        fetchImpl: opts.fetchImpl ?? fetch,
      });
      sources.push({ ...source, durationMs: Date.now() - started });
      commands.push({
        command: `firecrawl scrape ${url}`,
        exitCode: 0,
        stdout: source.title,
        stderr: source.warning ?? '',
        durationMs: Date.now() - started,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      sources.push({
        id: `S${index + 1}`,
        url,
        title: url,
        error: message,
        durationMs: Date.now() - started,
      });
      commands.push({
        command: `firecrawl scrape ${url}`,
        exitCode: 1,
        stdout: '',
        stderr: message,
        durationMs: Date.now() - started,
      });
    }
  }

  const successes = sources.filter((source) => !source.error);
  if (successes.length === 0) {
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
      ),
      testsPassed: false,
    };
  }

  return {
    ...base,
    status: 'succeeded',
    commands,
    summary: `Research pack gerado com ${successes.length}/${sources.length} fonte(s) coletada(s).`,
    research: buildResearchPack(
      job,
      sources,
      opts.now?.() ?? new Date(),
      policy.limits,
      instagramHandles,
      instagramGraphResult.findings,
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
  return lines.join('\n').trim();
}

function truncate(text: string, maxChars: number): string {
  const clean = text.trim();
  if (clean.length <= maxChars) return clean;
  return `${clean.slice(0, maxChars - 20).trim()}\n\n[truncated]`;
}
