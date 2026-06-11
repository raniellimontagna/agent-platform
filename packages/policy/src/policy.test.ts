import { describe, expect, it } from 'vitest';
import { criticalReasons, detectApprovalReasons } from './index.js';

describe('detectApprovalReasons', () => {
  it('sempre inclui plan', () => {
    expect(detectApprovalReasons('tarefa simples')).toEqual(['plan']);
  });

  it('detecta migração', () => {
    expect(detectApprovalReasons('Criar migration para alterar a tabela users')).toContain(
      'migration',
    );
  });

  it('detecta deploy e infra', () => {
    const r = detectApprovalReasons('Atualizar o docker-compose e fazer deploy em produção');
    expect(r).toContain('deploy');
    expect(r).toContain('infra');
  });

  it('detecta auth/segurança', () => {
    expect(detectApprovalReasons('mexer no token de autenticação')).toContain('auth_security');
  });

  it('criticalReasons remove o plan base', () => {
    expect(criticalReasons(['plan', 'deploy'])).toEqual(['deploy']);
  });
});
