import { describe, expect, it } from 'vitest';
import { isUniqueViolation } from './pgError.js';

describe('isUniqueViolation', () => {
  it('true para erro pg com code 23505', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true);
  });
  it('false para outro code', () => {
    expect(isUniqueViolation({ code: '23503' })).toBe(false);
  });
  it('false para não-objeto / null / sem code', () => {
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation('x')).toBe(false);
    expect(isUniqueViolation({})).toBe(false);
  });
});
