import { describe, expect, it, vi } from 'vitest';
import type { Job } from '../types.js';
import {
  type ControlledPlaywrightAdapter,
  runPlaywrightResearchJob,
  shouldUsePlaywrightResearch,
} from './playwrightResearch.js';

const baseJob: Job = {
  runId: '12345678-1234-1234-1234-123456789abc',
  issueIdentifier: 'AGP-9',
  repoUrl: 'git@example.com:repo.git',
  baseBranch: 'main',
  branch: 'agent/agp-9-playwright',
  commands: [],
  title: 'Capture screenshot',
  description: 'Use Playwright for https://example.com/dashboard.',
  plan: 'Collect rendered text and screenshot.',
  lessons: '',
  reviewFeedback: '',
  agentKey: 'data-collector-agent',
  agentCapabilities: ['research', 'browser'],
};

function adapter(
  render: ControlledPlaywrightAdapter['render'] = async () => ({
    title: 'Dashboard',
    finalUrl: 'https://example.com/dashboard',
    html: '<main>Rendered</main>',
    text: 'Rendered text',
    screenshotBase64: 'iVBORw0KGgo=',
  }),
): ControlledPlaywrightAdapter {
  return { render };
}

describe('shouldUsePlaywrightResearch', () => {
  it('selects Playwright only for data collector jobs with explicit browser intent', () => {
    expect(shouldUsePlaywrightResearch(baseJob)).toBe(true);
    expect(
      shouldUsePlaywrightResearch({
        ...baseJob,
        title: 'Collect docs',
        description: 'Collect https://example.com/docs with Firecrawl.',
        plan: '',
      }),
    ).toBe(false);
    expect(shouldUsePlaywrightResearch({ ...baseJob, agentKey: 'landing-page-agent' })).toBe(false);
  });
});

describe('runPlaywrightResearchJob', () => {
  it('captures rendered HTML, text, and screenshot as a research artifact', async () => {
    const render = vi.fn(adapter().render);

    const result = await runPlaywrightResearchJob(baseJob, {
      timeoutMs: 30_000,
      maxPages: 2,
      maxOutputChars: 20_000,
      rateLimitPerMinute: 6,
      adapter: adapter(render),
      now: () => new Date('2026-06-20T00:00:00.000Z'),
    });

    expect(result.status).toBe('succeeded');
    expect(result.research).toContain('Method: playwright.render');
    expect(result.research).toContain('Rendered text');
    expect(result.research).toContain('Screenshot: data:image/png;base64,iVBORw0KGgo=');
    expect(render).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://example.com/dashboard',
        timeoutMs: 30_000,
      }),
    );
  });

  it('clamps unsafe Playwright limits to the shared scraping policy', async () => {
    const render = vi.fn(adapter().render);

    const result = await runPlaywrightResearchJob(
      {
        ...baseJob,
        description:
          'Use Playwright for https://example.com/1 https://example.com/2 https://example.com/3 https://example.com/4 https://example.com/5 https://example.com/6.',
      },
      {
        timeoutMs: 999_999,
        maxPages: 999,
        maxOutputChars: 999_999,
        rateLimitPerMinute: 999,
        adapter: adapter(render),
      },
    );

    expect(result.status).toBe('succeeded');
    expect(render).toHaveBeenCalledTimes(5);
    expect(render).toHaveBeenCalledWith(
      expect.objectContaining({
        timeoutMs: 60_000,
        maxOutputChars: 20_000,
      }),
    );
    expect(result.research).toContain('max 5 page(s), timeout 60000ms');
    expect(result.research).toContain('rate 6/min');
  });

  it('blocks adapter navigation outside the authorized URL policy', async () => {
    const result = await runPlaywrightResearchJob(baseJob, {
      timeoutMs: 30_000,
      maxPages: 2,
      maxOutputChars: 20_000,
      rateLimitPerMinute: 6,
      adapter: adapter(async (args) => {
        args.guardNavigation('http://localhost:3000/admin');
        throw new Error('should not render');
      }),
    });

    expect(result.status).toBe('failed');
    expect(result.error).toContain('localhost');
    expect(result.commands[0]).toEqual(
      expect.objectContaining({
        command: 'playwright render https://example.com/dashboard',
        exitCode: 1,
      }),
    );
  });

  it('blocks downloads and sensitive form submissions', async () => {
    for (const trigger of ['download', 'form'] as const) {
      const result = await runPlaywrightResearchJob(baseJob, {
        timeoutMs: 30_000,
        maxPages: 2,
        maxOutputChars: 20_000,
        rateLimitPerMinute: 6,
        adapter: adapter(async (args) => {
          if (trigger === 'download') args.blockDownload('report.csv');
          if (trigger === 'form') args.blockFormSubmission('https://example.com/login');
          throw new Error('should not render');
        }),
      });

      expect(result.status).toBe('failed');
      expect(result.error).toMatch(/download|form/i);
    }
  });
});
