import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { countRunsByStatus } from '../runs.js';
import { adminRoute, renderMissionControlPage } from './admin.js';
import { renderRegistryPage } from './registry.js';
import { escapeHtml, formatDate, humanizeStatus } from './rendering.js';
import { requireRunnerAuth } from './routeAuth.js';

vi.mock('../env.js', () => ({ env: { RUNNER_AUTH_TOKEN: 'secret', AGENT_MAX_CONCURRENCY: 3 } }));

vi.mock('./routeAuth.js', async (orig) => {
  const actual = await orig<typeof import('./routeAuth.js')>();
  return { ...actual, requireRunnerAuth: vi.fn(actual.requireRunnerAuth) };
});

vi.mock('../runs.js', () => ({
  ACTIVE_STATUSES: ['pending', 'planning', 'awaiting_approval', 'executing', 'reviewing'],
  countRunsByStatus: vi.fn(),
  getRun: vi.fn(),
  listApprovals: vi.fn(),
  listRuns: vi.fn(),
  listRunsForCard: vi.fn(),
}));

vi.mock('../artifacts.js', () => ({ listArtifacts: vi.fn() }));
vi.mock('../killswitch.js', () => ({ isPaused: vi.fn(), setPaused: vi.fn() }));
vi.mock('../agent.js', () => ({ getAgent: vi.fn() }));
vi.mock('../agents.js', async (orig) => ({
  ...(await orig<typeof import('../agents.js')>()),
  listAgents: vi.fn(),
}));
vi.mock('../tools.js', () => ({ listTools: vi.fn() }));

const app = new Hono();
app.route('/', adminRoute);

const dangerous = `<script>alert("x") & '</script>`;
const escapedDangerous = '&lt;script&gt;alert(&quot;x&quot;) &amp; &#39;&lt;/script&gt;';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('escapeHtml', () => {
  it('escapes HTML-sensitive characters and treats nullish values as empty strings', () => {
    expect(escapeHtml('&<>"\'')).toBe('&amp;&lt;&gt;&quot;&#39;');
    expect(escapeHtml(dangerous)).toBe(escapedDangerous);
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });
});

describe('formatDate', () => {
  it('returns dash for nullish values and preserves the current ISO display format', () => {
    expect(formatDate(null)).toBe('-');
    expect(formatDate(undefined)).toBe('-');
    expect(formatDate(new Date('2026-06-18T16:00:00.000Z'))).toBe('2026-06-18 16:00:00');
    expect(formatDate('2026-06-18T16:00:00.000Z')).toBe('2026-06-18 16:00:00');
  });
});

describe('humanizeStatus', () => {
  it('preserves the Mission Control underscore-to-title status display', () => {
    expect(humanizeStatus(undefined)).toBe('-');
    expect(humanizeStatus('awaiting_approval')).toBe('Awaiting Approval');
    expect(humanizeStatus('collecting_research')).toBe('Collecting Research');
  });
});

describe('admin and registry rendering behavior', () => {
  it('keeps /admin/* protected through the shared runner auth helper', async () => {
    vi.mocked(countRunsByStatus).mockResolvedValue({});

    const res = await app.request('/admin/concurrency');

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'unauthorized' });
    expect(requireRunnerAuth).toHaveBeenCalled();
  });

  it('keeps registry and admin HTML output escaped', () => {
    const registryHtml = renderRegistryPage({
      agents: [
        {
          id: 'agent-1',
          key: 'agent',
          version: 'v1',
          description: dangerous,
          capabilities: [dangerous],
          status: 'active',
          createdAt: new Date('2026-06-18T16:00:00.000Z'),
          updatedAt: new Date('2026-06-18T16:00:00.000Z'),
        },
      ] as never,
      tools: [],
      runs: [],
    });
    const adminHtml = renderMissionControlPage({
      scenarios: [
        {
          id: 'scenario-1',
          workflow: 'workflow',
          name: dangerous,
          summary: dangerous,
          riskLevel: 'caution',
          requiredLabels: [{ name: dangerous }],
          expectedStages: [{ id: 'planning', label: dangerous, description: dangerous }],
          verificationChecklist: [{ label: dangerous }],
        },
      ] as never,
      missions: [
        {
          id: 'run-1',
          scenarioId: 'scenario-1',
          title: dangerous,
          card: { provider: 'plane', id: 'card-1', identifier: dangerous },
          state: 'awaiting_approval',
          activeStageId: 'planning',
          stageStatuses: { planning: 'active' },
          artifactKinds: [dangerous],
          approvalStatus: dangerous,
          updatedAt: '2026-06-18T16:00:00.000Z',
          branch: null,
          prUrl: dangerous,
          testsPassed: null,
        },
      ],
    });

    expect(registryHtml).toContain(escapedDangerous);
    expect(adminHtml).toContain(escapedDangerous);
    expect(`${registryHtml}${adminHtml}`).not.toContain(dangerous);
  });
});
