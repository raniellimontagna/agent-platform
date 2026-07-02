import { Hono } from 'hono';
import { DATA_COLLECTOR_AGENT_KEY, agentKeyFromLabels, resolveAgentByKey } from '../agents.js';
import { labelJustAdded } from '../cardWebhook.js';
import { isUniqueViolation } from '../db/pgError.js';
import { env } from '../env.js';
import { hasRepoCreateLabel } from '../generatedRepos.js';
import { isPaused } from '../killswitch.js';
import { logger } from '../logger.js';
import { type PlanePayload, normalizePlaneWebhook } from '../planeWebhook.js';
import { JOB_PRIORITY, agentQueue } from '../queue.js';
import {
  cancelActiveRunsForCard,
  costLast24hUsd,
  createRun,
  findAwaitingApprovalRunForCard,
  hasActiveRunForCard,
  resolveApproval,
  updateRunStatus,
} from '../runs.js';
import { workflowFromLabels } from '../workflows.js';
import { verifyPlaneSignature, verifySignature } from '../webhookSignature.js';

export const webhooks = new Hono();

const AI_READY_LABEL = 'ai-ready';
const APPROVED_LABEL = 'approved';
const AUTO_MERGE_LABEL = 'auto-merge';
const PLANE_REMOVED_REASON = 'plane work item removed';

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

function issueLabelNames(d: IssueData | undefined): string[] | undefined {
  return d?.labels?.map((l) => l.name);
}

function issueLabelIds(d: IssueData | undefined): string[] | undefined {
  return d?.labelIds;
}

function hasLabel(input: { names: string[]; ids: string[]; name: string; id?: string }): boolean {
  return input.names.includes(input.name) || (!!input.id && input.ids.includes(input.id));
}

function isLegacyLinearWebhookEnabled(): boolean {
  return env.CARD_EXTRA_PROVIDERS.split(',')
    .map((provider) => provider.trim())
    .includes('linear');
}

function skipPlaneWebhook(
  reason: string,
  context: {
    action?: string;
    event?: string;
    cardId?: string;
    cardIdentifier?: string;
    currentNames?: string[];
    currentIds?: string[];
    previousNames?: string[];
    previousIds?: string[];
  } = {},
) {
  logger.info({ provider: 'plane', reason, ...context }, 'Plane webhook skipped');
  return { ok: true, skipped: true, reason } as const;
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
  if (!isLegacyLinearWebhookEnabled()) {
    logger.warn('Linear webhook received but legacy compatibility is disabled');
    return c.json(
      {
        ok: true,
        skipped: true,
        reason: 'linear webhook disabled; set CARD_EXTRA_PROVIDERS=linear for legacy compatibility',
      },
      410,
    );
  }

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
  const planeEvent = normalizePlaneWebhook(payload, eventHeader);

  if (!planeEvent.supported) {
    return c.json(
      skipPlaneWebhook(planeEvent.reason, {
        action: planeEvent.action,
        event: planeEvent.event,
      }),
    );
  }

  const cardId = planeEvent.cardId;
  if (!cardId) {
    return c.json(
      skipPlaneWebhook('no work item id', {
        action: planeEvent.action,
        event: planeEvent.event,
      }),
    );
  }

  if (planeEvent.removal) {
    const cancelled = await cancelActiveRunsForCard('plane', cardId, PLANE_REMOVED_REASON);
    logger.info(
      {
        provider: 'plane',
        action: planeEvent.action,
        event: planeEvent.event,
        cardId,
        cardIdentifier: planeEvent.cardIdentifier,
        cancelled,
      },
      'Plane work item removed; active runs cancelled',
    );
    return c.json({ ok: true, cancelled, reason: PLANE_REMOVED_REASON });
  }

  const currentNames = planeEvent.currentNames;
  const currentIds = planeEvent.currentIds;
  const previousNames = planeEvent.previousNames;
  const previousIds = planeEvent.previousIds;

  if (
    labelJustAdded({
      currentNames,
      currentIds,
      previousNames,
      previousIds,
      action: planeEvent.action,
      name: APPROVED_LABEL,
      id: env.PLANE_APPROVED_LABEL_ID,
    })
  ) {
    const run = await findAwaitingApprovalRunForCard('plane', cardId);
    if (!run) {
      return c.json(
        skipPlaneWebhook('nenhum run aguardando aprovação', {
          action: planeEvent.action,
          event: planeEvent.event,
          cardId,
          cardIdentifier: planeEvent.cardIdentifier,
          currentNames,
          currentIds,
          previousNames,
          previousIds,
        }),
      );
    }
    await resolveApproval(run.id, 'approved', 'plane');
    await updateRunStatus(run.id, 'executing');
    await agentQueue.add(
      'resume',
      { kind: 'resume', runId: run.id },
      { priority: JOB_PRIORITY.resume },
    );
    logger.info(
      { runId: run.id, issue: planeEvent.cardIdentifier },
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
      action: planeEvent.action,
      name: AI_READY_LABEL,
      id: env.PLANE_AI_READY_LABEL_ID,
    })
  ) {
    return c.json(
      skipPlaneWebhook(
        planeEvent.previousLabelsPresent ? 'no relevant label transition' : 'previous labels missing',
        {
          action: planeEvent.action,
          event: planeEvent.event,
          cardId,
          cardIdentifier: planeEvent.cardIdentifier,
          currentNames,
          currentIds,
          previousNames,
          previousIds,
        },
      ),
    );
  }

  const result = await handleAiReadyCard({
    provider: 'plane',
    cardId,
    cardIdentifier: planeEvent.cardIdentifier ?? cardId,
    cardProjectId: planeEvent.cardProjectId,
    title: planeEvent.title,
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
