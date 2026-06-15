import { createHmac, timingSafeEqual } from 'node:crypto';
import { Hono } from 'hono';
import { env } from '../env.js';
import { isPaused } from '../killswitch.js';
import { logger } from '../logger.js';
import { JOB_PRIORITY, agentQueue } from '../queue.js';
import {
  costLast24hUsd,
  createRun,
  findAwaitingApprovalRun,
  hasActiveRunForIssue,
  resolveApproval,
  updateRunStatus,
} from '../runs.js';
import { isUniqueViolation } from '../db/pgError.js';

export const webhooks = new Hono();

const AI_READY_LABEL = 'ai-ready';
const APPROVED_LABEL = 'approved';

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

/** A issue tem a label (por nome ou por id)? */
function hasLabel(d: IssueData | undefined, name: string, id: string): boolean {
  const names = d?.labels?.map((l) => l.name) ?? [];
  return names.includes(name) || (d?.labelIds ?? []).includes(id);
}

/** A label foi ADICIONADA neste evento? (create com a label, ou update que a acrescentou) */
function labelJustAdded(p: IssuePayload, name: string, id: string): boolean {
  if (!hasLabel(p.data, name, id)) return false;
  if (p.action !== 'update') return true; // create com a label
  const labelsChanged =
    p.updatedFrom?.labels !== undefined || p.updatedFrom?.labelIds !== undefined;
  const had =
    (p.updatedFrom?.labels?.map((l) => l.name) ?? []).includes(name) ||
    (p.updatedFrom?.labelIds ?? []).includes(id);
  return labelsChanged && !had;
}

/**
 * Valida a assinatura HMAC-SHA256 do webhook do Linear.
 * O Linear envia o header `linear-signature` com o hash do corpo cru.
 */
function verifySignature(rawBody: string, signature: string | undefined): boolean {
  if (!signature) return false;
  const expected = createHmac('sha256', env.LINEAR_WEBHOOK_SECRET).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

webhooks.post('/webhooks/linear', async (c) => {
  const rawBody = await c.req.text();
  const signature = c.req.header('linear-signature');

  if (!verifySignature(rawBody, signature)) {
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
  const identifier = payload.data?.identifier;

  // Approve via Linear (MAC-22): label `approved` adicionada → retoma o run pausado.
  if (labelJustAdded(payload, APPROVED_LABEL, env.LINEAR_APPROVED_LABEL_ID)) {
    const run = await findAwaitingApprovalRun(issueId);
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
  if (!labelJustAdded(payload, AI_READY_LABEL, env.LINEAR_AI_READY_LABEL_ID)) {
    return c.json({ ok: true, skipped: true });
  }

  // Dedup: já há um run ativo (não-terminal) para esta issue → ignora duplicata.
  if (await hasActiveRunForIssue(issueId)) {
    logger.warn({ issue: identifier }, 'run ativo já existe; ignorando duplicata');
    return c.json({ ok: true, skipped: true, reason: 'active run already exists' });
  }

  // Kill switch (MAC-32): pausado → não cria nem enfileira nada.
  if (await isPaused()) {
    logger.warn({ issue: payload.data?.identifier }, 'agents paused; ai-ready ignorado');
    return c.json({ ok: true, skipped: true, reason: 'agents paused' });
  }

  // Cost Guard (MAC-40): limite de sessão (24h) estourado → bloqueia novos runs.
  const spent = await costLast24hUsd();
  if (spent >= env.AGENT_MAX_COST_PER_DAY_USD) {
    logger.warn({ spent, limit: env.AGENT_MAX_COST_PER_DAY_USD }, 'orçamento diário estourado');
    return c.json({ ok: true, skipped: true, reason: 'daily cost budget exceeded' });
  }

  // Cria o run e enfileira; a execução longa roda no worker (MAC-20).
  let runId: string;
  try {
    runId = await createRun({
      linearIssueId: issueId,
      linearIssueIdentifier: payload.data?.identifier ?? issueId,
      title: payload.data?.title ?? '(sem título)',
    });
  } catch (err) {
    // MAC-47: índice único de issue ativa — webhook concorrente da mesma issue.
    if (isUniqueViolation(err)) {
      logger.warn({ issue: identifier }, 'run ativo já existe (índice); ignorando duplicata');
      return c.json({ ok: true, skipped: true, reason: 'active run exists' });
    }
    throw err;
  }
  await agentQueue.add('plan', { kind: 'plan', runId, issueId }, { priority: JOB_PRIORITY.plan });

  logger.info(
    { runId, issue: payload.data?.identifier, action: payload.action },
    'ai-ready issue enqueued',
  );
  return c.json({ ok: true, queued: true, runId });
});
