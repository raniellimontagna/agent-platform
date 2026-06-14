import { describe, expect, it } from 'vitest';
import { isUuid } from './uuid.js';

describe('isUuid', () => {
  it('aceita uuid válido', () => {
    expect(isUuid('81e21f53-9233-4629-a7f2-5e91d387b5b5')).toBe(true);
    expect(isUuid('00000000-0000-4000-8000-000000000000')).toBe(true);
  });

  it('rejeita não-uuid', () => {
    expect(isUuid('nao-existe')).toBe(false);
    expect(isUuid('')).toBe(false);
    expect(isUuid('81e21f53-9233-4629-a7f2')).toBe(false);
    expect(isUuid('zzzzzzzz-9233-4629-a7f2-5e91d387b5b5')).toBe(false);
  });
});
