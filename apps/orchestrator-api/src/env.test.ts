import { describe, expect, it, vi } from 'vitest';
import { env } from './env.js';

// Prova que o env carrega sob os dummies do vitest.setup.ts — qualquer teste de
// rota que importe módulos acoplados ao env (logger etc.) passa a funcionar.
describe('env', () => {
  it('carrega com os defaults de teste', () => {
    expect(env.NODE_ENV).toBe('test');
    expect(env.PORT).toBe(3000);
    expect(env.DATABASE_URL).toContain('postgres://');
    expect(env.AGENT_MAX_REVIEW_ROUNDS).toBe(3);
    expect(env.RUNNER_JOB_TIMEOUT_MS).toBe(5_400_000);
    expect(env.CARD_PRIMARY_PROVIDER).toBe('plane');
    expect(env.CARD_EXTRA_PROVIDERS).toBe('');
    expect(env.PLANE_WORKSPACE_SLUG).toBe('attodev');
    expect(env.LINEAR_API_KEY).toBeUndefined();
    expect(env.LINEAR_WEBHOOK_SECRET).toBeUndefined();
    expect(env.LINEAR_TEAM_ID).toBeUndefined();
    expect(env.AGENT_TEST_COMMANDS.split('\n')).toEqual([
      'pnpm install --frozen-lockfile',
      'pnpm verify',
    ]);
  });
});

describe('env Plane-only deploy', () => {
  it('treats empty optional Linear compose variables as absent', async () => {
    const previous = { ...process.env };
    vi.resetModules();
    try {
      process.env = {
        ...previous,
        NODE_ENV: 'production',
        CARD_PRIMARY_PROVIDER: 'plane',
        CARD_EXTRA_PROVIDERS: '',
        PLANE_API_KEY: 'plane_test',
        PLANE_PROJECT_ID: 'plane-project-test',
        PLANE_WEBHOOK_SECRET: 'plane-secret',
        LINEAR_API_KEY: '',
        LINEAR_WEBHOOK_SECRET: '',
        LINEAR_TEAM_ID: '',
      };

      const loaded = await import('./env.js');

      expect(loaded.env.LINEAR_API_KEY).toBeUndefined();
      expect(loaded.env.LINEAR_WEBHOOK_SECRET).toBeUndefined();
      expect(loaded.env.LINEAR_TEAM_ID).toBeUndefined();
      expect(loaded.env.CARD_PRIMARY_PROVIDER).toBe('plane');
    } finally {
      process.env = previous;
      vi.resetModules();
    }
  });

  it('requires legacy secrets only when Linear is explicitly enabled', async () => {
    const previous = { ...process.env };
    vi.resetModules();
    try {
      process.env = {
        ...previous,
        CARD_PRIMARY_PROVIDER: 'plane',
        CARD_EXTRA_PROVIDERS: 'linear',
        LINEAR_API_KEY: '',
        LINEAR_WEBHOOK_SECRET: '',
        LINEAR_TEAM_ID: '',
      };

      await expect(import('./env.js')).rejects.toThrow(
        'Linear provider habilitado sem env obrigatório: LINEAR_API_KEY, LINEAR_WEBHOOK_SECRET',
      );
    } finally {
      process.env = previous;
      vi.resetModules();
    }
  });

  it('loads explicit legacy provider env without changing the Plane primary default', async () => {
    const previous = { ...process.env };
    vi.resetModules();
    try {
      process.env = {
        ...previous,
        CARD_PRIMARY_PROVIDER: 'plane',
        CARD_EXTRA_PROVIDERS: 'linear',
        LINEAR_API_KEY: 'linear-key',
        LINEAR_WEBHOOK_SECRET: 'linear-secret',
        LINEAR_TEAM_ID: 'team-1',
      };

      const loaded = await import('./env.js');

      expect(loaded.env.CARD_PRIMARY_PROVIDER).toBe('plane');
      expect(loaded.env.CARD_EXTRA_PROVIDERS).toBe('linear');
      expect(loaded.env.LINEAR_API_KEY).toBe('linear-key');
      expect(loaded.env.LINEAR_WEBHOOK_SECRET).toBe('linear-secret');
      expect(loaded.env.LINEAR_TEAM_ID).toBe('team-1');
    } finally {
      process.env = previous;
      vi.resetModules();
    }
  });
});
