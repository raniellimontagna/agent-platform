import { describe, expect, it, vi } from 'vitest';
import {
  makeCloudflareDeployNode,
  parseCloudflareDeployUrl,
  wranglerNameCommand,
} from './cloudflareDeploy.js';

function deps() {
  return {
    linear: { comment: vi.fn(async () => {}) },
    dispatch: vi.fn(async () => ({
      status: 'succeeded' as const,
      branch: 'main',
      commands: [
        {
          command: 'pnpm deploy:cloudflare',
          exitCode: 0,
          stdout: 'Uploaded\nhttps://acme.workers.dev',
          stderr: '',
        },
      ],
    })),
    repoUrl: 'https://github.com/default/repo.git',
    resolveRepoUrl: vi.fn(() => 'https://github.com/attodevlabs/acme.git'),
    baseBranch: 'main',
    enabled: true,
    generatedReposOwner: 'attodevlabs',
    deployCommands: ['pnpm install --frozen-lockfile', 'pnpm deploy:cloudflare'],
  };
}

const state = {
  runId: 'run-id',
  issueIdentifier: 'MAC-106',
  issueId: 'issue-id',
  title: 'Landing Acme',
  description: 'desc',
  autoMerged: true,
  targetRepo: 'attodevlabs/acme',
};

describe('parseCloudflareDeployUrl', () => {
  it('extrai URL workers.dev da saída do Wrangler', () => {
    expect(parseCloudflareDeployUrl('Published https://acme.workers.dev')).toBe(
      'https://acme.workers.dev',
    );
  });
});

describe('wranglerNameCommand', () => {
  it('gera comando node para trocar o nome do Worker', () => {
    expect(wranglerNameCommand('lp-acme')).toContain('wrangler.jsonc');
    expect(wranglerNameCommand('lp-acme')).toContain("'lp-acme'");
  });
});

describe('makeCloudflareDeployNode', () => {
  it('não faz deploy quando desabilitado ou sem auto-merge', async () => {
    const d = deps();
    await makeCloudflareDeployNode({ ...d, enabled: false } as never)(state as never);
    await makeCloudflareDeployNode(d as never)({ ...state, autoMerged: false } as never);
    expect(d.dispatch).not.toHaveBeenCalled();
  });

  it('despacha deploy na main do repo gerado e comenta a URL', async () => {
    const d = deps();
    const out = await makeCloudflareDeployNode(d as never)(state as never);

    expect(d.dispatch).toHaveBeenCalledWith({
      runId: 'run-id',
      issueIdentifier: 'MAC-106',
      repoUrl: 'https://github.com/attodevlabs/acme.git',
      baseBranch: 'main',
      branch: 'main',
      title: 'Landing Acme',
      description: 'desc',
      plan: '',
      commands: [
        wranglerNameCommand('acme'),
        'pnpm install --frozen-lockfile',
        'pnpm deploy:cloudflare',
      ],
      lessons: '',
      reviewFeedback: '',
      checkoutOnly: true,
    });
    expect(d.linear.comment).toHaveBeenCalledWith(
      'issue-id',
      expect.stringContaining('https://acme.workers.dev'),
    );
    expect(out).toEqual({ cloudflareDeployUrl: 'https://acme.workers.dev' });
  });

  it('falha de deploy é non-fatal e fica comentada no Linear', async () => {
    const d = deps();
    d.dispatch = vi.fn(async () => ({
      status: 'failed' as const,
      branch: 'main',
      error: 'wrangler auth failed',
      commands: [],
    }));

    const out = await makeCloudflareDeployNode(d as never)(state as never);

    expect(d.linear.comment).toHaveBeenCalledWith(
      'issue-id',
      expect.stringContaining('wrangler auth failed'),
    );
    expect(out).toEqual({});
  });
});
