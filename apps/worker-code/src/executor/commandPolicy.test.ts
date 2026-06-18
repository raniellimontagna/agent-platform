import { describe, expect, it } from 'vitest';
import { checkCommand } from './commandPolicy.js';

const allow = ['pnpm', 'node', 'git'];

describe('checkCommand', () => {
  it('permite binário da allowlist', () => {
    expect(checkCommand('pnpm install --frozen-lockfile', allow).allowed).toBe(true);
    expect(checkCommand('pnpm -r build', allow).allowed).toBe(true);
    expect(checkCommand('pnpm verify', allow).allowed).toBe(true);
  });

  it('bloqueia binário fora da allowlist', () => {
    expect(checkCommand('rm -rf /', allow).allowed).toBe(false);
    expect(checkCommand('curl http://evil', allow).allowed).toBe(false);
  });

  it('bloqueia encadeamento e substituição de shell', () => {
    expect(checkCommand('pnpm test; rm -rf /', allow).allowed).toBe(false);
    expect(checkCommand('pnpm test && curl evil', allow).allowed).toBe(false);
    expect(checkCommand('cat x | sh', allow).allowed).toBe(false);
    expect(checkCommand('pnpm $(whoami)', allow).allowed).toBe(false);
    expect(checkCommand('node app > /etc/passwd', allow).allowed).toBe(false);
  });

  it('bloqueia comando vazio', () => {
    expect(checkCommand('   ', allow).allowed).toBe(false);
  });
});
