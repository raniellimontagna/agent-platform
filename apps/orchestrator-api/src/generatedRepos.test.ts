import { describe, expect, it, vi } from 'vitest';
import {
  ensureGeneratedRepository,
  hasRepoCreateLabel,
  resolveGeneratedRepoTarget,
  slugifyRepoName,
} from './generatedRepos.js';

const config = {
  owner: 'attodevlabs',
  allowCreate: true,
  template: 'attodevlabs/landing-page-template-astro-react',
};

describe('generated repos', () => {
  it('detecta label repo:create por nome', () => {
    expect(hasRepoCreateLabel(['ai-ready', 'repo:create'])).toBe(true);
    expect(hasRepoCreateLabel(['ai-ready'])).toBe(false);
  });

  it('normaliza nome de repo', () => {
    expect(slugifyRepoName('Landing Página / ACME')).toBe('landing-pagina-acme');
  });

  it('resolve TARGET_REPO explícito dentro da org allowlisted', () => {
    expect(
      resolveGeneratedRepoTarget({
        title: 'ACME',
        description: 'TARGET_REPO: attodevlabs/acme-site',
        createRequested: false,
        config,
      }),
    ).toMatchObject({
      fullName: 'attodevlabs/acme-site',
      create: false,
    });
  });

  it('recusa TARGET_REPO fora da org configurada', () => {
    expect(() =>
      resolveGeneratedRepoTarget({
        title: 'ACME',
        description: 'TARGET_REPO: other/acme-site',
        createRequested: false,
        config,
      }),
    ).toThrow(/attodevlabs/);
  });

  it('usa TARGET_REPO_NAME quando repo:create foi solicitado', () => {
    expect(
      resolveGeneratedRepoTarget({
        title: 'ACME',
        description: 'TARGET_REPO_NAME: lp-acme',
        createRequested: true,
        config,
      }),
    ).toMatchObject({
      fullName: 'attodevlabs/lp-acme',
      create: true,
    });
  });

  it('cria a partir do template quando permitido', async () => {
    const github = {
      createRepository: vi.fn(async () => ({
        fullName: 'attodevlabs/lp-acme',
        htmlUrl: 'https://github.com/attodevlabs/lp-acme',
        created: true,
      })),
    };
    const target = resolveGeneratedRepoTarget({
      title: 'ACME',
      description: 'TARGET_REPO_NAME: lp-acme',
      createRequested: true,
      config,
    });

    await ensureGeneratedRepository({
      github: github as never,
      target: target as never,
      description: 'Landing page',
      config,
    });

    expect(github.createRepository).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: 'attodevlabs',
        name: 'lp-acme',
        template: { owner: 'attodevlabs', repo: 'landing-page-template-astro-react' },
      }),
    );
  });
});
