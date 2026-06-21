import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('worker runtime image', () => {
  it('installs Chromium and OS dependencies required by Playwright', () => {
    const dockerfile = readFileSync(resolve(process.cwd(), 'apps/worker-code/Dockerfile'), 'utf8');

    expect(dockerfile).toMatch(/playwright install --with-deps chromium/);
  });
});
