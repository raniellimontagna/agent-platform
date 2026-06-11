import { describe, expect, it } from 'vitest';
import { extractJson } from './codegen.js';

describe('extractJson', () => {
  it('parseia JSON cru', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it('parseia JSON em cerca ```json', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('parseia JSON em cerca sem linguagem', () => {
    expect(extractJson('```\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('tolera prosa ao redor do JSON', () => {
    expect(extractJson('Claro! Aqui está:\n{"a":1}\nPronto.')).toEqual({ a: 1 });
  });

  it('lança quando não há JSON', () => {
    expect(() => extractJson('sem json aqui')).toThrow();
  });

  it('lança quando o JSON é inválido', () => {
    expect(() => extractJson('{ a: }')).toThrow();
  });
});
