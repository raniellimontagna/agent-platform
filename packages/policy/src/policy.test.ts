import { describe, expect, it } from 'vitest';
import { criticalReasons, parseApprovalReasons, stripApprovalReasonsLine } from './index.js';

describe('parseApprovalReasons', () => {
  it('sempre inclui plan', () => {
    expect(parseApprovalReasons('plano sem linha de motivos')).toEqual(['plan']);
  });

  it('none → só plan', () => {
    expect(parseApprovalReasons('texto\nAPPROVAL_REASONS: none')).toEqual(['plan']);
  });

  it('lê a lista da linha estruturada', () => {
    const r = parseApprovalReasons('plano...\nAPPROVAL_REASONS: migration, deploy');
    expect(r).toContain('migration');
    expect(r).toContain('deploy');
    expect(r).toContain('plan');
  });

  it('NÃO casa palavras na prosa (sem falso positivo)', () => {
    // Plano cita "migration/auth/deploy" no texto de riscos, mas a linha diz none.
    const plan =
      'Riscos: migrations não aplicável, auth não aplicável, deploy não.\nAPPROVAL_REASONS: none';
    expect(parseApprovalReasons(plan)).toEqual(['plan']);
  });

  it('ignora tokens inválidos', () => {
    expect(parseApprovalReasons('APPROVAL_REASONS: foo, deploy')).toEqual(['plan', 'deploy']);
  });

  it('criticalReasons remove o plan base', () => {
    expect(criticalReasons(['plan', 'deploy'])).toEqual(['deploy']);
  });

  it('stripApprovalReasonsLine remove a linha de controle', () => {
    const out = stripApprovalReasonsLine('linha 1\nlinha 2\nAPPROVAL_REASONS: deploy');
    expect(out).not.toContain('APPROVAL_REASONS');
    expect(out).toContain('linha 2');
  });
});
