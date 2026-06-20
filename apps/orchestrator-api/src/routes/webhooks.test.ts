import { createHmac } from 'node:crypto';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveAgentByKey } from '../agents.js';
import { env } from '../env.js';
import { agentQueue } from '../queue.js';
import {
  createRun,
  findAwaitingApprovalRunForCard,
  resolveApproval,
  updateRunStatus,
} from '../runs.js';
import { webhooks } from './webhooks.js';

vi.mock('../env.js', () => ({
  env: {
    NODE_ENV: 'test',
    LINEAR_WEBHOOK_SECRET: 'secret',
    LINEAR_APPROVED_LABEL_ID: 'approved-id',
    LINEAR_AI_READY_LABEL_ID: 'ai-ready-id',
    LINEAR_AUTO_MERGE_LABEL_ID: 'auto-merge-id',
    PLANE_WEBHOOK_SECRET: 'secret',
    PLANE_AI_READY_LABEL_ID: 'plane-ai-ready-id',
    PLANE_APPROVED_LABEL_ID: 'plane-approved-id',
    PLANE_AUTO_MERGE_LABEL_ID: 'plane-auto-merge-id',
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
  findAwaitingApprovalRunForCard: vi.fn(),
  hasActiveRunForCard: vi.fn().mockResolvedValue(false),
  hasActiveRunForIssue: vi.fn().mockResolvedValue(false),
  resolveApproval: vi.fn(),
  updateRunStatus: vi.fn(),
}));

const app = new Hono();
app.route('/', webhooks);

function signed(body: string) {
  return createHmac('sha256', 'secret').update(body).digest('hex');
}

beforeEach(() => {
  vi.clearAllMocks();
  env.NODE_ENV = 'test';
  env.PLANE_WEBHOOK_SECRET = 'secret';
});

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
      {
        kind: 'plan',
        runId: 'run-1',
        issueId: 'issue-1',
        cardProvider: 'linear',
        cardId: 'issue-1',
      },
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

  it('POST /webhooks/plane enqueues ai-ready work item', async () => {
    vi.mocked(resolveAgentByKey).mockResolvedValue({ id: 'agent-id' } as never);
    vi.mocked(createRun).mockResolvedValue('run-plane');
    const body = JSON.stringify({
      action: 'update',
      type: 'work_item',
      data: {
        id: 'plane-work-1',
        sequence_id: 1,
        name: 'Plane card',
        labels: [{ id: 'plane-ai-ready-id', name: 'ai-ready' }],
        project_id: 'plane-project',
        project_detail: { identifier: 'AGP' },
      },
      updated_from: { labels: [] },
    });

    const res = await app.request('/webhooks/plane', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-plane-signature': signed(body) },
      body,
    });

    expect(res.status).toBe(200);
    expect(createRun).toHaveBeenCalledWith(
      expect.objectContaining({
        cardProvider: 'plane',
        cardId: 'plane-work-1',
        cardIdentifier: 'AGP-1',
        cardProjectId: 'plane-project',
      }),
    );
    expect(agentQueue.add).toHaveBeenCalledWith(
      'plan',
      { kind: 'plan', runId: 'run-plane', cardProvider: 'plane', cardId: 'plane-work-1' },
      { priority: 10 },
    );
  });

  it('POST /webhooks/plane resumes awaiting approval when approved was newly added', async () => {
    vi.mocked(findAwaitingApprovalRunForCard).mockResolvedValue({ id: 'run-plane-approval' } as never);
    const body = JSON.stringify({
      action: 'update',
      type: 'work_item',
      data: {
        id: 'plane-work-2',
        sequence_id: 2,
        name: 'Plane approval card',
        labels: [{ id: 'plane-approved-id', name: 'approved' }],
        project_id: 'plane-project',
        project_detail: { identifier: 'AGP' },
      },
      updated_from: { labels: [] },
    });

    const res = await app.request('/webhooks/plane', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-plane-signature': signed(body) },
      body,
    });

    expect(res.status).toBe(200);
    expect(findAwaitingApprovalRunForCard).toHaveBeenCalledWith('plane', 'plane-work-2');
    expect(resolveApproval).toHaveBeenCalledWith('run-plane-approval', 'approved', 'plane');
    expect(updateRunStatus).toHaveBeenCalledWith('run-plane-approval', 'executing');
    expect(agentQueue.add).toHaveBeenCalledWith(
      'resume',
      { kind: 'resume', runId: 'run-plane-approval' },
      { priority: 20 },
    );
  });

  it('POST /webhooks/plane skips updates when ai-ready was already present', async () => {
    const body = JSON.stringify({
      action: 'update',
      type: 'work_item',
      data: {
        id: 'plane-work-3',
        sequence_id: 3,
        name: 'Plane unchanged card',
        labels: [{ id: 'plane-ai-ready-id', name: 'ai-ready' }],
        project_id: 'plane-project',
        project_detail: { identifier: 'AGP' },
      },
      updated_from: { labels: [{ id: 'plane-ai-ready-id', name: 'ai-ready' }] },
    });

    const res = await app.request('/webhooks/plane', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-plane-signature': signed(body) },
      body,
    });

    expect(res.status).toBe(200);
    expect(createRun).not.toHaveBeenCalled();
    expect(agentQueue.add).not.toHaveBeenCalled();
  });

  it('POST /webhooks/plane skips updates when previous labels are absent', async () => {
    const body = JSON.stringify({
      action: 'update',
      type: 'work_item',
      data: {
        id: 'plane-work-4',
        sequence_id: 4,
        name: 'Plane missing prior labels card',
        labels: [{ id: 'plane-ai-ready-id', name: 'ai-ready' }],
        project_id: 'plane-project',
        project_detail: { identifier: 'AGP' },
      },
    });

    const res = await app.request('/webhooks/plane', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-plane-signature': signed(body) },
      body,
    });

    expect(res.status).toBe(200);
    expect(createRun).not.toHaveBeenCalled();
    expect(agentQueue.add).not.toHaveBeenCalled();
  });

  it('POST /webhooks/plane accepts unsigned payloads without a secret outside production', async () => {
    vi.mocked(resolveAgentByKey).mockResolvedValue({ id: 'agent-id' } as never);
    vi.mocked(createRun).mockResolvedValue('run-plane-no-secret');
    env.PLANE_WEBHOOK_SECRET = undefined as never;

    const body = JSON.stringify({
      action: 'create',
      type: 'work_item',
      data: {
        id: 'plane-work-5',
        sequence_id: 5,
        name: 'Plane unsigned card',
        labels: [{ id: 'plane-ai-ready-id', name: 'ai-ready' }],
        project_id: 'plane-project',
        project_detail: { identifier: 'AGP' },
      },
    });

    const res = await app.request('/webhooks/plane', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });

    expect(res.status).toBe(200);
    expect(createRun).toHaveBeenCalledWith(
      expect.objectContaining({
        cardProvider: 'plane',
        cardId: 'plane-work-5',
      }),
    );
  });

  it('POST /webhooks/plane rejects unsigned payloads in production when secret is absent', async () => {
    env.NODE_ENV = 'production';
    env.PLANE_WEBHOOK_SECRET = undefined as never;

    const body = JSON.stringify({
      action: 'create',
      type: 'work_item',
      data: {
        id: 'plane-work-6',
        sequence_id: 6,
        name: 'Plane rejected unsigned card',
        labels: [{ id: 'plane-ai-ready-id', name: 'ai-ready' }],
        project_id: 'plane-project',
        project_detail: { identifier: 'AGP' },
      },
    });

    const res = await app.request('/webhooks/plane', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });

    expect(res.status).toBe(401);
    expect(createRun).not.toHaveBeenCalled();
  });
});
