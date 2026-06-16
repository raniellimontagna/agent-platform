import { describe, expect, it } from 'vitest';
import { createAgentSchema, pickActiveAgent } from './agents.js';
import type { Agent } from './db/schema.js';

function agent(over: Partial<Agent>): Agent {
  return {
    id: 'a',
    key: 'coder-agent',
    version: 'v1',
    description: null,
    capabilities: [],
    status: 'active',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...over,
  } as Agent;
}

describe('pickActiveAgent', () => {
  it('null quando não há nenhum active', () => {
    expect(pickActiveAgent([agent({ status: 'deprecated' })])).toBeNull();
    expect(pickActiveAgent([])).toBeNull();
  });

  it('ignora deprecated e escolhe a active mais recente', () => {
    const old = agent({ id: 'old', version: 'v1', createdAt: new Date('2026-01-01') });
    const dep = agent({
      id: 'dep',
      version: 'v2',
      status: 'deprecated',
      createdAt: new Date('2026-03-01'),
    });
    const fresh = agent({ id: 'fresh', version: 'v3', createdAt: new Date('2026-02-01') });
    expect(pickActiveAgent([old, dep, fresh])?.id).toBe('fresh');
  });
});

describe('createAgentSchema', () => {
  it('aceita payload válido e default capabilities []', () => {
    const out = createAgentSchema.parse({ key: 'k', version: 'v1' });
    expect(out.capabilities).toEqual([]);
  });

  it('rejeita key/version vazios', () => {
    expect(createAgentSchema.safeParse({ key: '', version: 'v1' }).success).toBe(false);
    expect(createAgentSchema.safeParse({ key: 'k', version: '' }).success).toBe(false);
  });

  it('rejeita capabilities que não é array de strings', () => {
    expect(
      createAgentSchema.safeParse({ key: 'k', version: 'v1', capabilities: 'x' }).success,
    ).toBe(false);
    expect(
      createAgentSchema.safeParse({ key: 'k', version: 'v1', capabilities: [1] }).success,
    ).toBe(false);
  });
});
