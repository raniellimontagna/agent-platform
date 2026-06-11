import { describe, expect, it } from 'vitest';
import { estimateCostUsd } from './index.js';

describe('estimateCostUsd', () => {
  it('cobra entrada por 1M tokens', () => {
    expect(
      estimateCostUsd('cheap_fast', { promptTokens: 1_000_000, completionTokens: 0 }),
    ).toBeCloseTo(0.1);
  });

  it('cobra saída por 1M tokens', () => {
    expect(
      estimateCostUsd('research', { promptTokens: 0, completionTokens: 1_000_000 }),
    ).toBeCloseTo(15);
  });

  it('soma entrada + saída', () => {
    expect(
      estimateCostUsd('strong_coder', { promptTokens: 2_000_000, completionTokens: 1_000_000 }),
    ).toBeCloseTo(3 * 2 + 15);
  });

  it('zero tokens = zero', () => {
    expect(estimateCostUsd('critic', { promptTokens: 0, completionTokens: 0 })).toBe(0);
  });
});
