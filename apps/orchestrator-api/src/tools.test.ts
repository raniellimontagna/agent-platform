import { describe, expect, it } from 'vitest';
import type { Tool } from './db/schema.js';
import { createToolSchema, pickActiveTool } from './tools.js';

function tool(over: Partial<Tool>): Tool {
  return {
    id: 't',
    key: 'git',
    version: 'v1',
    description: null,
    risk: 'safe',
    scopes: [],
    status: 'active',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...over,
  } as Tool;
}

describe('pickActiveTool', () => {
  it('null quando não há nenhum active', () => {
    expect(pickActiveTool([tool({ status: 'deprecated' })])).toBeNull();
    expect(pickActiveTool([])).toBeNull();
  });

  it('ignora deprecated e escolhe a active mais recente', () => {
    const old = tool({ id: 'old', version: 'v1', createdAt: new Date('2026-01-01') });
    const dep = tool({ id: 'dep', version: 'v2', status: 'deprecated', createdAt: new Date('2026-03-01') });
    const fresh = tool({ id: 'fresh', version: 'v3', createdAt: new Date('2026-02-01') });
    expect(pickActiveTool([old, dep, fresh])?.id).toBe('fresh');
  });
});

describe('createToolSchema', () => {
  it('aceita payload válido com defaults (risk safe, scopes [])', () => {
    const out = createToolSchema.parse({ key: 'git', version: 'v1' });
    expect(out.risk).toBe('safe');
    expect(out.scopes).toEqual([]);
  });

  it('rejeita key/version vazios', () => {
    expect(createToolSchema.safeParse({ key: '', version: 'v1' }).success).toBe(false);
    expect(createToolSchema.safeParse({ key: 'git', version: '' }).success).toBe(false);
  });

  it('rejeita risk inválido', () => {
    expect(createToolSchema.safeParse({ key: 'git', version: 'v1', risk: 'lixo' }).success).toBe(false);
  });

  it('rejeita scopes que não é array de strings', () => {
    expect(createToolSchema.safeParse({ key: 'git', version: 'v1', scopes: 'x' }).success).toBe(false);
    expect(createToolSchema.safeParse({ key: 'git', version: 'v1', scopes: [1] }).success).toBe(false);
  });
});
