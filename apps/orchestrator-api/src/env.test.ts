import { describe, expect, it } from 'vitest';
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
  });
});
