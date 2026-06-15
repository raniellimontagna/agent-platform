import { describe, expect, it } from 'vitest';
import { shouldAutoMerge } from './report.js';

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
  it('false com REPROVADO', () => {
    expect(shouldAutoMerge({ ...base, review: 'Veredito: REPROVADO' })).toBe(false);
  });
  it('false se validação não passou', () => {
    expect(shouldAutoMerge({ ...base, testsPassed: false })).toBe(false);
    expect(shouldAutoMerge({ ...base, testsPassed: undefined })).toBe(false);
  });
});
