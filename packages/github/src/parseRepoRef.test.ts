import { describe, expect, it } from 'vitest';
import { parseRepoFullName, parseRepoRef } from './index.js';

describe('parseRepoRef', () => {
  it('extrai owner/repo de URL https com .git', () => {
    expect(parseRepoRef('https://github.com/owner/repo.git')).toEqual({
      owner: 'owner',
      repo: 'repo',
    });
  });

  it('extrai sem .git', () => {
    expect(parseRepoRef('https://github.com/owner/repo')).toEqual({ owner: 'owner', repo: 'repo' });
  });

  it('extrai com credencial embutida', () => {
    expect(parseRepoRef('https://x-access-token:TOKEN@github.com/me/proj.git')).toEqual({
      owner: 'me',
      repo: 'proj',
    });
  });

  it('lança em URL que não é do github', () => {
    expect(() => parseRepoRef('https://gitlab.com/owner/repo.git')).toThrow();
  });
});

describe('parseRepoFullName', () => {
  it('extrai owner/repo', () => {
    expect(parseRepoFullName('attodevlabs/lp-acme')).toEqual({
      owner: 'attodevlabs',
      repo: 'lp-acme',
    });
  });

  it('lança em formato inválido', () => {
    expect(() => parseRepoFullName('attodevlabs')).toThrow(/owner\/repo/);
  });
});
