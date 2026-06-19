import { createHmac } from 'node:crypto';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveAgentByKey } from '../agents.js';
import { agentQueue } from '../queue.js';
import { createRun } from '../runs.js';
import { webhooks } from './webhooks.js';

vi.mock('../env.js', () => ({
  env: {
    LINEAR_WEBHOOK_SECRET: 'secret',
    LINEAR_APPROVED_LABEL_ID: 'approved-id',
    LINEAR_AI_READY_LABEL_ID: 'ai-ready-id',
    LINEAR_AUTO_MERGE_LABEL_ID: 'auto-merge-id',
    AGENT_MAX_COST_PER_DAY_USD: 100,
  },
}));

vi.mock('../agents.js', async (orig) => ({
  ...(await orig<typeof import('../agents.js')>()),
  resolveAgentByKey: vi.fn(),
}));

vi.mock('../killswitch.js', () => ({ isPaused: vi.fn().mockResolvedValue(false) }));

vi.mock('../queue.js', () => ({
  JOB_PRIORITY: { plan: 10, resume: 20 },
  agentQueue: { add: vi.fn() },
}));

vi.mock('../runs.js', () => ({
  costLast24hUsd: vi.fn().mockResolvedValue(0),
  createRun: vi.fn(),
  findAwaitingApprovalRun: vi.fn(),
  hasActiveRunForIssue: vi.fn().mockResolvedValue(false),
  resolveApproval: vi.fn(),
  updateRunStatus: vi.fn(),
}));

const app = new Hono();
app.route('/', webhooks);

function signed(body: string) {
  return createHmac('sha256', 'secret').update(body).digest('hex');
}

beforeEach(() => vi.clearAllMocks());

describe('POST /webhooks/linear', () => {
  it('seleciona reviewer-agent quando a issue tem label agent:reviewer', async () => {
    vi.mocked(resolveAgentByKey).mockResolvedValue({ id: 'reviewer-id' } as never);
    vi.mocked(createRun).mockResolvedValue('run-1');
    const body = JSON.stringify({
      action: 'update',
      type: 'Issue',
      data: {
        id: 'issue-1',
        identifier: 'MAC-90',
        title: 'usar reviewer',
        labels: [{ name: 'approved' }, { name: 'ai-ready' }, { name: 'agent:reviewer' }],
      },
      updatedFrom: { labels: [{ name: 'approved' }] },
    });

    const res = await app.request('/webhooks/linear', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'linear-signature': signed(body) },
      body,
    });

    expect(res.status).toBe(200);
    expect(resolveAgentByKey).toHaveBeenCalledWith('reviewer-agent');
    expect(createRun).toHaveBeenCalledWith(
      expect.objectContaining({
        linearIssueId: 'issue-1',
        linearIssueIdentifier: 'MAC-90',
        title: 'usar reviewer',
        agentId: 'reviewer-id',
      }),
    );
    expect(agentQueue.add).toHaveBeenCalledWith(
      'plan',
      { kind: 'plan', runId: 'run-1', issueId: 'issue-1' },
      { priority: 10 },
    );
  });

  it('seleciona landing-page-agent quando a issue tem label agent:landing-page', async () => {
    vi.mocked(resolveAgentByKey).mockResolvedValue({ id: 'landing-id' } as never);
    vi.mocked(createRun).mockResolvedValue('run-landing');
    const body = JSON.stringify({
      action: 'update',
      type: 'Issue',
      data: {
        id: 'issue-landing',
        identifier: 'MAC-91',
        title: 'Criar landing page',
        labels: [{ name: 'approved' }, { name: 'ai-ready' }, { name: 'agent:landing-page' }],
      },
      updatedFrom: { labels: [{ name: 'approved' }] },
    });

    const res = await app.request('/webhooks/linear', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'linear-signature': signed(body) },
      body,
    });

    expect(res.status).toBe(200);
    expect(resolveAgentByKey).toHaveBeenCalledWith('landing-page-agent');
    expect(createRun).toHaveBeenCalledWith(
      expect.objectContaining({
        linearIssueId: 'issue-landing',
        linearIssueIdentifier: 'MAC-91',
        title: 'Criar landing page',
        agentId: 'landing-id',
      }),
    );
  });

  it('seleciona data-collector-agent quando a issue tem label agent:data-collector', async () => {
    vi.mocked(resolveAgentByKey).mockResolvedValue({ id: 'collector-id' } as never);
    vi.mocked(createRun).mockResolvedValue('run-collector');
    const body = JSON.stringify({
      action: 'update',
      type: 'Issue',
      data: {
        id: 'issue-collector',
        identifier: 'MAC-93',
        title: 'Coletar dados de concorrentes',
        labels: [{ name: 'approved' }, { name: 'ai-ready' }, { name: 'agent:data-collector' }],
      },
      updatedFrom: { labels: [{ name: 'approved' }] },
    });

    const res = await app.request('/webhooks/linear', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'linear-signature': signed(body) },
      body,
    });

    expect(res.status).toBe(200);
    expect(resolveAgentByKey).toHaveBeenCalledWith('data-collector-agent');
    expect(createRun).toHaveBeenCalledWith(
      expect.objectContaining({
        linearIssueId: 'issue-collector',
        linearIssueIdentifier: 'MAC-93',
        title: 'Coletar dados de concorrentes',
        agentId: 'collector-id',
      }),
    );
  });

  it('workflow:landing-page inicia pelo data-collector-agent e grava workflow', async () => {
    vi.mocked(resolveAgentByKey).mockResolvedValue({ id: 'collector-id' } as never);
    vi.mocked(createRun).mockResolvedValue('run-workflow');
    const body = JSON.stringify({
      action: 'update',
      type: 'Issue',
      data: {
        id: 'issue-workflow',
        identifier: 'MAC-98',
        title: 'Criar landing page de empresa',
        labels: [{ name: 'ai-ready' }, { name: 'workflow:landing-page' }],
      },
      updatedFrom: { labels: [] },
    });

    const res = await app.request('/webhooks/linear', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'linear-signature': signed(body) },
      body,
    });

    expect(res.status).toBe(200);
    expect(resolveAgentByKey).toHaveBeenCalledWith('data-collector-agent');
    expect(createRun).toHaveBeenCalledWith(
      expect.objectContaining({
        linearIssueId: 'issue-workflow',
        linearIssueIdentifier: 'MAC-98',
        title: 'Criar landing page de empresa',
        agentId: 'collector-id',
        workflow: 'research_landing_page',
      }),
    );
  });

  it('persiste opt-in repo:create no run inicial', async () => {
    vi.mocked(resolveAgentByKey).mockResolvedValue({ id: 'collector-id' } as never);
    vi.mocked(createRun).mockResolvedValue('run-workflow');
    const body = JSON.stringify({
      action: 'update',
      type: 'Issue',
      data: {
        id: 'issue-workflow',
        identifier: 'MAC-99',
        title: 'Criar landing page de empresa',
        labels: [{ name: 'ai-ready' }, { name: 'workflow:landing-page' }, { name: 'repo:create' }],
      },
      updatedFrom: { labels: [] },
    });

    const res = await app.request('/webhooks/linear', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'linear-signature': signed(body) },
      body,
    });

    expect(res.status).toBe(200);
    expect(createRun).toHaveBeenCalledWith(
      expect.objectContaining({
        targetRepoCreate: true,
      }),
    );
  });
});
