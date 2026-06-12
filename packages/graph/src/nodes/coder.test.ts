import { describe, expect, it } from 'vitest';
import { slugify } from './coder.js';

describe('slugify', () => {
  it('minúsculas e troca espaços por hífen', () => {
    expect(slugify('Add Version Endpoint')).toBe('add-version-endpoint');
  });

  it('remove acentos', () => {
    expect(slugify('Configuração de Sessão')).toBe('configuracao-de-sessao');
  });

  it('colapsa separadores e tira das pontas', () => {
    expect(slugify('  foo / bar -- baz  ')).toBe('foo-bar-baz');
  });

  it('trunca em 40 chars', () => {
    expect(slugify('a'.repeat(60)).length).toBe(40);
  });
});
