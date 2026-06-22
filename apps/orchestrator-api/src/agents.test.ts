import { describe, expect, it } from 'vitest';
import {
  DATA_COLLECTOR_AGENT_KEY,
  DEFAULT_AGENT_KEY,
  LANDING_PAGE_AGENT_KEY,
  REVIEWER_AGENT_KEY,
  agentKeyFromLabels,
  SOFTWARE_DELIVERY_PIPELINE_KEY,
  SOFTWARE_DELIVERY_PIPELINE_ROLES,
  agentRolesFromCapabilities,
  roleCapabilities,
  createAgentSchema,
  pickActiveAgent,
} from './agents.js';
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

describe('agentKeyFromLabels', () => {
  it('usa coder-agent por padrão', () => {
    expect(agentKeyFromLabels(['ai-ready'])).toBe(DEFAULT_AGENT_KEY);
  });

  it('usa reviewer-agent quando a issue tem label agent:reviewer', () => {
    expect(agentKeyFromLabels(['ai-ready', 'agent:reviewer'])).toBe(REVIEWER_AGENT_KEY);
  });

  it('usa landing-page-agent quando a issue tem label agent:landing-page', () => {
    expect(agentKeyFromLabels(['ai-ready', 'agent:landing-page'])).toBe(LANDING_PAGE_AGENT_KEY);
  });

  it('usa data-collector-agent quando a issue tem label agent:data-collector', () => {
    expect(agentKeyFromLabels(['ai-ready', 'agent:data-collector'])).toBe(DATA_COLLECTOR_AGENT_KEY);
  });

  it('prioriza landing-page-agent se houver mais de uma label de agente', () => {
    expect(
      agentKeyFromLabels([
        'ai-ready',
        'agent:reviewer',
        'agent:data-collector',
        'agent:landing-page',
      ]),
    ).toBe(LANDING_PAGE_AGENT_KEY);
  });
});

describe('software delivery pipeline roles', () => {
  it('declares the initial planner/coder/critic/pr/reporter roles', () => {
    expect(SOFTWARE_DELIVERY_PIPELINE_KEY).toBe('software-delivery-pipeline');
    expect(SOFTWARE_DELIVERY_PIPELINE_ROLES).toEqual([
      {
        key: 'planner',
        description: 'Gera plano e approval reasons.',
        modelAlias: 'research',
        skills: [],
      },
      {
        key: 'coder',
        description: 'Aplica plano no runner e valida mudancas.',
        modelAlias: 'strong_coder',
        skills: [],
      },
      {
        key: 'critic',
        description: 'Revisa diff e decide recode ou PR.',
        modelAlias: 'critic',
        skills: [],
      },
      {
        key: 'pr',
        description: 'Abre PR e avalia auto-merge.',
        modelAlias: null,
        skills: [],
      },
      {
        key: 'reporter',
        description: 'Publica resumo final no card.',
        modelAlias: null,
        skills: [],
      },
    ]);
  });

  it('serializes roles as stable capabilities', () => {
    expect(roleCapabilities(SOFTWARE_DELIVERY_PIPELINE_ROLES)).toEqual([
      'role:planner',
      'role:coder',
      'role:critic',
      'role:pr',
      'role:reporter',
    ]);
  });

  it('resolves role definitions from capabilities and ignores unknown tags', () => {
    expect(
      agentRolesFromCapabilities(['typescript', 'role:critic', 'role:unknown', 'role:planner']),
    ).toEqual([SOFTWARE_DELIVERY_PIPELINE_ROLES[0], SOFTWARE_DELIVERY_PIPELINE_ROLES[2]]);
  });
});
