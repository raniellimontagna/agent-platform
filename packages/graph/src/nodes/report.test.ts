import { describe, expect, it } from 'vitest';
import { verdictOf } from './report.js';

describe('verdictOf', () => {
  it('extrai veredito com markdown', () => {
    expect(verdictOf('## **Veredito**: APROVADO\n\nresto')).toBe('APROVADO');
  });

  it('extrai APROVADO COM RESSALVAS', () => {
    expect(verdictOf('**Veredito**: APROVADO COM RESSALVAS')).toBe('APROVADO COM RESSALVAS');
  });

  it('extrai REPROVADO sem markdown', () => {
    expect(verdictOf('Veredito: REPROVADO')).toBe('REPROVADO');
  });

  it('devolve travessão quando não há review', () => {
    expect(verdictOf(undefined)).toBe('—');
    expect(verdictOf('sem veredito aqui')).toBe('—');
  });
});
