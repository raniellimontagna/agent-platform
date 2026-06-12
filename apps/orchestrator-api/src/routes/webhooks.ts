import { createHmac, timingSafeEqual } from 'node:crypto';
import { Hono } from 'hono';
import { env } from '../env.js';
import { isPaused } from '../killswitch.js';
import { logger } from '../logger.js';
import { JOB_PRIORITY, agentQueue } from '../queue.js';
import { costLast24hUsd, createRun } from '../runs.js';

export const webhooks = new Hono();

/** Label que dispara o fluxo do agente — ver ADR-0005. */
const AI_READY_LABEL = 'ai-ready';

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

  const payload = JSON.parse(rawBody) as {
    action: string;
    type: string;
    data?: {
      id?: string;
      identifier?: string;
      title?: string;
      labels?: { name: string }[];
      labelIds?: string[];
    };
  };

  // Robusto aos dois formatos do payload do Linear: por nome (`labels[].name`)
  // ou por id (`labelIds[]` vs LINEAR_AI_READY_LABEL_ID).
  const labelNames = payload.data?.labels?.map((l) => l.name) ?? [];
  const labelIds = payload.data?.labelIds ?? [];
  const isAiReady =
    labelNames.includes(AI_READY_LABEL) || labelIds.includes(env.LINEAR_AI_READY_LABEL_ID);

  // Só reage a issues que ganharam a label ai-ready.
  if (payload.type !== 'Issue' || !isAiReady) {
    return c.json({ ok: true, skipped: true });
  }

  const issueId = payload.data?.id;
  if (!issueId) {
    return c.json({ ok: true, skipped: true, reason: 'no issue id' });
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
  const runId = await createRun({
    linearIssueId: issueId,
    linearIssueIdentifier: payload.data?.identifier ?? issueId,
    title: payload.data?.title ?? '(sem título)',
  });
  await agentQueue.add('plan', { kind: 'plan', runId, issueId }, { priority: JOB_PRIORITY.plan });

  logger.info(
    { runId, issue: payload.data?.identifier, action: payload.action },
    'ai-ready issue enqueued',
  );
  return c.json({ ok: true, queued: true, runId });
});
