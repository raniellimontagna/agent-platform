import { describe, expect, it, vi } from 'vitest';
import type { Job } from '../types.js';
import {
  extractInstagramHandles,
  extractResearchUrls,
  runFirecrawlResearchJob,
} from './firecrawlResearch.js';

const baseJob: Job = {
  runId: '12345678-1234-1234-1234-123456789abc',
  issueIdentifier: 'MAC-94',
  repoUrl: 'git@example.com:repo.git',
  baseBranch: 'main',
  branch: 'agent/mac-94-research',
  commands: [],
  title: 'Coletar dados',
  description: 'Use https://example.com/docs.',
  plan: '',
  lessons: '',
  reviewFeedback: '',
  agentKey: 'data-collector-agent',
  agentCapabilities: ['research'],
};

describe('extractResearchUrls', () => {
  it('deduplica URLs e remove pontuação final', () => {
    expect(
      extractResearchUrls(
        'Veja https://example.com/docs, e [https://example.com/docs](<https://example.com/docs>). Depois `https://x.test/a`)',
      ),
    ).toEqual(['https://example.com/docs', 'https://x.test/a']);
  });
});

describe('extractInstagramHandles', () => {
  it('extrai handles do Instagram sem capturar emails', () => {
    expect(
      extractInstagramHandles('Pesquise @cameraecarburador e contato teste@example.com'),
    ).toEqual(['cameraecarburador']);
  });
});

describe('runFirecrawlResearchJob', () => {
  it('gera research pack com resposta do Firecrawl', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            success: true,
            data: {
              summary: 'Resumo da fonte.',
              markdown: '# Conteúdo\n\nDetalhe importante.',
              metadata: {
                title: 'Docs',
                sourceURL: 'https://example.com/docs',
                statusCode: 200,
                contentType: 'text/html',
              },
            },
          }),
          { status: 200 },
        ),
    ) as typeof fetch;

    const result = await runFirecrawlResearchJob(baseJob, {
      apiKey: 'fc-test',
      baseUrl: 'https://api.firecrawl.dev',
      timeoutMs: 10_000,
      fetchImpl,
      now: () => new Date('2026-06-18T00:00:00.000Z'),
    });

    expect(result.status).toBe('succeeded');
    expect(result.pushed).toBe(false);
    expect(result.research).toContain('# Research Pack - MAC-94');
    expect(result.research).toContain('Resumo da fonte.');
    expect(result.commands[0]).toEqual(
      expect.objectContaining({
        command: 'firecrawl scrape https://example.com/docs',
        exitCode: 0,
      }),
    );
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.firecrawl.dev/v2/scrape',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ authorization: 'Bearer fc-test' }),
      }),
    );
  });

  it('transforma handle do Instagram em fonte pública com limitações explícitas', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            success: true,
            data: {
              summary: 'Perfil público com oficina, carros antigos e conteúdo de carburadores.',
              markdown: 'Bio visível: Camera e Carburador.',
              metadata: {
                title: '@cameraecarburador',
                sourceURL: 'https://www.instagram.com/cameraecarburador/',
                statusCode: 200,
                contentType: 'text/html',
              },
            },
          }),
          { status: 200 },
        ),
    ) as typeof fetch;

    const result = await runFirecrawlResearchJob(
      {
        ...baseJob,
        description: 'Buscar dados públicos do perfil @cameraecarburador para landing page.',
      },
      {
        apiKey: 'fc-test',
        baseUrl: 'https://api.firecrawl.dev',
        timeoutMs: 10_000,
        fetchImpl,
        now: () => new Date('2026-06-18T00:00:00.000Z'),
      },
    );

    expect(result.status).toBe('succeeded');
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.firecrawl.dev/v2/scrape',
      expect.objectContaining({
        body: expect.stringContaining('https://www.instagram.com/cameraecarburador/'),
      }),
    );
    expect(result.research).toContain('## Instagram Findings');
    expect(result.research).toContain('@cameraecarburador');
    expect(result.research).toContain('public profile URL inferred from handle');
    expect(result.research).toContain('sem login, sem Graph API autorizada');
    expect(result.research).toContain('não tenta bypass');
  });

  it('falha sem FIRECRAWL_API_KEY', async () => {
    const result = await runFirecrawlResearchJob(baseJob, {
      baseUrl: 'https://api.firecrawl.dev',
      timeoutMs: 10_000,
    });

    expect(result.status).toBe('failed');
    expect(result.error).toContain('FIRECRAWL_API_KEY');
    expect(result.commands).toEqual([]);
  });

  it('bloqueia URL interna antes de chamar Firecrawl', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 })) as typeof fetch;

    const result = await runFirecrawlResearchJob(
      {
        ...baseJob,
        description: 'Colete http://169.254.169.254/latest/meta-data.',
      },
      {
        apiKey: 'fc-test',
        baseUrl: 'https://api.firecrawl.dev',
        timeoutMs: 10_000,
        fetchImpl,
      },
    );

    expect(result.status).toBe('failed');
    expect(result.error).toContain('metadata');
    expect(result.commands).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('clampa timeout e número de páginas ao contrato de scraping', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            success: true,
            data: {
              summary: 'Resumo.',
              metadata: { title: 'Docs', sourceURL: 'https://example.com/docs' },
            },
          }),
          { status: 200 },
        ),
    ) as typeof fetch;

    const result = await runFirecrawlResearchJob(
      {
        ...baseJob,
        description:
          'Use https://example.com/1 https://example.com/2 https://example.com/3 https://example.com/4 https://example.com/5 https://example.com/6',
      },
      {
        apiKey: 'fc-test',
        baseUrl: 'https://api.firecrawl.dev',
        timeoutMs: 999_999,
        maxPages: 3,
        maxOutputChars: 2_000,
        rateLimitPerMinute: 4,
        fetchImpl,
      },
    );

    expect(result.status).toBe('succeeded');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body))).toEqual(
      expect.objectContaining({ timeout: 60_000 }),
    );
  });

  it('falha quando nenhuma fonte retorna conteúdo', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ success: false, error: 'blocked' }), { status: 200 }),
    ) as typeof fetch;

    const result = await runFirecrawlResearchJob(baseJob, {
      apiKey: 'fc-test',
      baseUrl: 'https://api.firecrawl.dev',
      timeoutMs: 10_000,
      fetchImpl,
    });

    expect(result.status).toBe('failed');
    expect(result.research).toContain('blocked');
    expect(result.testsPassed).toBe(false);
  });
});
