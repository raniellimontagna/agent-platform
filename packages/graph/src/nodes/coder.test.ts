import { describe, expect, it } from 'vitest';
import { makeCoderNode, slugify } from './coder.js';

describe('slugify', () => {
  it('minúsculas e troca espaços por hífen', () => {
    expect(slugify('Add Version Endpoint')).toBe('add-version-endpoint');
  });

  it('remove acentos', () => {
    expect(slugify('Configuração de Sessão')).toBe('configuracao-de-sessao');
  });

  it('colapsa separadores e tira das pontas', () => {
    expect(slugify('  foo / bar -- baz  ')).toBe('foo-bar-baz');
  });

  it('trunca em 40 chars', () => {
    expect(slugify('a'.repeat(60)).length).toBe(40);
  });
});

describe('makeCoderNode', () => {
  it('marca o estado como failed quando a validação do runner falha', async () => {
    const comments: string[] = [];
    let dispatched: unknown;
    const coder = makeCoderNode({
      linear: { comment: async (_issueId: string, body: string) => comments.push(body) } as never,
      repoUrl: 'git@example.com:repo.git',
      baseBranch: 'main',
      testCommands: ['pnpm test'],
      dispatch: async (body) => {
        dispatched = body;
        return {
          status: 'succeeded',
          branch: 'agent/mac-86-test-12345678',
          pushed: true,
          testsPassed: false,
          commands: [
            { command: 'pnpm test', exitCode: 1, stdout: 'FAIL workerDryRun', stderr: '' },
          ],
          fixAttempts: 3,
        };
      },
    });

    const result = await coder({
      runId: '12345678-1234-1234-1234-123456789abc',
      issueId: 'issue-1',
      issueIdentifier: 'MAC-86',
      title: 'Eval Harness v2',
      description: '',
      plan: 'Plano',
      agentKey: 'landing-page-agent',
      agentCapabilities: ['landing-page', 'frontend'],
    } as never);

    expect(result.status).toBe('failed');
    expect(result.testsPassed).toBe(false);
    expect(dispatched).toEqual(
      expect.objectContaining({
        agentKey: 'landing-page-agent',
        agentCapabilities: ['landing-page', 'frontend'],
      }),
    );
    expect(comments[0]).toContain('**Validação:** ❌ falhou');
  });

  it('encerra data collector como completed sem seguir para PR', async () => {
    const comments: string[] = [];
    const coder = makeCoderNode({
      linear: { comment: async (_issueId: string, body: string) => comments.push(body) } as never,
      repoUrl: 'git@example.com:repo.git',
      baseBranch: 'main',
      testCommands: [],
      dispatch: async () => ({
        status: 'succeeded',
        branch: 'agent/mac-94-research',
        pushed: false,
        testsPassed: true,
        commands: [
          {
            command: 'firecrawl scrape https://example.com',
            exitCode: 0,
            stdout: 'ok',
            stderr: '',
          },
        ],
        summary: 'Research pack gerado.',
        research: '# Research Pack',
      }),
    });

    const result = await coder({
      runId: '12345678-1234-1234-1234-123456789abc',
      issueId: 'issue-1',
      issueIdentifier: 'MAC-94',
      title: 'Coleta',
      description: 'https://example.com',
      plan: 'Plano',
      agentKey: 'data-collector-agent',
      agentCapabilities: ['research'],
    } as never);

    expect(result.status).toBe('completed');
    expect(result.pushed).toBe(false);
    expect(result.research).toBe('# Research Pack');
    expect(comments[0]).toContain('## 🔎 Coleta de dados');
  });

  it('usa repo alvo dinâmico quando targetRepo está no estado', async () => {
    let dispatched: { repoUrl?: string } | undefined;
    const coder = makeCoderNode({
      linear: { comment: async () => {} } as never,
      repoUrl: 'https://github.com/default/repo.git',
      resolveRepoUrl: (targetRepo) =>
        targetRepo ? `https://token@github.com/${targetRepo}.git` : 'default',
      baseBranch: 'main',
      testCommands: [],
      dispatch: async (body) => {
        dispatched = body;
        return {
          status: 'succeeded',
          branch: body.branch,
          pushed: true,
          testsPassed: true,
        };
      },
    });

    await coder({
      runId: '12345678-1234-1234-1234-123456789abc',
      issueId: 'issue-1',
      issueIdentifier: 'MAC-99',
      title: 'Landing',
      description: '',
      plan: 'Plano',
      targetRepo: 'attodevlabs/lp-acme',
    } as never);

    expect(dispatched?.repoUrl).toBe('https://token@github.com/attodevlabs/lp-acme.git');
  });
});
