import type { CardProvider } from '@agent-platform/cards';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { resolveDefaultAgent } from './agents.js';
import { db, schema } from './db/client.js';

export type RunStatus = (typeof schema.runStatus.enumValues)[number];
export type StepType = (typeof schema.stepType.enumValues)[number];
export type StepStatus = (typeof schema.stepStatus.enumValues)[number];
export type ApprovalReason = (typeof schema.approvalReason.enumValues)[number];

export interface RunStats {
  total_runs: number;
  runs_by_status: Partial<Record<RunStatus, number>>;
  success_rate: number;
  total_cost_usd: number;
  cost_last_24h_usd: number;
  total_lessons: number;
  avg_fix_attempts: number;
}

/** Status não-terminais — um run nesses ainda está em andamento. */
export const ACTIVE_STATUSES: RunStatus[] = [
  'pending',
  'planning',
  'awaiting_approval',
  'executing',
  'reviewing',
];

/** Contagem de runs por status (MAC-47, observabilidade de concorrência). */
export async function countRunsByStatus(): Promise<Partial<Record<RunStatus, number>>> {
  const rows = await db
    .select({ status: schema.runs.status, count: sql<number>`count(*)::int` })
    .from(schema.runs)
    .groupBy(schema.runs.status);
  const out: Partial<Record<RunStatus, number>> = {};
  for (const r of rows) out[r.status as RunStatus] = r.count;
  return out;
}

export interface NewRunInput {
  linearIssueId?: string;
  linearIssueIdentifier?: string;
  cardProvider?: CardProvider;
  cardId?: string;
  cardIdentifier?: string;
  cardProjectId?: string;
  title: string;
  /** Agendamento que originou o run (MAC-38). */
  scheduleId?: string;
  /** Run pode ser auto-aprovado se não houver motivo crítico (MAC-38). */
  autoApprove?: boolean;
  /** Issue marcada com a label auto-merge (opt-in de merge automático). */
  autoMerge?: boolean;
  /** Agente que vai rodar (MAC-42). Default = agente vigente da key padrão. */
  agentId?: string;
  /** Workflow composto que originou/guia o run. */
  workflow?: string;
  /** Repo alvo opcional no formato owner/repo. */
  targetRepo?: string;
  /** Workflow pode criar repo gerado quando chegar na etapa final. */
  targetRepoCreate?: boolean;
}

export function resolveRunCardFields(
  input: Pick<
    NewRunInput,
    'linearIssueId' | 'linearIssueIdentifier' | 'cardProvider' | 'cardId' | 'cardIdentifier'
  >,
): {
  cardProvider: CardProvider;
  cardId: string;
  cardIdentifier: string;
} {
  return {
    cardProvider: input.cardProvider ?? 'linear',
    cardId: input.cardId ?? input.linearIssueId ?? '',
    cardIdentifier: input.cardIdentifier ?? input.linearIssueIdentifier ?? '',
  };
}

/** Cria o registro do run (MAC-36) e devolve o id. */
export async function createRun(input: NewRunInput): Promise<string> {
  // MAC-42: grava a versão exata do agente que rodou. Resolve o default quando o
  // chamador não passa um. Sem agente active (não deve ocorrer pós-seed) → null,
  // não bloqueia o run.
  const agentId = input.agentId ?? (await resolveDefaultAgent())?.id;
  const { cardProvider, cardId, cardIdentifier } = resolveRunCardFields(input);
  if (!cardId || !cardIdentifier) {
    throw new Error('createRun requires cardId/cardIdentifier or legacy Linear issue fields');
  }
  const [row] = await db
    .insert(schema.runs)
    .values({
      linearIssueId: input.linearIssueId ?? cardId,
      linearIssueIdentifier: input.linearIssueIdentifier ?? cardIdentifier,
      cardProvider,
      cardId,
      cardIdentifier,
      ...(input.cardProjectId ? { cardProjectId: input.cardProjectId } : {}),
      title: input.title,
      status: 'pending',
      ...(input.scheduleId ? { scheduleId: input.scheduleId } : {}),
      ...(input.autoApprove !== undefined ? { autoApprove: input.autoApprove } : {}),
      ...(input.autoMerge !== undefined ? { autoMerge: input.autoMerge } : {}),
      ...(agentId ? { agentId } : {}),
      ...(input.workflow ? { workflow: input.workflow } : {}),
      ...(input.targetRepo ? { targetRepo: input.targetRepo } : {}),
      ...(input.targetRepoCreate !== undefined ? { targetRepoCreate: input.targetRepoCreate } : {}),
    })
    .returning({ id: schema.runs.id });
  // biome-ignore lint/style/noNonNullAssertion: insert ... returning sempre retorna a linha
  return row!.id;
}

/** Já existe um run ativo (não-terminal) para esta issue? Dedup do webhook. */
export async function hasActiveRunForIssue(linearIssueId: string): Promise<boolean> {
  return hasActiveRunForCard('linear', linearIssueId);
}

export async function hasActiveRunForCard(
  cardProvider: CardProvider,
  cardId: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: schema.runs.id })
    .from(schema.runs)
    .where(
      and(
        eq(schema.runs.cardProvider, cardProvider),
        eq(schema.runs.cardId, cardId),
        inArray(schema.runs.status, ACTIVE_STATUSES),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/** Run em `awaiting_approval` para esta issue — alvo do approve via Linear (MAC-22). */
export async function findAwaitingApprovalRun(
  linearIssueId: string,
): Promise<{ id: string } | null> {
  return findAwaitingApprovalRunForCard('linear', linearIssueId);
}

export async function findAwaitingApprovalRunForCard(
  cardProvider: CardProvider,
  cardId: string,
): Promise<{ id: string } | null> {
  const [row] = await db
    .select({ id: schema.runs.id })
    .from(schema.runs)
    .where(
      and(
        eq(schema.runs.cardProvider, cardProvider),
        eq(schema.runs.cardId, cardId),
        eq(schema.runs.status, 'awaiting_approval'),
      ),
    )
    .orderBy(desc(schema.runs.createdAt))
    .limit(1);
  return row ?? null;
}

/** Lê um run pelo id (null se não existir). */
export async function getRun(id: string) {
  const [row] = await db.select().from(schema.runs).where(eq(schema.runs.id, id)).limit(1);
  return row ?? null;
}

export async function updateRunStatus(
  runId: string,
  status: RunStatus,
  extra?: {
    error?: string;
    branch?: string;
    prUrl?: string;
    testsPassed?: boolean;
    verdict?: string;
    fixAttempts?: number;
    sandbox?: {
      backend: 'process' | 'docker';
      image?: string;
      network?: string;
      commandCount: number;
      totalDurationMs: number;
      maxCommandDurationMs: number;
      failedCommand?: string;
    };
  },
): Promise<void> {
  await db
    .update(schema.runs)
    .set({
      status,
      ...(extra?.error ? { error: extra.error } : {}),
      ...(extra?.branch !== undefined ? { branch: extra.branch } : {}),
      ...(extra?.prUrl !== undefined ? { prUrl: extra.prUrl } : {}),
      ...(extra?.testsPassed !== undefined ? { testsPassed: extra.testsPassed } : {}),
      ...(extra?.verdict !== undefined ? { verdict: extra.verdict } : {}),
      ...(extra?.fixAttempts !== undefined ? { fixAttempts: extra.fixAttempts } : {}),
      ...(extra?.sandbox
        ? {
            sandboxBackend: extra.sandbox.backend,
            sandboxImage: extra.sandbox.image,
            sandboxNetwork: extra.sandbox.network,
            sandboxCommandCount: extra.sandbox.commandCount,
            sandboxTotalDurationMs: extra.sandbox.totalDurationMs,
            sandboxMaxCommandDurationMs: extra.sandbox.maxCommandDurationMs,
            sandboxFailedCommand: extra.sandbox.failedCommand,
          }
        : {}),
    })
    .where(eq(schema.runs.id, runId));
}

/** Histórico de execuções, mais recentes primeiro (MAC-36). */
export async function listRuns(limit = 50, offset = 0) {
  return db
    .select()
    .from(schema.runs)
    .orderBy(desc(schema.runs.createdAt))
    .limit(limit)
    .offset(offset);
}

/** Histórico de runs de um agendamento, mais recentes primeiro (MAC-38). */
export async function listRunsBySchedule(scheduleId: string, limit = 50) {
  return db
    .select()
    .from(schema.runs)
    .where(eq(schema.runs.scheduleId, scheduleId))
    .orderBy(desc(schema.runs.createdAt))
    .limit(limit);
}

/** Histórico recente de runs de um card específico, para auditoria de webhooks. */
export async function listRunsForCard(cardProvider: CardProvider, cardId: string, limit = 20) {
  return db
    .select()
    .from(schema.runs)
    .where(and(eq(schema.runs.cardProvider, cardProvider), eq(schema.runs.cardId, cardId)))
    .orderBy(desc(schema.runs.createdAt))
    .limit(limit);
}

/** Cancela todos os runs ativos de um card removido/arquivado no provider. */
export async function cancelActiveRunsForCard(
  cardProvider: CardProvider,
  cardId: string,
  reason: string,
): Promise<number> {
  const rows = await db
    .update(schema.runs)
    .set({ status: 'cancelled', error: reason })
    .where(
      and(
        eq(schema.runs.cardProvider, cardProvider),
        eq(schema.runs.cardId, cardId),
        inArray(schema.runs.status, ACTIVE_STATUSES),
      ),
    )
    .returning({ id: schema.runs.id });
  return rows.length;
}

/** Resumo agregado das execuções do agente para dashboards/API. */
export async function runStats(): Promise<RunStats> {
  const statusRows = await db
    .select({
      status: schema.runs.status,
      count: sql<string>`count(*)`,
    })
    .from(schema.runs)
    .groupBy(schema.runs.status);

  const [costRow] = await db
    .select({
      totalCostUsd: sql<string>`coalesce(sum(${schema.runSteps.costUsd}), 0)`,
      costLast24hUsd: sql<string>`coalesce(sum(case when ${schema.runSteps.createdAt} >= now() - interval '24 hours' then ${schema.runSteps.costUsd} else 0 end), 0)`,
    })
    .from(schema.runSteps);

  const [lessonsRow] = await db.select({ total: sql<string>`count(*)` }).from(schema.lessons);

  const [fixAttemptsRow] = await db
    .select({ avg: sql<string>`coalesce(avg(${schema.runs.fixAttempts}), 0)` })
    .from(schema.runs);

  const runsByStatus = statusRows.reduce<Partial<Record<RunStatus, number>>>((acc, row) => {
    acc[row.status] = Number(row.count);
    return acc;
  }, {});

  const totalRuns = Object.values(runsByStatus).reduce((sum, count) => sum + count, 0);
  const completedRuns = runsByStatus.completed ?? 0;

  return {
    total_runs: totalRuns,
    runs_by_status: runsByStatus,
    success_rate: totalRuns > 0 ? (completedRuns / totalRuns) * 100 : 0,
    total_cost_usd: Number(costRow?.totalCostUsd ?? 0),
    cost_last_24h_usd: Number(costRow?.costLast24hUsd ?? 0),
    total_lessons: Number(lessonsRow?.total ?? 0),
    avg_fix_attempts: Number(fixAttemptsRow?.avg ?? 0),
  };
}

/**
 * Runs órfãos em `executing` (interrompidos por restart) — têm checkpoint e
 * podem retomar com segurança via resume (MAC-34). `awaiting_approval` espera
 * humano; `planning` é deixado de fora pra não duplicar o comentário do plano.
 */
export async function findResumableRuns(): Promise<{ id: string }[]> {
  return db
    .select({ id: schema.runs.id })
    .from(schema.runs)
    .where(eq(schema.runs.status, 'executing'));
}

/** Registra uma etapa executada com tempo, resultado e custo (MAC-36/40). */
export async function recordStep(input: {
  runId: string;
  type: StepType;
  status: StepStatus;
  startedAt: Date;
  error?: string;
  model?: string;
  costUsd?: number;
}): Promise<void> {
  await db.insert(schema.runSteps).values({
    runId: input.runId,
    type: input.type,
    status: input.status,
    startedAt: input.startedAt,
    finishedAt: new Date(),
    error: input.error,
    model: input.model,
    costUsd: input.costUsd !== undefined ? input.costUsd.toFixed(4) : undefined,
  });
}

/** Custo total (USD) de um run, somando os steps (MAC-40). */
export async function runCostUsd(runId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${schema.runSteps.costUsd}), 0)` })
    .from(schema.runSteps)
    .where(eq(schema.runSteps.runId, runId));
  return Number(row?.total ?? 0);
}

/** Custos por step de um run, em ordem de criação. */
export async function listRunStepCosts(
  runId: string,
): Promise<Array<{ type: StepType; costUsd: number }>> {
  const rows = await db
    .select({
      type: schema.runSteps.type,
      costUsd: schema.runSteps.costUsd,
    })
    .from(schema.runSteps)
    .where(eq(schema.runSteps.runId, runId))
    .orderBy(schema.runSteps.createdAt);

  return rows.map((row) => ({
    type: row.type,
    costUsd: Number(row.costUsd ?? 0),
  }));
}

/** Custo total (USD) das últimas 24h — limite de sessão do Cost Guard (MAC-40). */
export async function costLast24hUsd(): Promise<number> {
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${schema.runSteps.costUsd}), 0)` })
    .from(schema.runSteps)
    .where(sql`${schema.runSteps.createdAt} >= now() - interval '24 hours'`);
  return Number(row?.total ?? 0);
}

/**
 * Registra a solicitação de aprovação de um run (MAC-41). `reason` é o motivo
 * crítico principal (ou `plan`); o `summary` lista todos os motivos detectados.
 */
export async function recordApproval(
  runId: string,
  reasons: string[],
  summary: string,
): Promise<void> {
  const critical = reasons.find((r) => r !== 'plan');
  const reason = (critical ?? 'plan') as ApprovalReason;
  await db.insert(schema.approvals).values({ runId, reason, summary, status: 'pending' });
}

/** Resolve a aprovação pendente de um run (MAC-41/22). */
export async function resolveApproval(
  runId: string,
  status: 'approved' | 'rejected',
  resolvedBy: string,
): Promise<void> {
  await db
    .update(schema.approvals)
    .set({ status, resolvedAt: new Date(), resolvedBy })
    .where(and(eq(schema.approvals.runId, runId), eq(schema.approvals.status, 'pending')));
}

/** Aprovações de um run (MAC-41). */
export async function listApprovals(runId: string) {
  return db.select().from(schema.approvals).where(eq(schema.approvals.runId, runId));
}

/** Etapas de um run, em ordem de criação (MAC-36). */
export async function listSteps(runId: string) {
  return db
    .select()
    .from(schema.runSteps)
    .where(eq(schema.runSteps.runId, runId))
    .orderBy(schema.runSteps.createdAt);
}
