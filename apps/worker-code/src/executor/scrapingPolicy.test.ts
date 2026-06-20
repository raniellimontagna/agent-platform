import { describe, expect, it } from 'vitest';
import {
  buildScrapingPolicy,
  extractExplicitUrls,
  isPlaywrightRequested,
} from './scrapingPolicy.js';

const baseLimits = {
  maxPages: 5,
  timeoutMs: 60_000,
  maxOutputChars: 20_000,
  rateLimitPerMinute: 6,
};

describe('extractExplicitUrls', () => {
  it('deduplicates explicit http URLs and trims punctuation', () => {
    expect(
      extractExplicitUrls(
        'Use https://example.com/docs, then https://example.com/docs. Screenshot https://app.test/a).',
      ),
    ).toEqual(['https://example.com/docs', 'https://app.test/a']);
  });
});

describe('buildScrapingPolicy', () => {
  it('allows only explicit public http URLs from the job text', () => {
    const policy = buildScrapingPolicy({
      title: 'Research https://example.com/docs',
      description: '',
      plan: 'Use Firecrawl only.',
      limits: baseLimits,
    });

    expect(policy.allowed).toBe(true);
    expect(policy.urls).toEqual(['https://example.com/docs']);
    expect(policy.limits).toEqual(baseLimits);
  });

  it('blocks localhost, private networks, and cloud metadata targets', () => {
    for (const url of [
      'http://localhost:3000',
      'http://127.0.0.1',
      'http://10.0.0.5',
      'http://172.16.0.1',
      'http://192.168.1.2',
      'http://169.254.169.254/latest/meta-data',
      'http://metadata.google.internal/computeMetadata/v1',
    ]) {
      const policy = buildScrapingPolicy({
        title: `Collect ${url}`,
        description: '',
        plan: '',
        limits: baseLimits,
      });

      expect(policy.allowed, url).toBe(false);
      expect(policy.reasons.join('\n')).toMatch(/internal|metadata|localhost|private/i);
    }
  });

  it('blocks credentials in URLs and bypass instructions', () => {
    const policy = buildScrapingPolicy({
      title: 'Collect https://user:pass@example.com/private',
      description: 'Bypass captcha and paywall with stealth mode.',
      plan: 'Try login bypass if needed.',
      limits: baseLimits,
    });

    expect(policy.allowed).toBe(false);
    expect(policy.reasons.join('\n')).toMatch(/credential|captcha|paywall|login|stealth/i);
  });

  it('blocks broad crawling instructions even when a URL is present', () => {
    const policy = buildScrapingPolicy({
      title: 'Crawl entire site https://example.com',
      description: 'Follow all links recursively across the domain.',
      plan: '',
      limits: baseLimits,
    });

    expect(policy.allowed).toBe(false);
    expect(policy.reasons.join('\n')).toMatch(/crawl|recursive|all links/i);
  });

  it('clamps unsafe limits to worker defaults', () => {
    const policy = buildScrapingPolicy({
      title: 'Collect https://example.com',
      description: '',
      plan: '',
      limits: {
        maxPages: 999,
        timeoutMs: 999_999,
        maxOutputChars: 999_999,
        rateLimitPerMinute: 999,
      },
      defaults: baseLimits,
    });

    expect(policy.allowed).toBe(true);
    expect(policy.limits).toEqual(baseLimits);
  });
});

describe('isPlaywrightRequested', () => {
  it('detects explicit dynamic browser or screenshot requests', () => {
    expect(isPlaywrightRequested('Capture a screenshot of https://example.com')).toBe(true);
    expect(isPlaywrightRequested('Use browser rendering for dynamic content')).toBe(true);
    expect(isPlaywrightRequested('Scrape markdown from https://example.com')).toBe(false);
  });
});
