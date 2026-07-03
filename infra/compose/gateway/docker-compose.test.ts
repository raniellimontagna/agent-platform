import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const compose = readFileSync(new URL('./docker-compose.yml', import.meta.url), 'utf8');

describe('gateway docker-compose', () => {
  it('pins OmniRoute to an explicit release tag instead of latest', () => {
    expect(compose).toMatch(/image:\s+diegosouzapw\/omniroute:3\.8\.43/);
    expect(compose).not.toMatch(/image:\s+diegosouzapw\/omniroute:latest/);
  });
});
