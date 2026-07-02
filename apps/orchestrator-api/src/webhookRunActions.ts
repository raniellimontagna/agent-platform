import type { CardProvider } from '@agent-platform/cards';
import { DATA_COLLECTOR_AGENT_KEY, agentKeyFromLabels, resolveAgentByKey } from './agents.js';
import { isUniqueViolation } from './db/pgError.js';
import { env } from './env.js';
import { isPaused } from './killswitch.js';
import { logger } from './logger.js';
import { JOB_PRIORITY, agentQueue } from './queue.js';
import {
  cancelActiveRunsForCard,
  costLast24hUsd,
  createRun,
  findAwaitingApprovalRunForCard,
  hasActiveRunForCard,
  resolveApproval,
  updateRunStatus,
} from './runs.js';
import { workflowFromLabels } from './workflows.js';

export const PLANE_REMOVED_REASON = 'plane work item removed';

export type ApprovalActionResult =
  | { skipped: true; reason: 'nenhum run aguardando aprovação' }
  | { resumed: true; runId: string };

export async function handleAiReadyCard(input: {
  provider: CardProvider;
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

export async function handleApprovalCard(input: {
  provider: CardProvider;
  cardId: string;
  cardIdentifier: string;
}): Promise<ApprovalActionResult> {
  const run = await findAwaitingApprovalRunForCard(input.provider, input.cardId);
  if (!run) {
    return { skipped: true, reason: 'nenhum run aguardando aprovação' } as const;
  }

  await resolveApproval(run.id, 'approved', input.provider);
  await updateRunStatus(run.id, 'executing');
  await agentQueue.add(
    'resume',
    { kind: 'resume', runId: run.id },
    { priority: JOB_PRIORITY.resume },
  );
  logger.info(
    { runId: run.id, issue: input.cardIdentifier },
    `run approved via ${input.provider === 'plane' ? 'Plane' : 'Linear'}, resuming`,
  );
  return { resumed: true, runId: run.id } as const;
}

export async function handleRemovedPlaneCard(input: {
  cardId: string;
  cardIdentifier?: string;
  action?: string;
  event?: string;
}) {
  const cancelled = await cancelActiveRunsForCard('plane', input.cardId, PLANE_REMOVED_REASON);
  logger.info(
    {
      provider: 'plane',
      action: input.action,
      event: input.event,
      cardId: input.cardId,
      cardIdentifier: input.cardIdentifier,
      cancelled,
    },
    'Plane work item removed; active runs cancelled',
  );
  return { cancelled, reason: PLANE_REMOVED_REASON } as const;
}
