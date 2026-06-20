import { createHmac, timingSafeEqual } from 'node:crypto';
import { Hono } from 'hono';
import { DATA_COLLECTOR_AGENT_KEY, agentKeyFromLabels, resolveAgentByKey } from '../agents.js';
import { labelJustAdded } from '../cardWebhook.js';
import { isUniqueViolation } from '../db/pgError.js';
import { env } from '../env.js';
import { hasRepoCreateLabel } from '../generatedRepos.js';
import { isPaused } from '../killswitch.js';
import { logger } from '../logger.js';
import { JOB_PRIORITY, agentQueue } from '../queue.js';
import {
  costLast24hUsd,
  createRun,
  findAwaitingApprovalRunForCard,
  hasActiveRunForCard,
  resolveApproval,
  updateRunStatus,
} from '../runs.js';
import { workflowFromLabels } from '../workflows.js';

export const webhooks = new Hono();

const AI_READY_LABEL = 'ai-ready';
const APPROVED_LABEL = 'approved';
const AUTO_MERGE_LABEL = 'auto-merge';

interface IssueData {
  id?: string;
  identifier?: string;
  title?: string;
  labels?: { name: string }[];
  labelIds?: string[];
}
interface IssuePayload {
  action: string;
  type: string;
  data?: IssueData;
  updatedFrom?: { labels?: { name: string }[]; labelIds?: string[] };
}

interface PlaneLabel {
  id?: string;
  name?: string;
}

interface PlaneWorkItemData {
  id?: string;
  sequence_id?: number;
  sequenceId?: number;
  name?: string;
  labels?: PlaneLabel[];
  project_id?: string;
  project_detail?: { identifier?: string };
  project_identifier?: string;
}

interface PlanePayload {
  action: string;
  type?: string;
  event?: string;
  data?: PlaneWorkItemData;
  updated_from?: { labels?: PlaneLabel[] };
  updatedFrom?: { labels?: PlaneLabel[] };
}

function isPlaneWorkItemWebhook(payload: PlanePayload, eventHeader: string | undefined): boolean {
  const event = eventHeader ?? payload.event ?? payload.type;
  return event === 'work_item' || event === 'issue';
}

function verifySignature(rawBody: string, signature: string | undefined, secret: string): boolean {
  if (!signature) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

function issueLabelNames(d: IssueData | undefined): string[] | undefined {
  return d?.labels?.map((l) => l.name);
}

function issueLabelIds(d: IssueData | undefined): string[] | undefined {
  return d?.labelIds;
}

function planeLabelNames(labels: PlaneLabel[] | undefined): string[] | undefined {
  return labels?.map((label) => label.name ?? '').filter(Boolean);
}

function planeLabelIds(labels: PlaneLabel[] | undefined): string[] | undefined {
  return labels?.map((label) => label.id ?? '').filter(Boolean);
}

function hasLabel(input: { names: string[]; ids: string[]; name: string; id?: string }): boolean {
  return input.names.includes(input.name) || (!!input.id && input.ids.includes(input.id));
}

function planeCardIdentifier(data: PlaneWorkItemData): string {
  const projectIdentifier = data.project_detail?.identifier ?? data.project_identifier ?? 'AGP';
  const sequence = data.sequence_id ?? data.sequenceId;
  return sequence ? `${projectIdentifier}-${sequence}` : (data.id ?? projectIdentifier);
}

function verifyPlaneSignature(rawBody: string, signature: string | undefined): boolean {
  if (!env.PLANE_WEBHOOK_SECRET) {
    return env.NODE_ENV !== 'production';
  }
  return verifySignature(rawBody, signature, env.PLANE_WEBHOOK_SECRET);
}

async function handleAiReadyCard(input: {
  provider: 'plane' | 'linear';
  cardId: string;
  cardIdentifier: string;
  cardProjectId?: string;
  title: string;
  labels: string[];
  hasAutoMerge: boolean;
  targetRepoCreate: boolean;
}) {
  if (await hasActiveRunForCard(input.provider, input.cardId)) {
    logger.warn(
      { provider: input.provider, card: input.cardIdentifier },
      'run ativo já existe; ignorando duplicata',
    );
    return { skipped: true, reason: 'active run already exists' } as const;
  }

  if (await isPaused()) {
    logger.warn(
      { provider: input.provider, card: input.cardIdentifier },
      'agents paused; ai-ready ignorado',
    );
    return { skipped: true, reason: 'agents paused' } as const;
  }

  const spent = await costLast24hUsd();
  if (spent >= env.AGENT_MAX_COST_PER_DAY_USD) {
    logger.warn({ spent, limit: env.AGENT_MAX_COST_PER_DAY_USD }, 'orçamento diário estourado');
    return { skipped: true, reason: 'daily cost budget exceeded' } as const;
  }

  const workflow = workflowFromLabels(input.labels);
  const agentKey = workflow ? DATA_COLLECTOR_AGENT_KEY : agentKeyFromLabels(input.labels);
  const agent = await resolveAgentByKey(agentKey);

  let runId: string;
  try {
    runId = await createRun({
      ...(input.provider === 'linear'
        ? { linearIssueId: input.cardId, linearIssueIdentifier: input.cardIdentifier }
        : {}),
      cardProvider: input.provider,
      cardId: input.cardId,
      cardIdentifier: input.cardIdentifier,
      cardProjectId: input.cardProjectId,
      title: input.title,
      autoMerge: input.hasAutoMerge,
      agentId: agent?.id,
      workflow,
      targetRepoCreate: input.targetRepoCreate,
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      logger.warn(
        { provider: input.provider, card: input.cardIdentifier },
        'run ativo já existe (índice); ignorando duplicata',
      );
      return { skipped: true, reason: 'active run exists' } as const;
    }
    throw err;
  }

  await agentQueue.add(
    'plan',
    {
      kind: 'plan',
      runId,
      cardProvider: input.provider,
      cardId: input.cardId,
      ...(input.provider === 'linear' ? { issueId: input.cardId } : {}),
    },
    { priority: JOB_PRIORITY.plan },
  );

  logger.info(
    { runId, provider: input.provider, card: input.cardIdentifier },
    'ai-ready card enqueued',
  );
  return { queued: true, runId } as const;
}

webhooks.post('/webhooks/linear', async (c) => {
  const rawBody = await c.req.text();
  const signature = c.req.header('linear-signature');

  if (!env.LINEAR_WEBHOOK_SECRET) {
    logger.warn('Linear webhook received but Linear provider is not configured');
    return c.json({ error: 'linear provider is not configured' }, 503);
  }
  if (!verifySignature(rawBody, signature, env.LINEAR_WEBHOOK_SECRET)) {
    logger.warn('Linear webhook with invalid signature rejected');
    return c.json({ error: 'invalid signature' }, 401);
  }

  const payload = JSON.parse(rawBody) as IssuePayload;

  if (payload.type !== 'Issue') {
    return c.json({ ok: true, skipped: true });
  }

  const issueId = payload.data?.id;
  if (!issueId) {
    return c.json({ ok: true, skipped: true, reason: 'no issue id' });
  }
  const identifier = payload.data?.identifier ?? issueId;
  const currentNames = issueLabelNames(payload.data) ?? [];
  const currentIds = issueLabelIds(payload.data) ?? [];
  const previousNames = issueLabelNames(payload.updatedFrom);
  const previousIds = issueLabelIds(payload.updatedFrom);

  // Approve via Linear (MAC-22): label `approved` adicionada → retoma o run pausado.
  if (
    labelJustAdded({
      currentNames,
      currentIds,
      previousNames,
      previousIds,
      action: payload.action,
      name: APPROVED_LABEL,
      id: env.LINEAR_APPROVED_LABEL_ID,
    })
  ) {
    const run = await findAwaitingApprovalRunForCard('linear', issueId);
    if (!run) {
      return c.json({ ok: true, skipped: true, reason: 'nenhum run aguardando aprovação' });
    }
    await resolveApproval(run.id, 'approved', 'linear');
    await updateRunStatus(run.id, 'executing');
    await agentQueue.add(
      'resume',
      { kind: 'resume', runId: run.id },
      { priority: JOB_PRIORITY.resume },
    );
    logger.info({ runId: run.id, issue: identifier }, 'run approved via Linear, resuming');
    return c.json({ ok: true, resumed: true, runId: run.id });
  }

  // ai-ready: dispara um novo run — só quando a label é ADICIONADA (não em toda edição).
  if (
    !labelJustAdded({
      currentNames,
      currentIds,
      previousNames,
      previousIds,
      action: payload.action,
      name: AI_READY_LABEL,
      id: env.LINEAR_AI_READY_LABEL_ID,
    })
  ) {
    return c.json({ ok: true, skipped: true });
  }

  const result = await handleAiReadyCard({
    provider: 'linear',
    cardId: issueId,
    cardIdentifier: identifier,
    title: payload.data?.title ?? '(sem título)',
    labels: currentNames,
    hasAutoMerge: hasLabel({
      names: currentNames,
      ids: currentIds,
      name: AUTO_MERGE_LABEL,
      id: env.LINEAR_AUTO_MERGE_LABEL_ID,
    }),
    targetRepoCreate: hasRepoCreateLabel(currentNames),
  });

  return c.json({ ok: true, ...result });
});

webhooks.post('/webhooks/plane', async (c) => {
  const rawBody = await c.req.text();
  const signature = c.req.header('x-plane-signature');
  const eventHeader = c.req.header('x-plane-event');

  if (!verifyPlaneSignature(rawBody, signature)) {
    logger.warn('Plane webhook with invalid signature rejected');
    return c.json({ error: 'invalid signature' }, 401);
  }

  const payload = JSON.parse(rawBody) as PlanePayload;

  if (!isPlaneWorkItemWebhook(payload, eventHeader)) {
    return c.json({ ok: true, skipped: true });
  }

  const item = payload.data;
  const cardId = item?.id;
  if (!cardId) {
    return c.json({ ok: true, skipped: true, reason: 'no work item id' });
  }

  const currentNames = planeLabelNames(item.labels) ?? [];
  const currentIds = planeLabelIds(item.labels) ?? [];
  const previousLabels = payload.updated_from?.labels ?? payload.updatedFrom?.labels;
  const previousNames = planeLabelNames(previousLabels);
  const previousIds = planeLabelIds(previousLabels);

  if (
    labelJustAdded({
      currentNames,
      currentIds,
      previousNames,
      previousIds,
      action: payload.action,
      name: APPROVED_LABEL,
      id: env.PLANE_APPROVED_LABEL_ID,
    })
  ) {
    const run = await findAwaitingApprovalRunForCard('plane', cardId);
    if (!run) {
      return c.json({ ok: true, skipped: true, reason: 'nenhum run aguardando aprovação' });
    }
    await resolveApproval(run.id, 'approved', 'plane');
    await updateRunStatus(run.id, 'executing');
    await agentQueue.add(
      'resume',
      { kind: 'resume', runId: run.id },
      { priority: JOB_PRIORITY.resume },
    );
    logger.info(
      { runId: run.id, issue: planeCardIdentifier(item) },
      'run approved via Plane, resuming',
    );
    return c.json({ ok: true, resumed: true, runId: run.id });
  }

  if (
    !labelJustAdded({
      currentNames,
      currentIds,
      previousNames,
      previousIds,
      action: payload.action,
      name: AI_READY_LABEL,
      id: env.PLANE_AI_READY_LABEL_ID,
    })
  ) {
    return c.json({ ok: true, skipped: true });
  }

  const result = await handleAiReadyCard({
    provider: 'plane',
    cardId,
    cardIdentifier: planeCardIdentifier(item),
    cardProjectId: item.project_id,
    title: item.name ?? '(sem título)',
    labels: currentNames,
    hasAutoMerge: hasLabel({
      names: currentNames,
      ids: currentIds,
      name: AUTO_MERGE_LABEL,
      id: env.PLANE_AUTO_MERGE_LABEL_ID,
    }),
    targetRepoCreate: hasRepoCreateLabel(currentNames),
  });

  return c.json({ ok: true, ...result });
});
