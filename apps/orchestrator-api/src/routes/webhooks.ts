import { createHmac, timingSafeEqual } from 'node:crypto';
import { Hono } from 'hono';
import { env } from '../env.js';
import { isPaused } from '../killswitch.js';
import { logger } from '../logger.js';
import { JOB_PRIORITY, agentQueue } from '../queue.js';
import { costLast24hUsd, createRun, hasActiveRunForIssue } from '../runs.js';

export const webhooks = new Hono();

/** Label que dispara o fluxo do agente — ver ADR-0005. */
const AI_READY_LABEL = 'ai-ready';

/** A issue tem a label ai-ready? (por nome ou por id). */
function hasAiReady(labels?: { name: string }[], labelIds?: string[]): boolean {
  const names = labels?.map((l) => l.name) ?? [];
  return names.includes(AI_READY_LABEL) || (labelIds ?? []).includes(env.LINEAR_AI_READY_LABEL_ID);
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
    // Valores ANTERIORES dos campos alterados (só em `update`).
    updatedFrom?: { labels?: { name: string }[]; labelIds?: string[] };
  };

  if (payload.type !== 'Issue') {
    return c.json({ ok: true, skipped: true });
  }

  const nowAiReady = hasAiReady(payload.data?.labels, payload.data?.labelIds);
  if (!nowAiReady) {
    return c.json({ ok: true, skipped: true });
  }

  // Só dispara quando a label foi ADICIONADA agora — não em toda edição de uma
  // issue que já tinha ai-ready. `create` com a label conta; `update` só se a
  // mudança foi nos labels e antes NÃO tinha ai-ready.
  if (payload.action === 'update') {
    const labelsChanged =
      payload.updatedFrom?.labels !== undefined || payload.updatedFrom?.labelIds !== undefined;
    const wasAiReady = hasAiReady(payload.updatedFrom?.labels, payload.updatedFrom?.labelIds);
    if (!labelsChanged || wasAiReady) {
      return c.json({
        ok: true,
        skipped: true,
        reason: 'ai-ready não foi adicionado neste update',
      });
    }
  }

  const issueId = payload.data?.id;
  if (!issueId) {
    return c.json({ ok: true, skipped: true, reason: 'no issue id' });
  }

  // Dedup: já há um run ativo (não-terminal) para esta issue → ignora duplicata.
  if (await hasActiveRunForIssue(issueId)) {
    logger.warn({ issue: payload.data?.identifier }, 'run ativo já existe; ignorando duplicata');
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
