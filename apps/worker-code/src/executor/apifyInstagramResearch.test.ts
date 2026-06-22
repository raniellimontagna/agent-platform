import { describe, expect, it, vi } from 'vitest';
import {
  formatApifyInstagramFindings,
  runApifyInstagramResearch,
} from './apifyInstagramResearch.js';

const baseOptions = {
  token: 'apify-secret-token',
  actorId: 'shu8hvrXbJbY3Eb9W',
  baseUrl: 'https://api.apify.com',
  maxItems: 3,
  timeoutMs: 10_000,
};

describe('runApifyInstagramResearch', () => {
  it('records a skip limitation when APIFY_TOKEN is not configured', async () => {
    const result = await runApifyInstagramResearch(['cameraecarburador'], {
      ...baseOptions,
      token: undefined,
    });

    expect(result.commands).toEqual([
      expect.objectContaining({
        command: 'apify instagram skipped',
        exitCode: 0,
      }),
    ]);
    expect(result.findings).toEqual([
      expect.objectContaining({
        handle: 'cameraecarburador',
        status: 'skipped',
        limitation: expect.stringContaining('APIFY_TOKEN'),
      }),
    ]);
  });

  it('normalizes Apify dataset items and never stores the token', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify([
            {
              username: 'cameraecarburador',
              fullName: 'Camera e Carburador',
              biography: 'Oficina e carros antigos.',
              followersCount: 2345,
              postsCount: 120,
              verified: false,
              url: 'https://www.instagram.com/cameraecarburador/',
            },
            {
              ownerUsername: 'cameraecarburador',
              shortCode: 'ABC123',
              url: 'https://www.instagram.com/p/ABC123/',
              caption: 'Carburador revisado.',
              timestamp: '2026-06-20T12:00:00.000Z',
              likesCount: 55,
              commentsCount: 4,
            },
          ]),
          { status: 200 },
        ),
    ) as typeof fetch;

    const result = await runApifyInstagramResearch(['cameraecarburador'], {
      ...baseOptions,
      fetchImpl,
    });

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({
      handle: 'cameraecarburador',
      status: 'succeeded',
      profile: {
        username: 'cameraecarburador',
        fullName: 'Camera e Carburador',
        followersCount: 2345,
        postsCount: 120,
      },
      media: [
        expect.objectContaining({
          url: 'https://www.instagram.com/p/ABC123/',
          likesCount: 55,
        }),
      ],
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.apify.com/v2/acts/shu8hvrXbJbY3Eb9W/run-sync-get-dataset-items?token=apify-secret-token',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('https://www.instagram.com/cameraecarburador/'),
      }),
    );
    expect(JSON.stringify(result)).not.toContain('apify-secret-token');
  });

  it('turns Apify API errors into redacted limitations', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { message: 'bad token apify-secret-token' } }), {
          status: 401,
        }),
    ) as typeof fetch;

    const result = await runApifyInstagramResearch(['cameraecarburador'], {
      ...baseOptions,
      fetchImpl,
    });

    expect(result.findings).toEqual([
      expect.objectContaining({
        handle: 'cameraecarburador',
        status: 'failed',
        limitation: expect.stringContaining('[redacted]'),
      }),
    ]);
    expect(result.commands[0]).toMatchObject({
      command: 'apify instagram actor @cameraecarburador',
      exitCode: 1,
      stderr: expect.stringContaining('[redacted]'),
    });
    expect(JSON.stringify(result)).not.toContain('apify-secret-token');
  });
});

describe('formatApifyInstagramFindings', () => {
  it('formats profile, media, and provider limitations', () => {
    const lines = formatApifyInstagramFindings([
      {
        handle: 'cameraecarburador',
        status: 'succeeded',
        actorId: 'shu8hvrXbJbY3Eb9W',
        profile: {
          username: 'cameraecarburador',
          fullName: 'Camera e Carburador',
          biography: 'Oficina e carros antigos.',
          followersCount: 2345,
          postsCount: 120,
          verified: false,
          url: 'https://www.instagram.com/cameraecarburador/',
        },
        media: [
          {
            id: 'ABC123',
            url: 'https://www.instagram.com/p/ABC123/',
            caption: 'Carburador revisado.',
            timestamp: '2026-06-20T12:00:00.000Z',
            likesCount: 55,
            commentsCount: 4,
          },
        ],
      },
    ]);

    expect(lines.join('\n')).toContain('## Apify Instagram Findings');
    expect(lines.join('\n')).toContain('@cameraecarburador followers: 2345');
    expect(lines.join('\n')).toContain('AP1-M1');
    expect(lines.join('\n')).toContain('No login bypass');
  });
});
