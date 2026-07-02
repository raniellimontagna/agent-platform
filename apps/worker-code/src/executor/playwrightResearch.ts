import type { CommandResult, Job, JobResult } from '../types.js';
import {
  RESEARCH_HEADINGS,
  formatPolicyLimitLine,
  formatResearchPackHeader,
  truncateBlock,
} from './researchOutput.js';
import {
  DEFAULT_SCRAPING_LIMITS,
  type ScrapingLimits,
  buildScrapingPolicy,
  isPlaywrightRequested,
} from './scrapingPolicy.js';

export interface ControlledRenderArgs {
  url: string;
  timeoutMs: number;
  maxOutputChars: number;
  guardNavigation: (url: string) => void;
  blockDownload: (name: string) => never;
  blockFormSubmission: (action: string) => never;
}

export interface ControlledRenderResult {
  title: string;
  finalUrl: string;
  html: string;
  text: string;
  screenshotBase64?: string;
}

export interface ControlledPlaywrightAdapter {
  render(args: ControlledRenderArgs): Promise<ControlledRenderResult>;
}

interface PlaywrightResearchOptions extends ScrapingLimits {
  adapter?: ControlledPlaywrightAdapter;
  now?: () => Date;
}

interface DynamicPlaywrightModule {
  chromium: {
    launch(args: { headless: boolean }): Promise<{
      close(): Promise<void>;
      newContext(args: {
        acceptDownloads: boolean;
        viewport: { width: number; height: number };
      }): Promise<{
        close(): Promise<void>;
        newPage(): Promise<DynamicPage>;
        route(
          pattern: string,
          handler: (route: DynamicRoute, request: DynamicRequest) => Promise<void> | void,
        ): Promise<void>;
      }>;
    }>;
  };
}

interface DynamicPage {
  addInitScript(script: string): Promise<void>;
  goto(url: string, args: { waitUntil: 'networkidle'; timeout: number }): Promise<void>;
  title(): Promise<string>;
  url(): string;
  content(): Promise<string>;
  locator(selector: string): { innerText(args: { timeout: number }): Promise<string> };
  screenshot(args: { fullPage: boolean; type: 'png'; timeout: number }): Promise<Buffer>;
}

interface DynamicRoute {
  abort(): Promise<void>;
  continue(): Promise<void>;
}

interface DynamicRequest {
  url(): string;
  isNavigationRequest(): boolean;
}

export function shouldUsePlaywrightResearch(job: Job): boolean {
  if (job.agentKey !== 'data-collector-agent') return false;
  return isPlaywrightRequested([job.title, job.description, job.plan].join('\n'));
}

export async function runPlaywrightResearchJob(
  job: Job,
  opts: PlaywrightResearchOptions,
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
  const policy = buildScrapingPolicy({
    title: job.title,
    description: job.description,
    plan: job.plan,
    limits: opts,
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

  const adapter = opts.adapter ?? (await createPlaywrightAdapter());
  const sources: Array<ControlledRenderResult & { id: string; sourceUrl: string; error?: string }> =
    [];

  for (const [index, url] of policy.urls.slice(0, policy.limits.maxPages).entries()) {
    const started = Date.now();
    try {
      const rendered = await adapter.render({
        url,
        timeoutMs: policy.limits.timeoutMs,
        maxOutputChars: policy.limits.maxOutputChars,
        guardNavigation: (target) => {
          const check = buildScrapingPolicy({
            title: target,
            description: '',
            plan: '',
            limits: policy.limits,
            defaults: policy.limits,
          });
          if (!check.allowed) {
            throw new Error(check.reasons.join('; ') || `navigation blocked: ${target}`);
          }
        },
        blockDownload: (name) => {
          throw new Error(`download blocked: ${name}`);
        },
        blockFormSubmission: (action) => {
          throw new Error(`sensitive form submission blocked: ${action}`);
        },
      });
      sources.push({ ...rendered, id: `S${index + 1}`, sourceUrl: url });
      commands.push({
        command: `playwright render ${url}`,
        exitCode: 0,
        stdout: rendered.title,
        stderr: '',
        durationMs: Date.now() - started,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      sources.push({
        id: `S${index + 1}`,
        sourceUrl: url,
        title: url,
        finalUrl: url,
        html: '',
        text: '',
        error: message,
      });
      commands.push({
        command: `playwright render ${url}`,
        exitCode: 1,
        stdout: '',
        stderr: message,
        durationMs: Date.now() - started,
      });
    }
  }

  const successes = sources.filter((source) => !source.error);
  const research = buildRenderedResearchPack(
    job,
    sources,
    opts.now?.() ?? new Date(),
    policy.limits,
  );
  if (successes.length === 0) {
    return {
      ...base,
      commands,
      error: sources.find((source) => source.error)?.error ?? 'Playwright não coletou fontes.',
      summary: 'Falha na coleta dinâmica: nenhuma fonte retornou conteúdo utilizável.',
      research,
      testsPassed: false,
    };
  }

  return {
    ...base,
    status: 'succeeded',
    commands,
    summary: `Research pack dinâmico gerado com ${successes.length}/${sources.length} fonte(s).`,
    research,
  };
}

async function createPlaywrightAdapter(): Promise<ControlledPlaywrightAdapter> {
  const importModule = new Function('specifier', 'return import(specifier)') as (
    specifier: string,
  ) => Promise<DynamicPlaywrightModule>;
  let playwright: DynamicPlaywrightModule;
  try {
    playwright = await importModule('playwright');
  } catch {
    throw new Error(
      'Playwright não está instalado no worker; instale a dependência para coleta dinâmica.',
    );
  }

  return {
    async render(args) {
      args.guardNavigation(args.url);
      const browser = await playwright.chromium.launch({ headless: true });
      const context = await browser.newContext({
        acceptDownloads: false,
        viewport: { width: 1440, height: 1200 },
      });
      try {
        await context.route('**/*', async (route, request) => {
          try {
            args.guardNavigation(request.url());
            if (request.isNavigationRequest() && request.url() !== args.url) {
              throw new Error(`navigation outside authorized URL blocked: ${request.url()}`);
            }
            await route.continue();
          } catch {
            await route.abort();
          }
        });
        const page = await context.newPage();
        await page.addInitScript(`
          window.__agentPlatformBlockedForm = null;
          document.addEventListener('submit', (event) => {
            event.preventDefault();
            window.__agentPlatformBlockedForm = event.target?.action || 'unknown';
          }, true);
        `);
        await page.goto(args.url, { waitUntil: 'networkidle', timeout: args.timeoutMs });
        const html = truncateBlock(await page.content(), args.maxOutputChars);
        const text = truncateBlock(
          await page.locator('body').innerText({ timeout: 5_000 }),
          args.maxOutputChars,
        );
        const screenshot = await page.screenshot({
          fullPage: true,
          type: 'png',
          timeout: args.timeoutMs,
        });
        return {
          title: await page.title(),
          finalUrl: page.url(),
          html,
          text,
          screenshotBase64: screenshot.toString('base64'),
        };
      } finally {
        await context.close();
        await browser.close();
      }
    },
  };
}

function buildRenderedResearchPack(
  job: Job,
  sources: Array<ControlledRenderResult & { id: string; sourceUrl: string; error?: string }>,
  generatedAt: Date,
  limits: ScrapingLimits,
): string {
  const lines = [
    ...formatResearchPackHeader(job.issueIdentifier, generatedAt),
    '',
    '## Objective',
    '',
    job.title,
    '',
    RESEARCH_HEADINGS.sources,
    '',
  ];

  for (const source of sources) {
    lines.push(`### ${source.id} - ${source.title}`, '');
    lines.push(`- URL: ${source.sourceUrl}`);
    lines.push(`- Final URL: ${source.finalUrl}`);
    lines.push('- Method: playwright.render');
    if (source.error) lines.push(`- Error: ${source.error}`);
    if (source.screenshotBase64) {
      lines.push(`- Screenshot: data:image/png;base64,${source.screenshotBase64}`);
    }
    lines.push('');
    if (source.text)
      lines.push('#### Rendered Text', '', truncateBlock(source.text, limits.maxOutputChars), '');
    if (source.html)
      lines.push('#### Rendered HTML', '', truncateBlock(source.html, limits.maxOutputChars), '');
  }

  lines.push(RESEARCH_HEADINGS.limitations, '');
  lines.push(formatPolicyLimitLine(limits));
  lines.push(
    '- Downloads, local/internal network targets, and sensitive form submissions are blocked.',
  );
  return lines.join('\n').trim();
}
