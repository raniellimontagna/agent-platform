import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGithubGateway } from './index.js';

const gw = () => createGithubGateway('tkn', { owner: 'o', repo: 'r' });

afterEach(() => vi.unstubAllGlobals());

function stubFetch(status: number, body = '') {
  const f = vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  }));
  vi.stubGlobal('fetch', f);
  return f;
}

describe('mergePullRequest', () => {
  it('PUT /pulls/:n/merge com merge_method squash', async () => {
    const f = stubFetch(200, '{}');
    await gw().mergePullRequest({ number: 12 });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('https://api.github.com/repos/o/r/pulls/12/merge');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body)).toEqual({ merge_method: 'squash' });
  });
  it('lança em status não-ok', async () => {
    stubFetch(405, 'not mergeable');
    await expect(gw().mergePullRequest({ number: 1 })).rejects.toThrow(/405/);
  });
});

describe('deleteBranch', () => {
  it('DELETE /git/refs/heads/:branch', async () => {
    const f = stubFetch(204);
    await gw().deleteBranch('agent/x');
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('https://api.github.com/repos/o/r/git/refs/heads/agent%2Fx');
    expect(init.method).toBe('DELETE');
  });
  it('tolera 404/422 (branch já ausente)', async () => {
    stubFetch(404);
    await expect(gw().deleteBranch('agent/x')).resolves.toBeUndefined();
  });
});
