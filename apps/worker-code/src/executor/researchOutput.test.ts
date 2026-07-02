import { describe, expect, it } from 'vitest';
import {
  extractInstagramHandles,
  instagramProfileUrl,
  normalizeInstagramHandles,
} from './researchInstagram.js';
import {
  RESEARCH_HEADINGS,
  bulletList,
  formatLandingPageBrief,
  formatPolicyLimitLine,
  formatResearchPackHeader,
  formatSourceEvidence,
  redactSensitiveText,
  sanitizeStoredText,
  truncateBlock,
  truncateInline,
} from './researchOutput.js';

describe('research output helpers', () => {
  it('preserves block and inline truncation contracts', () => {
    const longBlock = `  ${'0123456789'.repeat(5)}  `;

    expect(truncateBlock('  short text  ', 40)).toBe('short text');
    expect(truncateBlock(longBlock, 30)).toBe('0123456789\n\n[truncated]');
    expect(truncateInline('a'.repeat(182), 180)).toBe(`${'a'.repeat(179)}…`);
  });

  it('preserves section headings, limitation wording, and source handling text', () => {
    expect(RESEARCH_HEADINGS.landingPageBrief).toBe('## Landing Page Brief');
    expect(RESEARCH_HEADINGS.instagramGraphFindings).toBe('## Instagram Graph API Findings');
    expect(RESEARCH_HEADINGS.apifyInstagramFindings).toBe('## Apify Instagram Findings');
    expect(RESEARCH_HEADINGS.instagramFindings).toBe('## Instagram Findings');
    expect(formatResearchPackHeader('MAC-94', new Date('2026-06-18T00:00:00.000Z'))).toEqual([
      '# Research Pack - MAC-94',
      '',
      'Generated at: 2026-06-18T00:00:00.000Z',
    ]);
    expect(
      formatPolicyLimitLine({
        maxPages: 5,
        timeoutMs: 60_000,
        maxOutputChars: 20_000,
        rateLimitPerMinute: 6,
      }),
    ).toBe(
      '- Policy: explicit URLs only; max 5 page(s), timeout 60000ms, output cap 20000 chars, rate 6/min.',
    );
    expect(formatSourceEvidence(['https://example.com/docs'])).toEqual([
      '- Use as source evidence: https://example.com/docs',
    ]);
    expect(formatSourceEvidence([])).toEqual([
      '- No explicit source URLs were available after policy filtering.',
    ]);
    expect(bulletList(['A', 'B'], '- fallback')).toEqual(['- A', '- B']);
    expect(bulletList([], '- fallback')).toEqual(['- fallback']);
  });

  it('redacts exact secrets, encoded secrets, and long token-shaped values', () => {
    const secret = 'sk_live/test-token';
    const token = 'abcdefghijklmnopqrstuvwxyz123456';
    const text = `authorization failed for ${secret}, ${encodeURIComponent(secret)}, ${token}`;

    const redacted = redactSensitiveText(text, [secret]);

    expect(redacted).not.toContain(secret);
    expect(redacted).not.toContain(encodeURIComponent(secret));
    expect(redacted).not.toContain(token);
    expect(redacted).toContain('[redacted]');
    expect(sanitizeStoredText(text, [secret])).toBe(redacted);
  });

  it('preserves landing page brief assembly and source wording', () => {
    const lines = formatLandingPageBrief({
      job: {
        title: 'Coletar dados da Camera e Carburador',
        description: 'Pesquisar o perfil publico @cameraecarburador.',
      },
      sources: [
        {
          id: 'S1',
          url: 'https://example.com/docs',
          title: 'Camera e Carburador',
          summary: 'Oficina, carros antigos e carburadores.',
          durationMs: 12,
        },
      ],
      instagramHandles: ['cameraecarburador'],
      graphFindings: [
        {
          handle: 'cameraecarburador',
          status: 'succeeded',
          profile: {
            username: 'cameraecarburador',
            name: 'Camera e Carburador',
            followersCount: 1234,
            mediaCount: 87,
          },
        },
      ],
      apifyFindings: [],
    });
    const markdown = lines.join('\n');

    expect(markdown).toContain('## Landing Page Brief');
    expect(markdown).toContain('### Brand / Subject');
    expect(markdown).toContain('- Primary subject: Camera e Carburador (@cameraecarburador)');
    expect(markdown).toContain(
      '- Instagram presence suggests the page should connect social proof, visual identity, and direct contact paths.',
    );
    expect(markdown).toContain('- @cameraecarburador Graph public followers: 1234');
    expect(markdown).toContain('- Use as source evidence: https://example.com/docs');
    expect(markdown).toContain(
      '- Do not invent testimonials, prices, WhatsApp numbers, addresses, guarantees, or private analytics.',
    );
  });
});

describe('research Instagram helpers', () => {
  it('extracts public handles without capturing emails and preserves limits', () => {
    expect(
      extractInstagramHandles(
        'Pesquise @CameraECarburador... e @segundo. contato teste@example.com @terceiro',
        2,
      ),
    ).toEqual(['cameraecarburador', 'segundo']);
  });

  it('normalizes profile URLs and provider handle lists', () => {
    expect(instagramProfileUrl('cameraecarburador')).toBe(
      'https://www.instagram.com/cameraecarburador/',
    );
    expect(normalizeInstagramHandles(['CameraECarburador', '', 'cameraecarburador'])).toEqual([
      'cameraecarburador',
    ]);
  });
});
