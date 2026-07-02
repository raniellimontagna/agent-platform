# Phase 4: Operational Flow Reorganization - Pattern Map

**Mapped:** 2026-07-02
**Files analyzed:** 35 likely new/modified files
**Analogs found:** 35 / 35
**Roadmap plans:** `04-01` flow documentation/tests, `04-02` naming/source-of-truth normalization

## Scope Read

Phase 4 should reorganize the active operational flow without doing the large code hub refactors reserved for Phases 5 and 6. Phase 3 established Plane as the active provider, retained Linear only as compatibility/migration/rollback, and made generic `card_*` fields authoritative for new runs. `04-RESEARCH.md` identifies one clear FLOW-03 gap: scheduler has code/tests and architecture mentions, but no dedicated active scheduler runbook.

No repo-local `.codex/skills/` or `.agents/skills/` directories exist. Project-level instructions come from `AGENTS.md` -> `CLAUDE.md`; every project command must be prefixed with `rtk`, and unrelated dirty/untracked work must be preserved.

## File Classification

| Likely New/Modified File | Plan | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|---|
| `docs/CURRENT.md` | 04-01, 04-02 | documentation | request-response + event-driven summary | `docs/CURRENT.md`, `docs/ARCHITECTURE.md` | exact |
| `docs/ARCHITECTURE.md` | 04-01 | documentation | event-driven workflow map | `docs/ARCHITECTURE.md`, `docs/decisions/FLOW-agent-workflow.md` | exact |
| `docs/decisions/FLOW-agent-workflow.md` | 04-01 | documentation | event-driven workflow map | `docs/ARCHITECTURE.md`, `packages/graph/src/build.ts` | exact |
| `docs/README.md` | 04-02 | documentation index | navigation/source-of-truth | `docs/README.md`, `docs/runbooks/README.md` | exact |
| `docs/HISTORICAL.md` | 04-02 | documentation index | archive classification | `docs/HISTORICAL.md` | exact |
| `docs/runbooks/README.md` | 04-02 | runbook index | navigation/source-of-truth | `docs/runbooks/README.md` | exact |
| `docs/runbooks/webhook-tailscale.md` | 04-01 | runbook | request-response webhook intake | `apps/orchestrator-api/src/routes/webhooks.ts`, `webhooks.test.ts` | exact |
| `docs/runbooks/research-to-landing-workflow.md` | 04-01 | runbook | event-driven continuation | `apps/orchestrator-api/src/workflows.ts`, `worker.ts` | exact |
| `docs/runbooks/mission-control.md` | 04-01, 04-02 | runbook | request-response read-only inspection | `routes/admin.ts`, `admin.test.ts` | exact |
| `docs/runbooks/scheduler.md` | 04-01, 04-02 | runbook | scheduled batch/event-driven | `routes/schedules.ts`, `scheduleWorker.ts` | role-match |
| `docs/runbooks/eval-harness.md` | 04-02 | runbook | batch verification | `apps/worker-code/src/eval/runEval.ts`, `runEval.test.ts` | exact |
| `docs/runbooks/agent-skills.md` | 04-02 | runbook | config registry/file-I/O | `agent-skills/registry.json`, `agentSkills.ts` | exact |
| `docs/runbooks/data-collector-agent.md` | 04-01 | runbook | research artifact generation | `runJob.ts`, `workflows.ts` | role-match |
| `docs/runbooks/artifact-store.md` or artifact-store section in current docs | 04-01, 04-02 | runbook/documentation | artifact CRUD/read-only | `artifacts.ts`, `routes/artifacts.ts`, `missionTimeline.ts` | role-match |
| `docs/runbooks/plane-migration-2026-06-20.md` | 04-02 | migration record | label/source-of-truth | existing same file | exact |
| `docs/runbooks/secrets.md` | 04-02 | runbook | env/config source-of-truth | existing same file | exact |
| `apps/orchestrator-api/src/routes/webhooks.test.ts` | 04-01 | test | request-response + event-driven | same file | exact |
| `apps/orchestrator-api/src/worker.test.ts` | 04-01 | test | queue/event-driven | same file | exact |
| `apps/orchestrator-api/src/workflows.test.ts` | 04-01 | test | transform/continuation | same file | exact |
| `apps/orchestrator-api/src/routes/schedules.ts` | 04-01 | route | scheduler CRUD/request-response | same file | exact |
| `apps/orchestrator-api/src/routes/schedules.test.ts` | 04-01 | test | scheduler CRUD/request-response | same file | exact |
| `apps/orchestrator-api/src/schedules.ts` | 04-01 | service | schedule CRUD | same file | exact |
| `apps/orchestrator-api/src/scheduleQueue.ts` | 04-01 | service | scheduled queue | same file | exact |
| `apps/orchestrator-api/src/routes/admin.test.ts` | 04-01 | test | request-response/read-only UI | same file | exact |
| `apps/orchestrator-api/src/missionScenarios.test.ts` | 04-01 | test | registry/transform | same file | exact |
| `apps/orchestrator-api/src/missionTimeline.test.ts` | 04-01 | test | transform | same file | exact |
| `apps/orchestrator-api/src/runs.test.ts` | 04-01 | test | CRUD/compatibility | same file | exact |
| `apps/orchestrator-api/src/queue.test.ts` | 04-01 | test | queue/compatibility | same file | exact |
| `apps/orchestrator-api/src/artifacts.test.ts` | 04-01 | test | artifact CRUD | same file | exact |
| `apps/orchestrator-api/src/routes/artifacts.test.ts` | 04-01 | test | request-response artifact read | same file | exact |
| `apps/worker-code/src/executor/agentSkills.test.ts` | 04-02 | test | registry/file-I/O | same file | exact |
| `apps/worker-code/src/eval/runEval.test.ts` | 04-02 | test | batch transform/report | same file | exact |
| `apps/worker-code/src/eval/roleQuality.test.ts` | 04-02 | test | transform/scoring | same file | exact |
| `apps/orchestrator-api/src/workflows.ts` | 04-02 | utility | label -> workflow transform | same file | exact |
| `apps/orchestrator-api/src/agents.ts` | 04-02 | registry/model | label -> agent + role source | same file | exact |
| `agent-skills/registry.json` | 04-02 | config | agent -> skills mapping | same file, `agentSkills.ts` | exact |
| `packages/llm/src/index.ts` | 04-02 | config | model alias source | same file | exact |
| `packages/graph/src/roleModels.ts` | 04-02 | config | role -> model alias mapping | same file | exact |

## Pattern Assignments

### Plan `04-01`: Consolidate Flow Documentation And Align It With Tests And Code Entry Points

**Likely ownership:** docs and characterization tests only. Production files below should be treated as canonical sources unless a narrow test-supporting change is required.

#### Main Plane Delivery Flow

**Use this code flow as the canonical sequence:** Plane webhook -> `createRun` -> BullMQ `plan` job -> worker plan/resume -> graph nodes -> worker-code runner -> PR/merge/report -> Plane comment/status.

**Analog:** `apps/orchestrator-api/src/routes/webhooks.ts`

**Imports and dependencies pattern** (lines 1-20):

```typescript
import { Hono } from 'hono';
import { DATA_COLLECTOR_AGENT_KEY, agentKeyFromLabels, resolveAgentByKey } from '../agents.js';
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
```

**Webhook enqueue pattern** (lines 181-222):

```typescript
const workflow = workflowFromLabels(input.labels);
const agentKey = workflow ? DATA_COLLECTOR_AGENT_KEY : agentKeyFromLabels(input.labels);
const agent = await resolveAgentByKey(agentKey);

runId = await createRun({
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

await agentQueue.add(
  'plan',
  {
    kind: 'plan',
    runId,
    cardProvider: input.provider,
    cardId: input.cardId,
  },
  { priority: JOB_PRIORITY.plan },
);
```

**Plane intake and approval pattern** (lines 332-470):

```typescript
webhooks.post('/webhooks/plane', async (c) => {
  const rawBody = await c.req.text();
  const signature = c.req.header('x-plane-signature');
  const eventHeader = c.req.header('x-plane-event');

  if (!verifyPlaneSignature(rawBody, signature)) {
    return c.json({ error: 'invalid signature' }, 401);
  }

  // approved label resumes an awaiting run
  // ai-ready label creates a run and enqueues a plan job
});
```

**Test analog:** `apps/orchestrator-api/src/routes/webhooks.test.ts`

**Plane enqueue test pattern** (lines 328-368):

```typescript
it('POST /webhooks/plane enqueues ai-ready work item', async () => {
  vi.mocked(resolveAgentByKey).mockResolvedValue({ id: 'agent-id' } as never);
  vi.mocked(createRun).mockResolvedValue('run-plane');

  const res = await app.request('/webhooks/plane', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-plane-signature': signed(body) },
    body,
  });

  expect(createRun).toHaveBeenCalledWith(
    expect.objectContaining({
      cardProvider: 'plane',
      cardId: 'plane-work-1',
      cardIdentifier: 'AGP-1',
      cardProjectId: 'plane-project',
      autoMerge: true,
    }),
  );
  expect(agentQueue.add).toHaveBeenCalledWith(
    'plan',
    { kind: 'plan', runId: 'run-plane', cardProvider: 'plane', cardId: 'plane-work-1' },
    { priority: 10 },
  );
});
```

**Approval/cancellation/skip coverage to preserve:** `webhooks.test.ts` lines 418-450 covers `approved` resume, lines 453-488 covers delete cancellation, lines 553-611 cover non-transition skips. Plan 04-01 should cite these when documenting webhook behavior.

#### Run Identity And Persistence

**Analog:** `apps/orchestrator-api/src/runs.ts`

**Card identity compatibility pattern** (lines 65-119):

```typescript
export function resolveRunCardFields(input: Pick<NewRunInput, 'linearIssueId' | 'linearIssueIdentifier' | 'cardProvider' | 'cardId' | 'cardIdentifier'>) {
  const hasGenericIdentity = input.cardId !== undefined || input.cardIdentifier !== undefined;
  const hasLegacyIdentity =
    input.linearIssueId !== undefined || input.linearIssueIdentifier !== undefined;

  if (input.cardProvider === 'linear') {
    // keep legacy explicit Linear rows readable, reject conflicts
  }

  if (input.cardProvider === 'plane' || hasGenericIdentity) {
    return requireCompleteIdentity('plane', input.cardId, input.cardIdentifier);
  }

  if (hasLegacyIdentity) {
    return requireCompleteIdentity('linear', input.linearIssueId, input.linearIssueIdentifier);
  }
}
```

**Create run pattern** (lines 121-153):

```typescript
const agentId = input.agentId ?? (await resolveDefaultAgent())?.id;
const { cardProvider, cardId, cardIdentifier } = resolveRunCardFields(input);
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
    ...(agentId ? { agentId } : {}),
    ...(input.workflow ? { workflow: input.workflow } : {}),
  })
  .returning({ id: schema.runs.id });
```

**Run history/cancellation pattern** (lines 276-303):

```typescript
export async function listRunsForCard(cardProvider: CardProvider, cardId: string, limit = 20) {
  return db
    .select()
    .from(schema.runs)
    .where(and(eq(schema.runs.cardProvider, cardProvider), eq(schema.runs.cardId, cardId)))
    .orderBy(desc(schema.runs.createdAt))
    .limit(limit);
}

export async function cancelActiveRunsForCard(cardProvider: CardProvider, cardId: string, reason: string) {
  const rows = await db
    .update(schema.runs)
    .set({ status: 'cancelled', error: reason })
    .where(and(eq(schema.runs.cardProvider, cardProvider), eq(schema.runs.cardId, cardId), inArray(schema.runs.status, ACTIVE_STATUSES)))
    .returning({ id: schema.runs.id });
  return rows.length;
}
```

**Test analog:** `apps/orchestrator-api/src/runs.test.ts` lines 28-123 for identity resolver and lines 136-153 for cancellation.

#### Queue And Worker Execution

**Analog:** `apps/orchestrator-api/src/queue.ts`

**Queue job shape and priority pattern** (lines 17-35):

```typescript
export type PlanJobData = {
  kind: 'plan';
  runId: string;
  cardProvider?: CardProvider;
  cardId?: string;
  issueId?: string;
  context?: string;
};

export type AgentJobData = PlanJobData | { kind: 'resume'; runId: string };
export const AGENT_QUEUE = 'agent-runs';
export const JOB_PRIORITY = { resume: 1, plan: 2 } as const;
```

**Old job compatibility pattern** (lines 53-80):

```typescript
export function resolvePlanJobCardRef(job, persistedRun): { cardProvider: CardProvider; cardId: string } {
  const explicitProvider = toCardProvider(job.cardProvider);
  const explicitCardId = job.cardId ?? (explicitProvider === 'linear' ? job.issueId : undefined);
  if (explicitProvider && explicitCardId) {
    return { cardProvider: explicitProvider, cardId: explicitCardId };
  }

  const persistedProvider = toCardProvider(persistedRun?.cardProvider);
  const persistedCardId =
    persistedRun?.cardId ??
    (persistedProvider === 'linear' ? persistedRun?.linearIssueId : undefined);
  if (persistedProvider && persistedCardId) {
    return { cardProvider: persistedProvider, cardId: persistedCardId };
  }

  throw new Error(`Plan job${'runId' in job && job.runId ? ` ${job.runId}` : ''} is missing card provider/card id`);
}
```

**Analog:** `apps/orchestrator-api/src/worker.ts`

**Plan/resume processor pattern** (lines 71-149):

```typescript
const worker = new Worker<AgentJobData, unknown, string>(
  AGENT_QUEUE,
  async (job) => {
    const { runId } = job.data;
    const run = await getRun(runId);
    const planCard = job.data.kind === 'plan' ? resolvePlanJobCardRef(job.data, run) : null;
    const config = { configurable: { thread_id: runId } };

    if (job.data.kind === 'plan') {
      const planJobCard = resolvePlanJobCardRef(job.data, run);
      const graph = resolveAgentGraph(agent, planJobCard.cardProvider);
      const cardGateway = cards.forProvider(planJobCard.cardProvider);
      const issue = await cardGateway.getCard(planJobCard.cardId);
      await updateRunStatus(runId, 'planning');
      result = await graph.invoke({ runId, issueId: planJobCard.cardId, issueIdentifier: issue.identifier }, config);
    } else {
      await updateRunStatus(runId, 'executing');
      result = await graph.invoke(null, config);
    }
  },
  { connection, concurrency: env.AGENT_MAX_CONCURRENCY },
);
```

**Status/approval/artifact/continuation pattern:** `worker.ts` lines 152-211 updates run status, records approvals, auto-approves scheduler runs, and records step cost; lines 250-277 persist artifacts and call the continuation hook.

**Test analog:** `apps/orchestrator-api/src/worker.test.ts` lines 230-358. These tests show how to prove old missing-provider jobs resolve from persisted run fields and how research-to-landing continuations enqueue a second plan job.

#### Worker-Code Runner And Result Callback

**Analog:** `apps/worker-code/src/routes/jobs.ts`

**Job route auth and async callback pattern** (lines 9-45):

```typescript
async function requireAuth(c: Context, next: Next) {
  if (c.req.header('authorization') !== `Bearer ${env.RUNNER_AUTH_TOKEN}`) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  await next();
}

jobs.post('/jobs', async (c) => {
  const parsed = jobSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: 'invalid job', issues: parsed.error.issues }, 400);
  }
  const job = parsed.data;
  void runAndReport(job);
  return c.json({ accepted: true, runId: job.runId }, 202);
});
```

**Analog:** `apps/worker-code/src/executor/runJob.ts`

**Data collector vs codegen flow pattern** (lines 181-219):

```typescript
export async function runJob(job: Job): Promise<JobResult> {
  const log = logger.child({ runId: job.runId, issue: job.issueIdentifier });
  const commands: CommandResult[] = [];
  const base: JobResult = { runId: job.runId, status: 'failed', branch: job.branch, commands };

  try {
    if (job.agentKey === DATA_COLLECTOR_AGENT_KEY) {
      if (shouldUsePlaywrightResearch(job)) {
        return await runPlaywrightResearchJob(job, { timeoutMs: env.PLAYWRIGHT_TIMEOUT_MS });
      }
      return await runFirecrawlResearchJob(job, { apiKey: env.FIRECRAWL_API_KEY });
    }

    // normal codegen, validation, self-correction, commit, push
  } finally {
    await cleanupWorktree(job.runId);
  }
}
```

**Result callback pattern** (lines 474-492):

```typescript
export async function reportResult(result: JobResult): Promise<void> {
  const url = `${env.ORCHESTRATOR_BASE_URL}/runs/${result.runId}/result`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${env.RUNNER_AUTH_TOKEN}`,
    },
    body: JSON.stringify(result),
  });
  if (!res.ok) {
    logger.error({ status: res.status, runId: result.runId }, 'failed to report result');
  }
}
```

#### Graph, PR, Merge, Report

**Analog:** `packages/graph/src/build.ts`

**Graph topology pattern** (lines 106-146):

```typescript
return (
  new StateGraph(AgentState)
    .addNode('planning', planning)
    .addNode('coding', coding)
    .addNode('revising', revising)
    .addNode('reviewing', review)
    .addNode('pr', pr)
    .addNode('merging', merging)
    .addNode('cloudflareDeploy', cloudflareDeploy)
    .addNode('report', report)
    .addEdge(START, 'planning')
    .addEdge('planning', 'coding')
    .addConditionalEdges('coding', (state) => state.status === 'failed' || state.status === 'completed' ? 'report' : 'reviewing')
    .addConditionalEdges('reviewing', (state) => state.nextAfterReview === 'coding' ? 'revising' : state.nextAfterReview === 'failed' ? 'report' : 'pr')
    .addEdge('pr', 'merging')
    .addEdge('merging', 'cloudflareDeploy')
    .addEdge('cloudflareDeploy', 'report')
    .addEdge('report', END)
    .compile({ checkpointer, interruptBefore: ['coding'] })
);
```

**Analog:** `packages/graph/src/nodes/pr.ts`

**PR creation pattern** (lines 26-60):

```typescript
const autoMerge = shouldAutoMerge(state);
const pr = await deps.github.createPullRequest({
  head: state.branch,
  base: deps.baseBranch,
  title,
  body,
  draft: !autoMerge,
  ...(state.targetRepo ? { repo: parseRepoFullName(state.targetRepo) } : {}),
});

await deps.cards.comment(
  state.issueId,
  `## Draft PR aberto\n[#${pr.number}](${pr.url}) - branch \`${state.branch}\`.`,
);
```

**Analog:** `packages/graph/src/nodes/merging.ts`

**Auto-merge gate pattern** (lines 18-52):

```typescript
if (!shouldAutoMerge(state) || !state.prNumber) return {};
await deps.github.mergePullRequest({
  number: state.prNumber,
  method: 'squash',
  ...(targetRepo ? { repo: targetRepo } : {}),
});
if (state.branch) {
  if (targetRepo) await deps.github.deleteBranch(state.branch, targetRepo);
  else await deps.github.deleteBranch(state.branch);
}
await deps.cards.setCardState(state.issueId, deps.doneStateId);
return { autoMerged: true };
```

**Analog:** `packages/graph/src/nodes/report.ts`

**Final report source pattern** (lines 71-107):

```typescript
export function makeReportNode(deps: ReportDeps) {
  return async (state: AgentStateType): Promise<Partial<AgentStateType>> => {
    const ok = state.status === 'completed';
    const verdict = verdictOf(state.review);
    const lines = [`## Resultado - ${state.issueIdentifier}`, ''];
    lines.push(`**Status:** \`${state.status}\``);
    if (state.prUrl) lines.push(`**PR:** ${state.prUrl}`);
    if (state.branch) lines.push(`**Branch:** \`${state.branch}\``);
    lines.push(...formatQualityMetrics(qualityMetricsForState(state)));
    await deps.cards.comment(state.issueId, lines.join('\n'));
    return {};
  };
}
```

Use these as code anchors when documenting "GitHub PR/merge/report"; do not restate all mutable gate rules in docs without pointing back to these files.

#### Research-To-Landing Continuation

**Analog:** `apps/orchestrator-api/src/workflows.ts`

**Workflow label and context pattern** (lines 3-50):

```typescript
export const RESEARCH_TO_LANDING_WORKFLOW = 'research_landing_page';
export const RESEARCH_TO_LANDING_LABEL = 'workflow:landing-page';

export function workflowFromLabels(labelNames: string[]): string | undefined {
  return labelNames.includes(RESEARCH_TO_LANDING_LABEL) ? RESEARCH_TO_LANDING_WORKFLOW : undefined;
}

export function shouldStartResearchToLandingContinuation(args: {
  workflow?: string | null;
  status: RunStatus;
  research?: string;
}): boolean {
  return (
    args.workflow === RESEARCH_TO_LANDING_WORKFLOW &&
    args.status === 'completed' &&
    Boolean(args.research?.trim())
  );
}
```

**Analog:** `apps/orchestrator-api/src/worker.ts`

**Continuation enqueue pattern** (lines 336-427):

```typescript
const sourceRun = await getRun(args.runId);
if (!sourceRun) return;
if (
  !shouldStartResearchToLandingContinuation({
    workflow: sourceRun.workflow,
    status: args.status,
    research: args.result.research,
  })
) {
  return;
}

const landingAgent = await resolveAgentByKey(LANDING_PAGE_AGENT_KEY);
const sourceCardRef = resolveRunCardRef(sourceRun);
const landingRunId = await createRun({
  cardProvider: sourceCardRef.cardProvider,
  cardId: sourceCardRef.cardId,
  cardIdentifier: sourceRun.cardIdentifier ?? sourceRun.linearIssueIdentifier,
  title: `${sourceRun.title} - landing page`,
  agentId: landingAgent?.id,
  autoApprove: true,
  autoMerge: sourceRun.autoMerge,
  targetRepo: target?.fullName,
});

await agentQueue.add(
  'plan',
  {
    kind: 'plan',
    runId: landingRunId,
    cardProvider: sourceCardRef.cardProvider,
    cardId: sourceCardRef.cardId,
    context: formatResearchToLandingContext(args.result.research ?? '', args.runId),
  },
  { priority: JOB_PRIORITY.plan },
);
```

**Test analogs:**

- `apps/orchestrator-api/src/workflows.test.ts` lines 9-18 proves label -> workflow.
- `workflows.test.ts` lines 21-54 proves continuation only when completed with non-empty research.
- `workflows.test.ts` lines 57-94 proves the Landing Page Brief is promoted before the full research pack.
- `worker.test.ts` lines 320-358 proves the continuation uses persisted Plane card fields and enqueues the second run.

#### Scheduler

**Documentation gap:** research found no dedicated active scheduler runbook linked from `docs/runbooks/README.md`. Prefer adding `docs/runbooks/scheduler.md` and linking it from `docs/runbooks/README.md` and `docs/CURRENT.md`.

**Analog:** `apps/orchestrator-api/src/routes/schedules.ts`

**Protected scheduler CRUD pattern** (lines 17-50):

```typescript
async function requireAuth(c: Context, next: Next) {
  if (c.req.header('authorization') !== `Bearer ${env.RUNNER_AUTH_TOKEN}`) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  await next();
}

schedulesRoute.use('/schedules', requireAuth);
schedulesRoute.use('/schedules/*', requireAuth);

schedulesRoute.post('/schedules', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body || !body.name || !body.cron || !body.title || !body.description) {
    return c.json({ error: 'name, cron, title e description são obrigatórios' }, 400);
  }
  const tz = typeof body.tz === 'string' && body.tz ? body.tz : env.SCHEDULER_TZ;
  if (!isValidCron(body.cron, tz)) {
    return c.json({ error: 'cron inválido' }, 400);
  }
  const row = await createSchedule({ name: body.name, cron: body.cron, title: body.title, description: body.description, tz });
  if (row.enabled) {
    await upsertScheduleJob({ id: row.id, cron: row.cron, tz: row.tz });
  }
  return c.json(row, 201);
});
```

**Scheduler update/delete reconciliation pattern** (lines 74-113):

```typescript
schedulesRoute.patch('/schedules/:id', async (c) => {
  const row = await updateSchedule(id, patch);
  if (!row) return c.json({ error: 'not found' }, 404);
  if (row.enabled) {
    await upsertScheduleJob({ id: row.id, cron: row.cron, tz: row.tz });
  } else {
    await removeScheduleJob(row.id);
  }
  return c.json(row);
});

schedulesRoute.delete('/schedules/:id', async (c) => {
  const removed = await deleteSchedule(id);
  if (!removed) return c.json({ error: 'not found' }, 404);
  await removeScheduleJob(id);
  return c.body(null, 204);
});
```

**Analog:** `apps/orchestrator-api/src/schedules.ts`

**Schedule storage pattern** (lines 26-53, 104-119):

```typescript
export async function createSchedule(input: NewScheduleInput): Promise<schema.Schedule> {
  const [row] = await db
    .insert(schema.schedules)
    .values({
      name: input.name,
      cron: input.cron,
      title: input.title,
      description: input.description,
      ...(input.tz ? { tz: input.tz } : {}),
      ...(input.autoApprove !== undefined ? { autoApprove: input.autoApprove } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
    })
    .returning();
  return row!;
}

export async function hasActiveRunForSchedule(scheduleId: string): Promise<boolean> {
  const rows = await db
    .select({ id: schema.runs.id })
    .from(schema.runs)
    .where(and(eq(schema.runs.scheduleId, scheduleId), inArray(schema.runs.status, ACTIVE_STATUSES)))
    .limit(1);
  return rows.length > 0;
}
```

**Analog:** `apps/orchestrator-api/src/scheduleQueue.ts`

**BullMQ scheduler pattern** (lines 4-35):

```typescript
export const SCHEDULE_QUEUE = 'agent-schedules';

export interface ScheduleFireData {
  scheduleId: string;
}

export const scheduleQueue = new Queue<ScheduleFireData, unknown, string>(SCHEDULE_QUEUE, {
  connection,
  defaultJobOptions: { removeOnComplete: 100, removeOnFail: 500 },
});

export async function upsertScheduleJob(s: { id: string; cron: string; tz: string }): Promise<void> {
  await scheduleQueue.upsertJobScheduler(
    s.id,
    { pattern: s.cron, tz: s.tz },
    { name: 'fire', data: { scheduleId: s.id } },
  );
}

export async function removeScheduleJob(id: string): Promise<void> {
  await scheduleQueue.removeJobScheduler(id);
}
```

**Analog:** `apps/orchestrator-api/src/scheduleWorker.ts`

**Scheduled card/run/job pattern** (lines 23-90):

```typescript
export async function startScheduleWorker(): Promise<Worker<ScheduleFireData, unknown, string>> {
  const { cards } = await getAgent();
  const enabled = await listSchedules({ enabledOnly: true });
  for (const s of enabled) {
    await upsertScheduleJob({ id: s.id, cron: s.cron, tz: s.tz });
  }

  return new Worker<ScheduleFireData, unknown, string>(
    SCHEDULE_QUEUE,
    async (job) => {
      const schedule = await getSchedule(job.data.scheduleId);
      if (!schedule || !schedule.enabled) {
        await removeScheduleJob(job.data.scheduleId);
        return;
      }
      if (await hasActiveRunForSchedule(job.data.scheduleId)) return;

      const card = await cards.primary.createCard({
        title: schedule.title,
        description: schedule.description,
        labelIds: env.PLANE_SCHEDULED_LABEL_ID ? [env.PLANE_SCHEDULED_LABEL_ID] : undefined,
      });

      const runId = await createRun({
        cardProvider: card.provider,
        cardId: card.id,
        cardIdentifier: card.identifier,
        cardProjectId: card.projectId,
        title: schedule.title,
        scheduleId: job.data.scheduleId,
        autoApprove: schedule.autoApprove,
      });

      await agentQueue.add('plan', { kind: 'plan', runId, cardProvider: card.provider, cardId: card.id }, { priority: JOB_PRIORITY.plan });
    },
    { connection },
  );
}
```

**Test analogs:**

- `apps/orchestrator-api/src/routes/schedules.test.ts` lines 33-63 asserts bearer auth, cron validation, schedule creation, and scheduler registration.
- `routes/schedules.test.ts` lines 74-81 asserts delete removes both DB row and scheduler.
- `apps/orchestrator-api/src/scheduleWorker.test.ts` lines 121-152 asserts Plane scheduled label, generic card metadata, and provider-aware plan job.
- `scheduleWorker.test.ts` lines 154-166 assert no fallback to Linear scheduled label when Plane label is absent.

#### Mission Control

**Analog:** `apps/orchestrator-api/src/routes/admin.ts`

**Auth and read-only route pattern** (lines 54-123):

```typescript
async function requireAdmin(c: Context, next: Next) {
  if (c.req.header('authorization') !== `Bearer ${env.RUNNER_AUTH_TOKEN}`) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  await next();
}

adminRoute.use('/admin/*', requireAdmin);

adminRoute.get('/admin/mission-control', async (c) => {
  const scenarios = listE2eMissionScenarios();
  const missions = await buildRecentMissionSummaries(20, scenarios);
  return c.html(renderMissionControlPage({ scenarios, missions }));
});

adminRoute.get('/admin/api/mission-control/scenarios', async (c) => {
  return c.json({ scenarios: listE2eMissionScenarios() });
});
```

**Mission summary pattern** (lines 140-190):

```typescript
const scenarioByWorkflow = new Map(scenarios.map((scenario) => [scenario.workflow, scenario]));
const runs = (await listRuns(limit, 0)).filter((run) =>
  scenarioByWorkflow.has(run.workflow ?? ''),
);

const timeline = buildMissionTimeline({
  scenarioId: scenario.id,
  runs: missionRuns,
  artifacts,
  approvals,
});

return {
  id: run.id,
  scenarioId: scenario.id,
  card: {
    provider: run.cardProvider,
    id: run.cardId,
    identifier: run.cardIdentifier,
  },
  state: timeline.state,
  activeStageId: timeline.activeStageId,
  artifactKinds: artifacts.map((artifact) => artifact.kind),
};
```

**Read-only copy pattern:** `admin.ts` lines 604-607 says the page inspects scenarios and recent state only and does not launch runs or call external providers.

**Test analog:** `apps/orchestrator-api/src/routes/admin.test.ts`

- Lines 49-78 assert the scenario endpoint is protected and returns required labels/stages.
- Lines 87-195 assert mission summaries include timeline, artifacts, and approval.
- Lines 278-285 assert `/admin/api` compatibility aliases remain.
- Lines 288-355 assert read-only page copy and absence of launch controls.
- Lines 565-620 assert `/admin/card-runs` is protected and returns Plane card-run history.

#### Artifact Store

**Analog:** `apps/orchestrator-api/src/artifacts.ts`

**Persistence and read pattern** (lines 10-42):

```typescript
export async function saveArtifacts(
  runId: string,
  parts: Partial<Record<ArtifactKind, string | undefined>>,
): Promise<void> {
  const rows = (Object.entries(parts) as [ArtifactKind, string | undefined][])
    .filter(([, content]) => content?.trim())
    .map(([kind, content]) => ({ runId, kind, content: content as string }));
  if (rows.length === 0) return;
  await db.insert(schema.artifacts).values(rows);
}

export async function listArtifacts(runId: string) {
  return db
    .select({ id: schema.artifacts.id, kind: schema.artifacts.kind, createdAt: schema.artifacts.createdAt })
    .from(schema.artifacts)
    .where(eq(schema.artifacts.runId, runId))
    .orderBy(schema.artifacts.createdAt);
}
```

**Analog:** `apps/orchestrator-api/src/routes/artifacts.ts`

**Route pattern** (lines 8-20):

```typescript
artifactsRoute.get('/runs/:id/artifacts', async (c) => {
  const id = c.req.param('id');
  const run = await getRun(id);
  if (!run) return c.json({ error: 'not found' }, 404);
  return c.json({ artifacts: await listArtifacts(id) });
});

artifactsRoute.get('/artifacts/:id', async (c) => {
  const artifact = await getArtifact(c.req.param('id'));
  if (!artifact) return c.json({ error: 'not found' }, 404);
  return c.json(artifact);
});
```

**Test analog:** `apps/orchestrator-api/src/artifacts.test.ts` lines 18-45 and `routes/artifacts.test.ts` lines 19-60.

### Plan `04-02`: Normalize Workflow/Agent/Label/Source-Of-Truth Naming Across Docs And Code

**Likely ownership:** docs indexes, runbooks, source-of-truth references, and focused registry/source tests. Avoid deleting aliases or changing production routing.

#### Workflow Labels

**Canonical source:** `apps/orchestrator-api/src/workflows.ts`

Use constants from lines 3-4 as the code source:

```typescript
export const RESEARCH_TO_LANDING_WORKFLOW = 'research_landing_page';
export const RESEARCH_TO_LANDING_LABEL = 'workflow:landing-page';
```

Docs should say Plane label `workflow:landing-page` selects the composed workflow and internal persisted value is `research_landing_page`. The Plane label ID belongs to `docs/runbooks/plane-migration-2026-06-20.md`; do not duplicate it into multiple current docs unless that runbook remains the explicit ID owner.

#### Agent Keys And Pipeline Roles

**Canonical source:** `apps/orchestrator-api/src/agents.ts`

**Agent key constants** (lines 8-14):

```typescript
export const DEFAULT_AGENT_KEY = env.AGENT_KEY;
export const REVIEWER_AGENT_KEY = 'reviewer-agent';
export const LANDING_PAGE_AGENT_KEY = 'landing-page-agent';
export const DATA_COLLECTOR_AGENT_KEY = 'data-collector-agent';
export const SOFTWARE_DELIVERY_PIPELINE_KEY = 'software-delivery-pipeline';
```

**Pipeline role definitions** (lines 22-53):

```typescript
export const SOFTWARE_DELIVERY_PIPELINE_ROLES: AgentRoleDefinition[] = [
  { key: 'planner', description: 'Gera plano e approval reasons.', modelAlias: 'research', skills: [] },
  { key: 'coder', description: 'Aplica plano no runner e valida mudancas.', modelAlias: 'strong_coder', skills: [] },
  { key: 'critic', description: 'Revisa diff e decide recode ou PR.', modelAlias: 'critic', skills: [] },
  { key: 'pr', description: 'Abre PR e avalia auto-merge.', modelAlias: null, skills: [] },
  { key: 'reporter', description: 'Publica resumo final no card.', modelAlias: null, skills: [] },
];
```

**Label -> agent mapping** (lines 96-100):

```typescript
export function agentKeyFromLabels(labelNames: string[]): string {
  if (labelNames.includes('agent:landing-page')) return LANDING_PAGE_AGENT_KEY;
  if (labelNames.includes('agent:data-collector')) return DATA_COLLECTOR_AGENT_KEY;
  return labelNames.includes('agent:reviewer') ? REVIEWER_AGENT_KEY : DEFAULT_AGENT_KEY;
}
```

**Compatibility rule:** `coder-agent` remains the default compatibility key. `software-delivery-pipeline` is a clearer identity, not proof that `coder-agent` can be removed.

**Test analog:** `apps/orchestrator-api/src/agents.test.ts`

- Lines 72-99 prove agent label priority and default key behavior.
- Lines 101-153 prove role names and model aliases.
- Lines 155-188 prove both `coder-agent` compatibility and `software-delivery-pipeline` coexist.

#### Skill Registry

**Canonical source:** `agent-skills/registry.json`

**Agent -> skills mapping** (lines 1-37):

```json
{
  "version": 1,
  "agentSkills": {
    "landing-page-agent": [
      "landing-page-production",
      "landing-page-style-recipes",
      "frontend-design",
      "ui-ux-pro-max",
      "accessibility-wcag",
      "astro-react-landing",
      "seo-page",
      "biome-formatting",
      "gsap-motion",
      "higgsfield-media-generation"
    ],
    "data-collector-agent": [
      "research-planner",
      "research-data-collection",
      "instagram-public-research"
    ],
    "coder-agent": ["gsd", "software-planner", "software-coder", "software-critic", "software-pr", "software-reporter"],
    "software-delivery-pipeline": ["gsd", "software-planner", "software-coder", "software-critic", "software-pr", "software-reporter"]
  }
}
```

**Loader analog:** `apps/worker-code/src/executor/agentSkills.ts`

**Registry load/injection pattern** (lines 50-95):

```typescript
export function loadAgentSkillRegistry(root = repoRootFromModule()): AgentSkillRegistry | null {
  const registryPath = resolve(root, 'agent-skills/registry.json');
  if (!existsSync(registryPath)) return null;
  return registrySchema.parse(JSON.parse(readFileSync(registryPath, 'utf8')));
}

export function buildSkillInstructions(agentKey?: string, capabilities: string[] = [], root = repoRootFromModule(), opts: { skills?: string[] } = {}): string {
  if (!agentKey) {
    return capabilities.length > 0 ? `Agente selecionado: default (${capabilities.join(', ')}).` : '';
  }

  const registry = loadAgentSkillRegistry(root);
  const skillNames = opts.skills ?? registry?.agentSkills[agentKey] ?? [];
  const skillByName = new Map(registry?.skills.map((skill) => [skill.name, skill]) ?? []);
  const skillBlocks = skillNames.flatMap((skillName) => {
    const skill = skillByName.get(skillName);
    if (!skill) return [];
    const fullPath = resolve(root, skill.path);
    if (!existsSync(fullPath)) return [];
    const body = truncateSkill(stripFrontmatter(readFileSync(fullPath, 'utf8')));
    return [`## Skill: ${skill.name}\n${body}`];
  });
}
```

**Test analog:** `apps/worker-code/src/executor/agentSkills.test.ts`

- Lines 8-23 assert landing-page registry mapping.
- Lines 51-61 assert both `coder-agent` and `software-delivery-pipeline` load the software/GSD skill set.
- Lines 63-74 assert `data-collector-agent` loads research skills.
- Lines 86-102 assert missing skills do not break generic agents.

#### Model Aliases

**Canonical source:** `packages/llm/src/index.ts`

**Model alias source** (lines 3-4):

```typescript
export type ModelAlias = 'cheap_fast' | 'research' | 'strong_coder' | 'heavy_coder' | 'critic';
```

**Pricing/alias map** (lines 66-72):

```typescript
export const MODEL_PRICING: Record<ModelAlias, { inUsdPerM: number; outUsdPerM: number }> = {
  cheap_fast: { inUsdPerM: 0.1, outUsdPerM: 0.3 },
  research: { inUsdPerM: 3, outUsdPerM: 15 },
  strong_coder: { inUsdPerM: 3, outUsdPerM: 15 },
  heavy_coder: { inUsdPerM: 3, outUsdPerM: 15 },
  critic: { inUsdPerM: 3, outUsdPerM: 15 },
};
```

**Role mapping source:** `packages/graph/src/roleModels.ts` lines 4-18.

```typescript
export const DEFAULT_ROLE_MODEL_ALIASES: Record<SoftwareRole, ModelAlias | null> = {
  planner: 'research',
  coder: 'strong_coder',
  critic: 'critic',
  pr: null,
  reporter: null,
};
```

Docs should point to these files, not copy live model routing details from LiteLLM config into multiple places.

#### Eval Harness

**Canonical source:** `apps/worker-code/src/eval/runEval.ts`

**Suite/report artifact pattern** (lines 41-82):

```typescript
export async function runEvalSuite(args: {
  fixturesDir: string;
  outRoot: string;
}): Promise<EvalReport> {
  const generatedAt = new Date().toISOString().replace(/[:.]/g, '-');
  const artifactRoot = join(args.outRoot, generatedAt);
  await mkdir(artifactRoot, { recursive: true });

  const scenarios = await loadScenarios(args.fixturesDir);
  const results: EvalResult[] = [];
  for (const scenario of scenarios) {
    results.push(await runScenario(scenario, join(artifactRoot, scenario.id)));
  }

  await writeFile(join(artifactRoot, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(join(artifactRoot, 'report.md'), renderMarkdown(report));
  await writeFile(join(args.outRoot, 'latest-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(join(args.outRoot, 'history.jsonl'), `${JSON.stringify(reportSummary(report))}\n`, { flag: 'a' });
  return report;
}
```

**Scenario pattern** (lines 107-163):

```typescript
async function runScenario(scenario: EvalScenario, artifactDir: string): Promise<EvalResult> {
  await mkdir(artifactDir, { recursive: true });
  const workdir = await mkdtemp(join(tmpdir(), `agent-platform-eval-${scenario.id}-`));
  try {
    await writeFiles(workdir, scenario.repo.files);
    await initRepo(workdir);
    if (scenario.workerDryRun) {
      dryRun = await runWorkerDryRun({ scenario, workdir, artifactDir });
      commands = dryRun.commands;
    } else {
      await applyCandidate(workdir, scenario.candidate);
      commands = await runCommands(workdir, scenario.commands);
    }
    const changedFiles = dryRun ? [...dryRun.filesChanged].sort() : await listChangedFiles(workdir);
    const scored = await scoreScenario({ scenario, workdir, changedFiles, commands });
    // write result.json and diff.patch
  } finally {
    await rm(workdir, { recursive: true, force: true });
  }
}
```

**Role quality source:** `apps/worker-code/src/eval/roleQuality.ts` lines 10-37 checks planner structure, exact paths, TDD guidance, `rtk` validation commands, acceptance criteria, and `APPROVAL_REASONS`.

**Test analog:** `apps/worker-code/src/eval/runEval.test.ts`

- Lines 5-33 cover regression comparison.
- Lines 35-173 cover legacy/ad hoc fixture normalization.
- Lines 176-327 cover markdown report fields for verdicts, auto-merge, critic rounds, commit policy, and isolation.

## Shared Patterns

### Plane-First With Legacy Linear Compatibility

**Apply to:** all Phase 4 docs and tests.

**Sources:**

- `docs/CURRENT.md`: Plane is current intake; Linear is legacy/migration-only.
- `.planning/phases/03-plane-only-provider-cutover/03-05-SUMMARY.md`: generic card fields default to Plane; legacy Linear fields remain readable.
- `apps/orchestrator-api/src/routes/webhooks.ts` lines 126-130 and 231-241: `/webhooks/linear` only runs when `CARD_EXTRA_PROVIDERS` contains `linear`; otherwise it returns a disabled legacy response.
- `apps/orchestrator-api/src/runs.ts` lines 65-119: old Linear identity is compatibility, not the default for new generic card rows.

**Pitfall:** do not re-enable Linear in docs, env examples, Funnel instructions, tests, or source defaults. Do not remove Linear compatibility aliases without a targeted external reference audit and explicit destructive cleanup approval.

### Test-Backed Documentation Claims

**Apply to:** all operator-flow claims in docs.

**Pattern:** every behavior claim should link to at least one source file and one test file. For example:

- Plane intake: `routes/webhooks.ts` + `routes/webhooks.test.ts`
- Run identity: `runs.ts` + `runs.test.ts`
- Queue/worker: `queue.ts`, `worker.ts` + `queue.test.ts`, `worker.test.ts`
- Scheduler: `routes/schedules.ts`, `schedules.ts`, `scheduleQueue.ts`, `scheduleWorker.ts` + `routes/schedules.test.ts`, `scheduleWorker.test.ts`
- Mission Control: `routes/admin.ts`, `missionScenarios.ts`, `missionTimeline.ts` + their tests
- Artifacts: `artifacts.ts`, `routes/artifacts.ts` + their tests
- Skills: `agent-skills/registry.json`, `agentSkills.ts` + `agentSkills.test.ts`
- Eval: `runEval.ts`, `roleQuality.ts` + `runEval.test.ts`, `roleQuality.test.ts`

### Auth And Exposure

**Sources:**

- `apps/orchestrator-api/src/routes/admin.ts` lines 54-63 protects `/admin/*` with `RUNNER_AUTH_TOKEN`.
- `apps/worker-code/src/routes/jobs.ts` lines 9-18 protects `/jobs` and `/jobs/*`.
- `docs/runbooks/webhook-tailscale.md` says public Funnel exposure should be scoped to `/webhooks/plane` only.

**Pitfall:** `/runs/:id/approve` remains internal/unauthenticated in `routes/runs.ts` lines 76-90. Do not document it as safe for public exposure. If docs mention it, say it is internal and must not be exposed through Funnel.

### Read-Only Mission Control

**Sources:**

- `docs/runbooks/mission-control.md`: current Mission Control does not launch, replay, approve, cancel, or call external providers.
- `apps/orchestrator-api/src/routes/admin.ts` lines 95-137 and 537-629 render read-only dashboard/detail pages.
- `apps/orchestrator-api/src/routes/admin.test.ts` lines 288-355 assert read-only copy and absence of "Launch run" / "Start mission".

**Pitfall:** do not plan a UI redesign or new action controls in Phase 4. That is deferred and partly belongs to Phase 5/FUT-01.

### Artifact Contract

**Sources:**

- `worker.ts` lines 250-267 saves plan/patch/review/validation/summary/research artifacts non-fatally.
- `artifacts.ts` lines 10-18 filters empty content and inserts non-empty artifacts.
- `missionTimeline.ts` lines 290-317 maps artifact kinds to mission stages.
- `data-collector-agent.md` documents `research` and `Landing Page Brief` as downstream contract.

**Pitfall:** research packs are operational artifacts. Do not treat them as code changes or require PR creation for the first collector run.

### Verification Command Pattern

Use `rtk` for every project command.

Focused docs check:

```bash
rtk corepack pnpm exec biome check docs/README.md docs/CURRENT.md docs/HISTORICAL.md docs/runbooks/README.md docs/runbooks/webhook-tailscale.md docs/runbooks/research-to-landing-workflow.md docs/runbooks/mission-control.md docs/runbooks/scheduler.md docs/runbooks/eval-harness.md docs/runbooks/agent-skills.md --no-errors-on-unmatched
```

Focused orchestrator behavior checks:

```bash
rtk corepack pnpm vitest run apps/orchestrator-api/src/routes/webhooks.test.ts apps/orchestrator-api/src/runs.test.ts apps/orchestrator-api/src/queue.test.ts apps/orchestrator-api/src/worker.test.ts apps/orchestrator-api/src/scheduleWorker.test.ts apps/orchestrator-api/src/routes/schedules.test.ts apps/orchestrator-api/src/workflows.test.ts apps/orchestrator-api/src/routes/admin.test.ts apps/orchestrator-api/src/missionScenarios.test.ts apps/orchestrator-api/src/missionTimeline.test.ts apps/orchestrator-api/src/artifacts.test.ts apps/orchestrator-api/src/routes/artifacts.test.ts
```

Focused worker/eval/registry checks:

```bash
rtk corepack pnpm vitest run apps/worker-code/src/executor/agentSkills.test.ts apps/worker-code/src/eval/runEval.test.ts apps/worker-code/src/eval/roleQuality.test.ts apps/worker-code/src/executor/runJob.test.ts
```

Full gate:

```bash
rtk corepack pnpm verify
rtk corepack pnpm eval:regression
```

## Plan-Specific Pitfalls

### `04-01`

- Do not add a new product UI or Mission Control launch/replay controls.
- Do not reorganize `routes/webhooks.ts`, `routes/admin.ts`, `runJob.ts`, or `runEval.ts` hubs; those are Phase 5/6 refactors.
- Do not create an end-to-end external run unless local tests already support it. Prefer characterization tests around enqueueing, continuation, and source-of-truth mapping.
- Keep the flow phrasing Plane -> run -> approval -> worker -> review -> PR/merge/report -> Plane report.
- For research-to-landing, document that first run completes without PR and saves `research`; second run uses `landing-page-agent` and may open a Draft PR.

### `04-02`

- Do not remove `coder-agent`; it is still the compatibility key and shares skills with `software-delivery-pipeline`.
- Do not duplicate mutable IDs and aliases across docs. Point to:
  - Plane label IDs: `docs/runbooks/plane-migration-2026-06-20.md`
  - Workflow constants: `apps/orchestrator-api/src/workflows.ts`
  - Agent keys/roles: `apps/orchestrator-api/src/agents.ts`
  - Skills: `agent-skills/registry.json`
  - Skill loader behavior: `apps/worker-code/src/executor/agentSkills.ts`
  - Model aliases: `packages/llm/src/index.ts`, `packages/graph/src/roleModels.ts`
  - Env/secrets: `.env.example` files and `docs/runbooks/secrets.md`
- Preserve historical docs under `docs/HISTORICAL.md`; do not rewrite old ADRs or disposable E2E notes as current guidance.
- Current worktree already has unrelated modified/untracked docs and agent-skills files. Any Phase 4 implementation should preserve and build on those, not revert them.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `docs/runbooks/artifact-store.md` (if created) | runbook | artifact CRUD/read-only | No standalone artifact-store runbook exists; use `artifacts.ts`, `routes/artifacts.ts`, `missionTimeline.ts`, and Mission Control docs as analogs. |

## Metadata

**Analog search scope:** `.planning`, `docs`, `docs/runbooks`, `apps/orchestrator-api/src`, `apps/worker-code/src`, `apps/worker-code/evals`, `packages/graph`, `packages/llm`, `agent-skills`
**Files scanned/read:** phase context, Phase 4 research, Phase 3 summary, roadmap/requirements/state, current docs indexes, relevant runbooks, webhook/run/queue/worker/scheduler/admin/artifact/workflow/agent/eval/source tests and implementations
**Pattern extraction date:** 2026-07-02
**Worktree note:** unrelated dirty/untracked files were present before this artifact and must not be included in the Phase 4 pattern commit.
