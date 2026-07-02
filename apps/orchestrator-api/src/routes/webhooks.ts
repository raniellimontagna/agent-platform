import { Hono } from 'hono';
import { labelJustAdded } from '../cardWebhook.js';
import { env } from '../env.js';
import { hasRepoCreateLabel } from '../generatedRepos.js';
import { logger } from '../logger.js';
import { type PlanePayload, normalizePlaneWebhook } from '../planeWebhook.js';
import {
  handleAiReadyCard,
  handleApprovalCard,
  handleRemovedPlaneCard,
} from '../webhookRunActions.js';
import { verifyPlaneSignature, verifySignature } from '../webhookSignature.js';

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
    const result = await handleApprovalCard({
      provider: 'linear',
      cardId: issueId,
      cardIdentifier: identifier,
    });
    return c.json({ ok: true, ...result });
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
    const result = await handleRemovedPlaneCard({
      cardId,
      cardIdentifier: planeEvent.cardIdentifier,
      action: planeEvent.action,
      event: planeEvent.event,
    });
    return c.json({ ok: true, ...result });
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
    const result = await handleApprovalCard({
      provider: 'plane',
      cardId,
      cardIdentifier: planeEvent.cardIdentifier ?? cardId,
    });
    if ('skipped' in result) {
      return c.json(
        skipPlaneWebhook(result.reason, {
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
    return c.json({ ok: true, ...result });
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
        planeEvent.previousLabelsPresent
          ? 'no relevant label transition'
          : 'previous labels missing',
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
