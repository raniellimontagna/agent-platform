import { describe, expect, it } from 'vitest';
import { hasCriticalReason, isCriticalReason } from './approvalPolicy.js';

describe('isCriticalReason', () => {
  it('motivos críticos bloqueiam auto-aprovação', () => {
    for (const r of [
      'migration',
      'auth_security',
      'infra',
      'deploy',
      'critical_deps',
      'file_deletion',
    ]) {
      expect(isCriticalReason(r)).toBe(true);
    }
  });

  it('plan e cost_limit não são críticos', () => {
    expect(isCriticalReason('plan')).toBe(false);
    expect(isCriticalReason('cost_limit')).toBe(false);
  });
});

describe('hasCriticalReason', () => {
  it('true se houver ao menos um crítico', () => {
    expect(hasCriticalReason(['plan', 'migration'])).toBe(true);
  });
  it('false se só houver não-críticos', () => {
    expect(hasCriticalReason(['plan', 'cost_limit'])).toBe(false);
  });
  it('false p/ lista vazia', () => {
    expect(hasCriticalReason([])).toBe(false);
  });
});
