import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listAgents } from '../agents.js';
import { listRuns } from '../runs.js';
import { listTools } from '../tools.js';
import { registryRoute, renderRegistryPage } from './registry.js';

vi.mock('../agents.js', () => ({ listAgents: vi.fn() }));
vi.mock('../tools.js', () => ({ listTools: vi.fn() }));
vi.mock('../runs.js', () => ({ listRuns: vi.fn() }));

const app = new Hono();
app.route('/', registryRoute);

const createdAt = new Date('2026-06-18T16:00:00Z');

const agent = {
  id: 'agent-1',
  key: 'reviewer-agent',
  version: 'v1',
  description: 'Revisa mudanças',
  capabilities: ['review', 'critic'],
  status: 'active',
  createdAt,
  updatedAt: createdAt,
};

const tool = {
  id: 'tool-1',
  key: 'node',
  version: 'v1',
  description: 'Runtime',
  risk: 'caution',
  scopes: ['exec'],
  status: 'active',
  createdAt,
  updatedAt: createdAt,
};

const run = {
  id: 'run-1',
  linearIssueId: 'issue-1',
  linearIssueIdentifier: 'MAC-90',
  cardIdentifier: 'AGP-90',
  title: 'Visualizar agentes',
  status: 'completed',
  agentId: 'agent-1',
  verdict: 'APROVADO',
  createdAt,
  updatedAt: createdAt,
};

beforeEach(() => vi.clearAllMocks());

describe('renderRegistryPage', () => {
  it('renderiza agentes, tools e runs recentes associados ao agente', () => {
    const html = renderRegistryPage({
      agents: [agent] as never,
      tools: [tool] as never,
      runs: [run] as never,
    });

    expect(html).toContain('reviewer-agent');
    expect(html).toContain('node');
    expect(html).toContain('AGP-90');
    expect(html).toContain('reviewer-agent v1');
  });

  it('escapa HTML vindo do banco', () => {
    const html = renderRegistryPage({
      agents: [{ ...agent, description: '<script>alert(1)</script>' }] as never,
      tools: [],
      runs: [],
    });

    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
  });

  it('cai de volta para linearIssueIdentifier quando cardIdentifier não existe', () => {
    const html = renderRegistryPage({
      agents: [agent] as never,
      tools: [tool] as never,
      runs: [{ ...run, cardIdentifier: undefined }] as never,
    });

    expect(html).toContain('MAC-90');
  });
});

describe('GET /registry', () => {
  it('devolve HTML com dados do registry', async () => {
    vi.mocked(listAgents).mockResolvedValue([agent] as never);
    vi.mocked(listTools).mockResolvedValue([tool] as never);
    vi.mocked(listRuns).mockResolvedValue([run] as never);

    const res = await app.request('/registry');

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(await res.text()).toContain('Agent Platform Registry');
    expect(listRuns).toHaveBeenCalledWith(25);
  });
});
