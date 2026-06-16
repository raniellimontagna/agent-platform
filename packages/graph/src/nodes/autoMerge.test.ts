import { describe, expect, it } from 'vitest';
import { hasOnlyOperationalCaveats, shouldAutoMerge } from './report.js';

const base = { autoMerge: true, testsPassed: true, review: 'Veredito: APROVADO\nok' };

describe('shouldAutoMerge', () => {
  it('true com opt-in + validação ✅ + APROVADO seco', () => {
    expect(shouldAutoMerge(base)).toBe(true);
  });
  it('false sem a label de opt-in', () => {
    expect(shouldAutoMerge({ ...base, autoMerge: false })).toBe(false);
  });
  it('false com APROVADO COM RESSALVAS', () => {
    expect(shouldAutoMerge({ ...base, review: 'Veredito: APROVADO COM RESSALVAS' })).toBe(false);
  });
  it('true com ressalva operacional não bloqueante', () => {
    const review =
      'Veredito: APROVADO COM RESSALVAS\nValidação operacional: anexar evidência do E2E real e consulta ao banco com sandbox_backend = docker.';
    expect(hasOnlyOperationalCaveats(review)).toBe(true);
    expect(shouldAutoMerge({ ...base, review })).toBe(true);
  });
  it('false com ressalva técnica bloqueante', () => {
    const review =
      'Veredito: APROVADO COM RESSALVAS\nProblema: bug de lógica incorreta no arquivo src/foo.ts.';
    expect(hasOnlyOperationalCaveats(review)).toBe(false);
    expect(shouldAutoMerge({ ...base, review })).toBe(false);
  });
  it('false com REPROVADO', () => {
    expect(shouldAutoMerge({ ...base, review: 'Veredito: REPROVADO' })).toBe(false);
  });
  it('false se validação não passou', () => {
    expect(shouldAutoMerge({ ...base, testsPassed: false })).toBe(false);
    expect(shouldAutoMerge({ ...base, testsPassed: undefined })).toBe(false);
  });
});
