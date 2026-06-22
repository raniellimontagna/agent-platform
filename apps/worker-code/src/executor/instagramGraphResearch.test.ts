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

  it('records Meta API errors as redacted limitations instead of throwing', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            error: {
              message: 'Invalid OAuth access token: abc123',
              code: 190,
            },
          }),
          { status: 400 },
        ),
    ) as typeof fetch;

    const result = await runInstagramGraphResearch(['cameraecarburador'], {
      accessToken: 'abc123',
      igUserId: '17841400000000000',
      baseUrl: 'https://graph.facebook.com',
      apiVersion: 'v20.0',
      timeoutMs: 10_000,
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
      command: 'instagram graph business_discovery @cameraecarburador',
      exitCode: 1,
    });
    expect(result.commands[0]?.stderr).toContain('[redacted]');
    expect(JSON.stringify(result)).not.toContain('abc123');
  });

  it('adds an audit command when Business Discovery is skipped for missing config', async () => {
    const result = await runInstagramGraphResearch(['cameraecarburador'], {
      baseUrl: 'https://graph.facebook.com',
      apiVersion: 'v20.0',
      timeoutMs: 10_000,
    });

    expect(result.findings).toEqual([
      expect.objectContaining({
        handle: 'cameraecarburador',
        status: 'skipped',
      }),
    ]);
    expect(result.commands).toEqual([
      expect.objectContaining({
        command: 'instagram graph business_discovery skipped',
        exitCode: 0,
      }),
    ]);
  });
});
