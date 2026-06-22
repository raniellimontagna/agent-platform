import { describe, expect, it } from 'vitest';
import { modelAliasForRole } from './roleModels.js';

describe('modelAliasForRole', () => {
  it('returns stable defaults for software roles', () => {
    expect(modelAliasForRole('planner')).toBe('research');
    expect(modelAliasForRole('coder')).toBe('strong_coder');
    expect(modelAliasForRole('critic')).toBe('critic');
    expect(modelAliasForRole('pr')).toBeNull();
    expect(modelAliasForRole('reporter')).toBeNull();
  });

  it('allows explicit overrides', () => {
    expect(modelAliasForRole('planner', { planner: 'heavy_coder' })).toBe('heavy_coder');
    expect(modelAliasForRole('reporter', { reporter: 'cheap_fast' })).toBe('cheap_fast');
  });
});
