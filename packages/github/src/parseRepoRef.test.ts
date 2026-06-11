import { describe, expect, it } from 'vitest';
import { parseRepoRef } from './index.js';

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
