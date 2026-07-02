import { env } from '../env.js';
import type { Job, JobResult } from '../types.js';
import {
  DATA_COLLECTOR_AGENT_KEY,
  runFirecrawlResearchJob as defaultRunFirecrawlResearchJob,
} from './firecrawlResearch.js';
import {
  runPlaywrightResearchJob as defaultRunPlaywrightResearchJob,
  shouldUsePlaywrightResearch as defaultShouldUsePlaywrightResearch,
} from './playwrightResearch.js';

type FirecrawlRunner = typeof defaultRunFirecrawlResearchJob;
type PlaywrightRunner = typeof defaultRunPlaywrightResearchJob;

export interface DataCollectorDispatchDeps {
  shouldUsePlaywrightResearch?: typeof defaultShouldUsePlaywrightResearch;
  runFirecrawlResearchJob?: FirecrawlRunner;
  runPlaywrightResearchJob?: PlaywrightRunner;
}

export function isDataCollectorJob(job: Job): boolean {
  return job.agentKey === DATA_COLLECTOR_AGENT_KEY;
}

export async function runDataCollectorJob(
  job: Job,
  deps: DataCollectorDispatchDeps = {},
): Promise<JobResult> {
  const shouldUsePlaywrightResearch =
    deps.shouldUsePlaywrightResearch ?? defaultShouldUsePlaywrightResearch;
  const runPlaywrightResearchJob = deps.runPlaywrightResearchJob ?? defaultRunPlaywrightResearchJob;
  const runFirecrawlResearchJob = deps.runFirecrawlResearchJob ?? defaultRunFirecrawlResearchJob;

  if (shouldUsePlaywrightResearch(job)) {
    return runPlaywrightResearchJob(job, {
      timeoutMs: env.PLAYWRIGHT_TIMEOUT_MS,
      maxPages: env.SCRAPING_MAX_PAGES,
      maxOutputChars: env.SCRAPING_MAX_OUTPUT_CHARS,
      rateLimitPerMinute: env.SCRAPING_RATE_LIMIT_PER_MINUTE,
    });
  }

  return runFirecrawlResearchJob(job, {
    apiKey: env.FIRECRAWL_API_KEY,
    baseUrl: env.FIRECRAWL_BASE_URL,
    timeoutMs: env.FIRECRAWL_TIMEOUT_MS,
    maxPages: env.SCRAPING_MAX_PAGES,
    maxOutputChars: env.SCRAPING_MAX_OUTPUT_CHARS,
    rateLimitPerMinute: env.SCRAPING_RATE_LIMIT_PER_MINUTE,
    instagramGraph: {
      accessToken: env.INSTAGRAM_GRAPH_ACCESS_TOKEN,
      igUserId: env.INSTAGRAM_GRAPH_IG_USER_ID,
      baseUrl: env.INSTAGRAM_GRAPH_BASE_URL,
      apiVersion: env.INSTAGRAM_GRAPH_API_VERSION,
      timeoutMs: env.INSTAGRAM_GRAPH_TIMEOUT_MS,
    },
    apifyInstagram: {
      token: env.APIFY_TOKEN,
      actorId: env.APIFY_INSTAGRAM_ACTOR_ID,
      baseUrl: env.APIFY_BASE_URL,
      maxItems: env.APIFY_INSTAGRAM_MAX_ITEMS,
      timeoutMs: env.APIFY_TIMEOUT_MS,
    },
  });
}
