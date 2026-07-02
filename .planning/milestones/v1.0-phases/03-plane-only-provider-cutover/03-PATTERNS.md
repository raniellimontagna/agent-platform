# Phase 03: Plane-Only Provider Cutover - Pattern Map

**Mapped:** 2026-07-02
**Files analyzed:** 38
**Analogs found:** 38 / 38

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `apps/orchestrator-api/src/cards.ts` | config/service | transform | `apps/orchestrator-api/src/cards.ts` | exact |
| `apps/orchestrator-api/src/cards.test.ts` | test | transform | `apps/orchestrator-api/src/cards.test.ts` | exact |
| `apps/orchestrator-api/src/env.ts` | config | transform | `apps/orchestrator-api/src/env.ts` | exact |
| `apps/orchestrator-api/src/env.test.ts` | test | transform | `apps/orchestrator-api/src/env.test.ts` | exact |
| `vitest.setup.ts` | config | transform | `vitest.setup.ts` | exact |
| `apps/orchestrator-api/src/agent.ts` | service/provider | event-driven | `apps/orchestrator-api/src/agent.ts` | exact |
| `apps/orchestrator-api/src/agent.test.ts` | test | transform | `apps/orchestrator-api/src/agent.test.ts` | exact |
| `apps/orchestrator-api/src/routes/webhooks.ts` | route/controller | request-response, event-driven | `apps/orchestrator-api/src/routes/webhooks.ts` | exact |
| `apps/orchestrator-api/src/routes/webhooks.test.ts` | test | request-response, event-driven | `apps/orchestrator-api/src/routes/webhooks.test.ts` | exact |
| `apps/orchestrator-api/src/runs.ts` | service/repository | CRUD | `apps/orchestrator-api/src/runs.ts` | exact |
| `apps/orchestrator-api/src/runs.test.ts` | test | CRUD | `apps/orchestrator-api/src/runs.test.ts` | exact |
| `apps/orchestrator-api/src/db/schema.ts` | model | CRUD | `apps/orchestrator-api/src/db/schema.ts` | exact |
| `apps/orchestrator-api/drizzle/0017_plane_default_card_provider.sql` | migration | batch, transform | `apps/orchestrator-api/drizzle/0015_card_providers.sql` | role-match |
| `apps/orchestrator-api/src/queue.ts` | utility | event-driven | `apps/orchestrator-api/src/queue.ts` | exact |
| `apps/orchestrator-api/src/queue.test.ts` | test | event-driven | `apps/orchestrator-api/src/workerManager.test.ts` | role-match |
| `apps/orchestrator-api/src/worker.ts` | worker/service | event-driven | `apps/orchestrator-api/src/worker.ts` | exact |
| `apps/orchestrator-api/src/worker.test.ts` | test | event-driven | `apps/orchestrator-api/src/workerManager.test.ts` | role-match |
| `apps/orchestrator-api/src/scheduleWorker.ts` | worker | event-driven, CRUD | `apps/orchestrator-api/src/scheduleWorker.ts` | exact |
| `apps/orchestrator-api/src/scheduleWorker.test.ts` | test | event-driven, CRUD | `apps/orchestrator-api/src/routes/schedules.test.ts` | role-match |
| `apps/orchestrator-api/src/routes/admin.ts` | route/controller | request-response, CRUD | `apps/orchestrator-api/src/routes/admin.ts` | exact |
| `apps/orchestrator-api/src/routes/admin.test.ts` | test | request-response, CRUD | `apps/orchestrator-api/src/routes/admin.test.ts` | exact |
| `packages/graph/src/nodes/report.test.ts` | test | event-driven | `packages/graph/src/nodes/report.test.ts` | exact |
| `packages/graph/src/nodes/merging.test.ts` | test | event-driven | `packages/graph/src/nodes/merging.test.ts` | exact |
| `packages/graph/src/nodes/autoMerge.test.ts` | test | transform | `packages/graph/src/nodes/autoMerge.test.ts` | exact |
| `apps/orchestrator-api/src/planeMigration.ts` | service | batch, CRUD | `apps/orchestrator-api/src/planeMigration.ts` | exact |
| `apps/orchestrator-api/src/planeMigrationCli.ts` | utility | batch, file-I/O | `apps/orchestrator-api/src/planeMigrationCli.ts` | exact |
| `apps/orchestrator-api/src/planeMigration.test.ts` | test | batch | `apps/orchestrator-api/src/planeMigration.test.ts` | exact |
| `packages/plane/src/index.test.ts` | test | CRUD, request-response | `packages/plane/src/index.test.ts` | exact |
| `apps/orchestrator-api/.env.example` | config | transform | `apps/orchestrator-api/.env.example` | exact |
| `infra/compose/orchestrator/.env.example` | config | transform | `infra/compose/orchestrator/.env.example` | exact |
| `README.md` | config/docs | file-I/O | `README.md` | exact |
| `docs/ARCHITECTURE.md` | config/docs | file-I/O | `docs/ARCHITECTURE.md` | exact |
| `docs/CURRENT.md` | config/docs | file-I/O | `docs/CURRENT.md` | exact |
| `docs/runbooks/webhook-tailscale.md` | config/docs | file-I/O | `docs/runbooks/webhook-tailscale.md` | exact |
| `docs/runbooks/secrets.md` | config/docs | file-I/O | `docs/runbooks/secrets.md` | exact |
| `docs/runbooks/plane-migration-2026-06-20.md` | config/docs | batch | `apps/orchestrator-api/src/planeMigrationCli.ts` | role-match |
| `infra/compose/observability/provisioning/dashboards/agent-runs.json` | config | CRUD/read-only SQL | `infra/compose/observability/provisioning/dashboards/agent-runs.json` | exact |
| `infra/compose/observability/provisioning/dashboards/quality-memory.json` | config | CRUD/read-only SQL | `infra/compose/observability/provisioning/dashboards/quality-memory.json` | exact |

## Pattern Assignments

### Provider Registry And Env Cutover

**Target files:** `apps/orchestrator-api/src/cards.ts`, `apps/orchestrator-api/src/cards.test.ts`, `apps/orchestrator-api/src/env.ts`, `apps/orchestrator-api/src/env.test.ts`, `vitest.setup.ts`, `apps/orchestrator-api/src/agent.ts`, `apps/orchestrator-api/src/agent.test.ts`, env examples.

**Analog:** `apps/orchestrator-api/src/cards.ts`

**Imports pattern** (lines 1-8):
```typescript
import {
  type CardGateway,
  type CardGatewayRegistry,
  type CardProvider,
  createCardGatewayRegistry,
} from '@agent-platform/cards';
import { createLinearGateway } from '@agent-platform/linear';
import { createPlaneGateway } from '@agent-platform/plane';
```

**Provider enablement pattern** (lines 31-64):
```typescript
export function createRuntimeCards(env: RuntimeCardEnv): CardGatewayRegistry {
  const extraProviders = parseProviders(env.CARD_EXTRA_PROVIDERS);
  const enabled = new Set<CardProvider>([env.CARD_PRIMARY_PROVIDER, ...extraProviders]);
  const gateways: CardGateway[] = [];

  if (enabled.has('plane')) {
    if (!env.PLANE_API_KEY || !env.PLANE_PROJECT_ID) {
      throw new Error('Plane card provider requires PLANE_API_KEY and PLANE_PROJECT_ID');
    }

    gateways.push(
      createPlaneGateway({
        baseUrl: env.PLANE_BASE_URL,
        apiKey: env.PLANE_API_KEY,
        workspaceSlug: env.PLANE_WORKSPACE_SLUG,
        projectId: env.PLANE_PROJECT_ID,
      }),
    );
  }
```

Planner instruction: keep Plane as `CARD_PRIMARY_PROVIDER`; stop adding Linear through defaults. If Linear remains reachable, make it explicit legacy opt-in through `CARD_EXTRA_PROVIDERS=linear`, not global test/deploy baseline.

**Env schema pattern** (lines 22-41):
```typescript
LINEAR_API_KEY: optionalNonEmptyString,
LINEAR_WEBHOOK_SECRET: optionalNonEmptyString,
CARD_PRIMARY_PROVIDER: z.enum(['plane', 'linear']).default('plane'),
CARD_EXTRA_PROVIDERS: z.string().default(''),
PLANE_BASE_URL: z.string().url().default('http://10.10.0.14:8080'),
PLANE_API_KEY: optionalNonEmptyString,
PLANE_WORKSPACE_SLUG: z.string().default('attodev'),
PLANE_PROJECT_ID: optionalNonEmptyString,
PLANE_WEBHOOK_SECRET: optionalNonEmptyString,
PLANE_AI_READY_LABEL_ID: optionalNonEmptyString,
PLANE_APPROVED_LABEL_ID: optionalNonEmptyString,
PLANE_AUTO_MERGE_LABEL_ID: optionalNonEmptyString,
PLANE_SCHEDULED_LABEL_ID: optionalNonEmptyString,
PLANE_DONE_STATE_ID: optionalNonEmptyString,
```

**Conditional legacy env validation** (lines 124-146):
```typescript
const cardProviders = new Set([
  parsed.data.CARD_PRIMARY_PROVIDER,
  ...parsed.data.CARD_EXTRA_PROVIDERS.split(',').map((provider) => provider.trim()),
]);
if (cardProviders.has('linear')) {
  const missing = [
    !parsed.data.LINEAR_API_KEY ? 'LINEAR_API_KEY' : null,
    !parsed.data.LINEAR_WEBHOOK_SECRET ? 'LINEAR_WEBHOOK_SECRET' : null,
  ].filter(Boolean);
  if (parsed.data.CARD_PRIMARY_PROVIDER === 'linear' && !parsed.data.LINEAR_TEAM_ID) {
    missing.push('LINEAR_TEAM_ID');
  }
  if (missing.length > 0) {
    throw new Error(`Linear provider habilitado sem env obrigatório: ${missing.join(', ')}`);
  }
}
if (
  parsed.data.CARD_PRIMARY_PROVIDER === 'plane' &&
  parsed.data.NODE_ENV === 'production' &&
  !parsed.data.PLANE_WEBHOOK_SECRET
) {
  throw new Error('PLANE_WEBHOOK_SECRET is required when Plane is the primary provider');
}
```

**Global test setup to change** (lines 10-33):
```typescript
const defaults: Record<string, string> = {
  DATABASE_URL: 'postgres://user:pass@localhost:5432/test',
  REDIS_URL: 'redis://localhost:6379',
  LITELLM_BASE_URL: 'http://localhost:4000',
  LITELLM_API_KEY: 'sk-test',
  LINEAR_API_KEY: 'lin_test',
  LINEAR_WEBHOOK_SECRET: 'whsec_test',
  CARD_PRIMARY_PROVIDER: 'plane',
  CARD_EXTRA_PROVIDERS: 'linear',
  PLANE_BASE_URL: 'http://plane.local',
  PLANE_API_KEY: 'plane_test',
  PLANE_WORKSPACE_SLUG: 'attodev',
  PLANE_PROJECT_ID: 'plane-project-test',
  PLANE_WEBHOOK_SECRET: 'plane-secret',
  GITHUB_TOKEN: 'ghp_test',
  RUNNER_BASE_URL: 'http://localhost:8080',
  RUNNER_AUTH_TOKEN: 'runner-test',
  LINEAR_TEAM_ID: 'team_test',
};
```

Planner instruction: remove `CARD_EXTRA_PROVIDERS: 'linear'` and Linear dummy envs from global setup; add them only inside explicit legacy/migration tests.

**Dynamic env test pattern** (lines 22-50):
```typescript
describe('env Plane-only deploy', () => {
  it('treats empty optional Linear compose variables as absent', async () => {
    const previous = { ...process.env };
    vi.resetModules();
    try {
      process.env = {
        ...previous,
        NODE_ENV: 'production',
        CARD_PRIMARY_PROVIDER: 'plane',
        CARD_EXTRA_PROVIDERS: '',
        PLANE_API_KEY: 'plane_test',
        PLANE_PROJECT_ID: 'plane-project-test',
        PLANE_WEBHOOK_SECRET: 'plane-secret',
        LINEAR_API_KEY: '',
        LINEAR_WEBHOOK_SECRET: '',
        LINEAR_TEAM_ID: '',
      };

      const loaded = await import('./env.js');
```

**Graph provider binding pattern** (lines 44-59 and 151-160):
```typescript
export function resolveGraphBinding(
  input: {
    cards: CardGatewayRegistry;
    linearDoneStateId: string;
    planeDoneStateId?: string;
  },
  provider: CardProvider,
): GraphBinding {
  return {
    provider,
    cardGateway: input.cards.forProvider(provider),
    doneStateId:
      provider === 'plane'
        ? (input.planeDoneStateId ?? input.linearDoneStateId)
        : input.linearDoneStateId,
  };
}
```

```typescript
const enabledProviders = Array.from(
  new Set<CardProvider>([
    env.CARD_PRIMARY_PROVIDER,
    ...env.CARD_EXTRA_PROVIDERS.split(',')
      .map((provider) => provider.trim())
      .filter(
        (provider): provider is CardProvider => provider === 'plane' || provider === 'linear',
      ),
  ]),
);
```

Planner instruction: ensure graph construction only includes Plane by default. Keep Linear graph construction only when explicitly enabled for legacy mode.

### Webhook Intake And Route Tests

**Target files:** `apps/orchestrator-api/src/routes/webhooks.ts`, `apps/orchestrator-api/src/routes/webhooks.test.ts`.

**Analog:** `apps/orchestrator-api/src/routes/webhooks.ts`

**Imports pattern** (lines 1-20):
```typescript
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
```

**Signature validation pattern** (lines 85-90 and 119-124):
```typescript
function verifySignature(rawBody: string, signature: string | undefined, secret: string): boolean {
  if (!signature) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
```

```typescript
function verifyPlaneSignature(rawBody: string, signature: string | undefined): boolean {
  if (!env.PLANE_WEBHOOK_SECRET) {
    return env.NODE_ENV !== 'production';
  }
  return verifySignature(rawBody, signature, env.PLANE_WEBHOOK_SECRET);
}
```

**Provider-aware enqueue helper** (lines 143-223):
```typescript
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
```

```typescript
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
```

```typescript
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
```

Planner instruction: keep this shape for Plane. Gate `/webhooks/linear` as legacy-only; do not delete route support unless destructive confirmation is granted.

**Plane route pattern** (lines 314-453):
```typescript
webhooks.post('/webhooks/plane', async (c) => {
  const rawBody = await c.req.text();
  const signature = c.req.header('x-plane-signature');
  const eventHeader = c.req.header('x-plane-event');

  if (!verifyPlaneSignature(rawBody, signature)) {
    logger.warn('Plane webhook with invalid signature rejected');
    return c.json({ error: 'invalid signature' }, 401);
  }

  const payload = JSON.parse(rawBody) as PlanePayload;
```

```typescript
if (isPlaneRemovalAction(payload.action)) {
  const cancelled = await cancelActiveRunsForCard('plane', cardId, PLANE_REMOVED_REASON);
  logger.info(
    {
      provider: 'plane',
      action: payload.action,
      event: eventHeader ?? payload.event ?? payload.type,
      cardId,
      cardIdentifier: planeCardIdentifier(item),
      cancelled,
    },
    'Plane work item removed; active runs cancelled',
  );
  return c.json({ ok: true, cancelled, reason: PLANE_REMOVED_REASON });
}
```

```typescript
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
```

**Label transition helper** (source `apps/orchestrator-api/src/cardWebhook.ts`, lines 1-24):
```typescript
export function labelJustAdded(input: {
  currentNames?: string[];
  currentIds?: string[];
  previousNames?: string[];
  previousIds?: string[];
  action: string;
  name: string;
  id?: string;
}): boolean {
  const currentNames = input.currentNames ?? [];
  const currentIds = input.currentIds ?? [];
  const hasNow = currentNames.includes(input.name) || (!!input.id && currentIds.includes(input.id));
  if (!hasNow) return false;
  if (input.action !== 'update') return true;
  if (input.previousNames === undefined && input.previousIds === undefined) {
    return false;
  }
```

**Hono route test pattern** (source `apps/orchestrator-api/src/routes/webhooks.test.ts`, lines 16-60):
```typescript
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

const app = new Hono();
app.route('/', webhooks);

function signed(body: string) {
  return createHmac('sha256', 'secret').update(body).digest('hex');
}
```

**Plane intake test** (lines 242-279):
```typescript
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
```

**Plane approval and cancellation tests** (lines 328-397):
```typescript
expect(findAwaitingApprovalRunForCard).toHaveBeenCalledWith('plane', 'plane-work-2');
expect(resolveApproval).toHaveBeenCalledWith('run-plane-approval', 'approved', 'plane');
expect(updateRunStatus).toHaveBeenCalledWith('run-plane-approval', 'executing');
expect(agentQueue.add).toHaveBeenCalledWith(
  'resume',
  { kind: 'resume', runId: 'run-plane-approval' },
  { priority: 20 },
);
```

```typescript
expect(cancelActiveRunsForCard).toHaveBeenCalledWith(
  'plane',
  'plane-work-deleted',
  'plane work item removed',
);
expect(createRun).not.toHaveBeenCalled();
expect(resolveApproval).not.toHaveBeenCalled();
expect(agentQueue.add).not.toHaveBeenCalled();
```

### Run Persistence, Schema, And Migration Compatibility

**Target files:** `apps/orchestrator-api/src/runs.ts`, `apps/orchestrator-api/src/runs.test.ts`, `apps/orchestrator-api/src/db/schema.ts`, possible `apps/orchestrator-api/drizzle/0017_plane_default_card_provider.sql`.

**Analog:** `apps/orchestrator-api/src/runs.ts`

**Generic-first resolver pattern** (lines 65-80):
```typescript
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
```

Planner instruction: update defaults so new rows do not silently become Linear. Legacy fallback is only for Linear-origin inputs or explicit migration compatibility.

**Create-run persistence pattern** (lines 82-113):
```typescript
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
```

**Card query pattern** (lines 121-163):
```typescript
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
```

**Cancellation pattern** (lines 247-264):
```typescript
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
```

**Run test pattern** (source `apps/orchestrator-api/src/runs.test.ts`, lines 27-56):
```typescript
describe('resolveRunCardFields', () => {
  it('defaults generic card fields from the legacy linear inputs', () => {
    expect(
      resolveRunCardFields({
        linearIssueId: 'issue-1',
        linearIssueIdentifier: 'MAC-1',
      }),
    ).toEqual({
      cardProvider: 'linear',
      cardId: 'issue-1',
      cardIdentifier: 'MAC-1',
    });
  });

  it('preserves explicit generic card fields', () => {
```

Add tests here for Plane-only generic input and explicit Linear legacy input. Avoid making missing provider imply Linear for new Plane work.

**Schema pattern** (source `apps/orchestrator-api/src/db/schema.ts`, lines 84-135):
```typescript
export const runs = pgTable(
  'runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    linearIssueId: text('linear_issue_id').notNull(),
    linearIssueIdentifier: text('linear_issue_identifier').notNull(),
    cardProvider: text('card_provider').notNull().default('linear'),
    cardId: text('card_id'),
    cardIdentifier: text('card_identifier'),
    cardProjectId: text('card_project_id'),
    title: text('title').notNull(),
```

```typescript
uniqueIndex('runs_active_card_uq')
  .on(t.cardProvider, t.cardId)
  .where(
    sql`${t.status} in ('pending','planning','awaiting_approval','executing','reviewing') and ${t.cardId} is not null`,
  ),
```

**Migration analog** (source `apps/orchestrator-api/drizzle/0015_card_providers.sql`, lines 1-16):
```sql
ALTER TABLE "runs" ADD COLUMN IF NOT EXISTS "card_provider" text NOT NULL DEFAULT 'linear';
ALTER TABLE "runs" ADD COLUMN IF NOT EXISTS "card_id" text;
ALTER TABLE "runs" ADD COLUMN IF NOT EXISTS "card_identifier" text;
ALTER TABLE "runs" ADD COLUMN IF NOT EXISTS "card_project_id" text;

UPDATE "runs"
SET
  "card_provider" = 'linear',
  "card_id" = "linear_issue_id",
  "card_identifier" = "linear_issue_identifier"
WHERE "card_id" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "runs_active_card_uq"
ON "runs" ("card_provider", "card_id")
WHERE "status" in ('pending','planning','awaiting_approval','executing','reviewing')
  AND "card_id" IS NOT NULL;
```

Planner instruction: if changing DB default, create a non-destructive follow-up migration, likely `ALTER TABLE "runs" ALTER COLUMN "card_provider" SET DEFAULT 'plane';`. Do not drop `linear_issue_*`.

### Queue, Worker, And Scheduler Provider Resolution

**Target files:** `apps/orchestrator-api/src/queue.ts`, `apps/orchestrator-api/src/queue.test.ts`, `apps/orchestrator-api/src/worker.ts`, `apps/orchestrator-api/src/worker.test.ts`, `apps/orchestrator-api/src/scheduleWorker.ts`, `apps/orchestrator-api/src/scheduleWorker.test.ts`.

**Analog:** `apps/orchestrator-api/src/queue.ts`

**Queue payload pattern** (lines 17-27):
```typescript
export type PlanJobData = {
  kind: 'plan';
  runId: string;
  cardProvider: CardProvider;
  cardId: string;
  issueId?: string;
  context?: string;
};

export type AgentJobData = PlanJobData | { kind: 'resume'; runId: string };
```

**Current fallback to remove/gate** (lines 53-62):
```typescript
export function resolvePlanJobCardRef(
  job: Pick<PlanJobData, 'cardProvider' | 'cardId' | 'issueId'>,
): { cardProvider: CardProvider; cardId: string } {
  const cardProvider = job.cardProvider ?? 'linear';
  const cardId = job.cardId ?? job.issueId;
  if (!cardId) {
    throw new Error('Plan job is missing cardId');
  }
  return { cardProvider, cardId };
}
```

Planner instruction: add `queue.test.ts` before editing. Characterize that missing `cardProvider` is not accepted for new jobs; only `issueId` plus explicit legacy context can resolve to Linear.

**Worker provider resolution pattern** (source `apps/orchestrator-api/src/worker.ts`, lines 115-149):
```typescript
const run = await getRun(runId);
if (job.data.kind === 'plan') {
  const planJobCard = resolvePlanJobCardRef(job.data);
  const graphProvider = toCardProvider(run?.cardProvider) ?? planJobCard.cardProvider;
  const graph = resolveAgentGraph(agent, graphProvider);
  const cardId = run?.cardId ?? planJobCard.cardId;
  const cardGateway = cards.forProvider(graphProvider);
  const issue = await cardGateway.getCard(cardId);
```

```typescript
} else {
  const graphProvider = toCardProvider(run?.cardProvider) ?? 'linear';
  const graph = resolveAgentGraph(agent, graphProvider);
  await updateRunStatus(runId, 'executing');
  result = await graph.invoke(null, config);
}
```

**Worker comment routing pattern** (lines 163-192 and 212-224):
```typescript
if (status === 'awaiting_approval') {
  const reasons = result.approvalReasons ?? ['plan'];
  await recordApproval(runId, reasons, `Motivos: ${reasons.join(', ')}`);

  const run = await getRun(runId);
  if (run?.autoApprove) {
    if (hasCriticalReason(reasons)) {
      const critical = reasons.filter(isCriticalReason);
      const runCardRef = resolveRunCardRef(run);
      await cards
        .forProvider(runCardRef.cardProvider)
        .comment(
          runCardRef.cardId,
          `## ⏸️ Agendado pausado — aprovação humana necessária\nMotivo(s): ${critical.join(', ')}. Adicione a label \`approved\` para liberar.`,
        );
```

```typescript
if (total > env.AGENT_MAX_COST_PER_RUN_USD) {
  log.warn({ total, limit: env.AGENT_MAX_COST_PER_RUN_USD }, 'run estourou o orçamento');
  if (run) {
    const runCardRef = resolveRunCardRef(run);
    await cards
      .forProvider(runCardRef.cardProvider)
      .comment(
        runCardRef.cardId,
        `## 💸 Alerta de custo\nRun excedeu o limite por task: ~$${total.toFixed(4)} > $${env.AGENT_MAX_COST_PER_RUN_USD}.`,
      );
  }
}
```

**Current run-card fallback to remove/gate** (lines 307-318 and 341-345):
```typescript
function toCardProvider(value: string | null | undefined): CardProvider | undefined {
  return value === 'plane' || value === 'linear' ? value : undefined;
}

function resolveRunCardRef(run: NonNullable<Awaited<ReturnType<typeof getRun>>>): {
  cardProvider: CardProvider;
  cardId: string;
} {
  return {
    cardProvider: toCardProvider(run.cardProvider) ?? 'linear',
    cardId: run.cardId ?? run.linearIssueId,
  };
}
```

```typescript
const sourceCardProvider = toCardProvider(sourceRun.cardProvider) ?? 'linear';
const sourceCardId = sourceRun.cardId ?? sourceRun.linearIssueId;
const sourceGateway = args.cards.forProvider(sourceCardProvider);
const issue = await sourceGateway.getCard(sourceCardId);
```

Planner instruction: worker should resolve from persisted `run.cardProvider` and `run.cardId`; fallback to Linear only when row explicitly says `linear` or this is a migration/legacy compatibility branch.

**Scheduler create-card pattern** (source `apps/orchestrator-api/src/scheduleWorker.ts`, lines 59-88):
```typescript
const card = await cards.primary.createCard({
  title: schedule.title,
  description: schedule.description,
  labelIds: env.PLANE_SCHEDULED_LABEL_ID
    ? [env.PLANE_SCHEDULED_LABEL_ID]
    : env.LINEAR_SCHEDULED_LABEL_ID
      ? [env.LINEAR_SCHEDULED_LABEL_ID]
      : undefined,
});

const runId = await createRun({
  ...(card.provider === 'linear'
    ? { linearIssueId: card.id, linearIssueIdentifier: card.identifier }
    : {}),
  cardProvider: card.provider,
  cardId: card.id,
  cardIdentifier: card.identifier,
  cardProjectId: card.projectId,
  title: schedule.title,
  scheduleId,
  autoApprove: schedule.autoApprove,
});
```

Planner instruction: remove the `LINEAR_SCHEDULED_LABEL_ID` fallback for active scheduler-created cards. Tests should assert Plane scheduled label is used and missing Plane label means no label, not Linear label.

**New test analog** (source `apps/orchestrator-api/src/workerManager.test.ts`, lines 49-80):
```typescript
describe('createWorkerManager.dispatch', () => {
  it('manda no 1º saudável e não tenta os outros', async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      calls.push(url);
      if (url.endsWith('/health')) return res({ ok: true });
      return res({ json: { status: 'succeeded', branch: 'b' } });
    }) as unknown as typeof fetch;
    const wm = createWorkerManager({
      baseUrls: ['http://a', 'http://b'],
      authToken: 'tok',
      fetchImpl,
    });
    const r = await wm.dispatch(body);
    expect(r.status).toBe('succeeded');
    expect(calls).toEqual(['http://a/health', 'http://a/jobs/sync']);
  });
```

**Scheduler route test analog** (source `apps/orchestrator-api/src/routes/schedules.test.ts`, lines 13-31 and 49-63):
```typescript
vi.mock('../schedules.js', () => ({
  createSchedule: vi.fn(),
  listSchedules: vi.fn(),
  getSchedule: vi.fn(),
  updateSchedule: vi.fn(),
  deleteSchedule: vi.fn(),
}));
vi.mock('../scheduleQueue.js', () => ({
  upsertScheduleJob: vi.fn(),
  removeScheduleJob: vi.fn(),
}));
vi.mock('../runs.js', () => ({ listRunsBySchedule: vi.fn() }));
vi.mock('../env.js', () => ({ env: { RUNNER_AUTH_TOKEN: 'tok', SCHEDULER_TZ: 'UTC' } }));

const auth = { authorization: 'Bearer tok' };
const app = new Hono();
app.route('/', schedulesRoute);
```

```typescript
it('cria e registra o scheduler', async () => {
  vi.mocked(createSchedule).mockResolvedValue({
    id: 's1',
    cron: '0 9 * * 1',
    tz: 'UTC',
    enabled: true,
  } as never);
  const res = await app.request('/schedules', {
    method: 'POST',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'x', cron: '0 9 * * 1', title: 't', description: 'd' }),
  });
  expect(res.status).toBe(201);
  expect(upsertScheduleJob).toHaveBeenCalledWith({ id: 's1', cron: '0 9 * * 1', tz: 'UTC' });
});
```

### Mission Control Card-Run History

**Target files:** `apps/orchestrator-api/src/routes/admin.ts`, `apps/orchestrator-api/src/routes/admin.test.ts`.

**Analog:** `apps/orchestrator-api/src/routes/admin.ts`

**Auth pattern** (lines 54-62):
```typescript
async function requireAdmin(c: Context, next: Next) {
  if (c.req.header('authorization') !== `Bearer ${env.RUNNER_AUTH_TOKEN}`) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  await next();
}

adminRoute.use('/admin/*', requireAdmin);
```

**Mission summary card pattern** (lines 166-174):
```typescript
return {
  id: run.id,
  scenarioId: scenario.id,
  title: run.title,
  card: {
    provider: run.cardProvider,
    id: run.cardId,
    identifier: run.cardIdentifier,
  },
```

**Card-run history route** (lines 631-649):
```typescript
adminRoute.get('/admin/card-runs', async (c) => {
  const provider = c.req.query('provider');
  const cardId = c.req.query('cardId');
  const limit = Number(c.req.query('limit') ?? 20);

  if (!provider || !cardId) {
    return c.json({ error: 'provider and cardId are required' }, 400);
  }
  if (provider !== 'plane' && provider !== 'linear') {
    return c.json({ error: 'provider must be plane or linear' }, 400);
  }

  const runs = await listRunsForCard(
    provider,
    cardId,
    Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 100) : 20,
  );
  return c.json({ runs });
});
```

**Admin test pattern** (source `apps/orchestrator-api/src/routes/admin.test.ts`, lines 565-619):
```typescript
describe('GET /admin/card-runs', () => {
  it('401 sem bearer', async () => {
    const res = await app.request('/admin/card-runs?provider=plane&cardId=card-1');
    expect(res.status).toBe(401);
  });

  it('exige provider e cardId', async () => {
    const res = await app.request('/admin/card-runs?provider=plane', { headers: auth });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'provider and cardId are required' });
  });

  it('devolve runs recentes para auditoria de webhook/card', async () => {
```

```typescript
expect(res.status).toBe(200);
expect(listRunsForCard).toHaveBeenCalledWith('plane', 'card-1', 20);
await expect(res.json()).resolves.toEqual({
  runs: [
    {
      id: 'run-1',
      cardProvider: 'plane',
      cardId: 'card-1',
      cardIdentifier: 'AGP-34',
      status: 'completed',
```

Planner instruction: Mission Control is already Plane-focused. Add/update tests only if cutover changes provider validation or display fallback behavior.

### Graph Report And Auto-Merge Provider Neutrality

**Target files:** `packages/graph/src/nodes/report.test.ts`, `packages/graph/src/nodes/merging.test.ts`, `packages/graph/src/nodes/autoMerge.test.ts`.

**Analog:** `packages/cards/src/index.ts`

**Card gateway contract** (lines 1-35):
```typescript
export type CardProvider = 'plane' | 'linear';

export interface CardContext {
  provider: CardProvider;
  id: string;
  identifier: string;
  title: string;
  description: string;
  labels: string[];
  url?: string;
  projectId?: string;
}

export interface CardGateway {
  provider: CardProvider;
  getCard(id: string): Promise<CardContext>;
  comment(cardId: string, body: string): Promise<void>;
  setCardState(cardId: string, stateId: string): Promise<void>;
  createCard(input: CreateCardInput): Promise<CardContext>;
}
```

**Graph injection pattern** (source `packages/graph/src/build.ts`, lines 84-104):
```typescript
const pr = makePrNode({
  github: deps.github,
  cards: deps.cards,
  baseBranch: deps.baseBranch ?? 'main',
});
const merging = makeMergingNode({
  github: deps.github,
  cards: deps.cards,
  doneStateId: deps.doneStateId,
});
const cloudflareDeploy = makeCloudflareDeployNode({
  cards: deps.cards,
```

```typescript
const report = makeReportNode({ cards: deps.cards });
```

**Report node comment pattern** (source `packages/graph/src/nodes/report.ts`, lines 71-106):
```typescript
export function makeReportNode(deps: ReportDeps) {
  return async (state: AgentStateType): Promise<Partial<AgentStateType>> => {
    const ok = state.status === 'completed';
    const verdict = verdictOf(state.review);
    const reproved = /REPROVADO/i.test(verdict);
    const testsFailed = state.testsPassed === false;
    const icon = !ok ? '❌' : reproved || testsFailed ? '⚠️' : '✅';

    const lines = [`## ${icon} Resultado — ${state.issueIdentifier}`, ''];
```

```typescript
await deps.cards.comment(state.issueId, lines.join('\n'));
return {};
```

**Report test pattern** (source `packages/graph/src/nodes/report.test.ts`, lines 24-61):
```typescript
it('report node accepts a generic card gateway', async () => {
  const comments: string[] = [];
  const cards: CardGateway = {
    provider: 'plane',
    getCard: async () => ({
      provider: 'plane',
      id: 'card-1',
      identifier: 'AGP-1',
      title: 'Card',
      description: '',
      labels: [],
    }),
    comment: async (_cardId, body) => {
      comments.push(body);
    },
```

**Merging node provider-neutral pattern** (source `packages/graph/src/nodes/merging.ts`, lines 18-52):
```typescript
export function makeMergingNode(deps: MergingDeps) {
  return async (state: AgentStateType): Promise<Partial<AgentStateType>> => {
    if (!shouldAutoMerge(state) || !state.prNumber) return {};
    const targetRepo = state.targetRepo ? parseRepoFullName(state.targetRepo) : undefined;
    try {
      await deps.github.mergePullRequest({
        number: state.prNumber,
        method: 'squash',
        ...(targetRepo ? { repo: targetRepo } : {}),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await deps.cards.comment(
        state.issueId,
        `## ⚠️ Auto-merge falhou — merge manual\n\n\`\`\`\n${msg}\n\`\`\``,
      );
      return {};
    }
```

**Auto-merge gate tests** (source `packages/graph/src/nodes/autoMerge.test.ts`, lines 6-48):
```typescript
describe('shouldAutoMerge', () => {
  it('true com opt-in + validação ✅ + APROVADO seco', () => {
    expect(shouldAutoMerge(base)).toBe(true);
  });
  it('false sem a label de opt-in', () => {
    expect(shouldAutoMerge({ ...base, autoMerge: false })).toBe(false);
  });
  it('false com APROVADO COM RESSALVAS', () => {
    expect(shouldAutoMerge({ ...base, review: 'Veredito: APROVADO COM RESSALVAS' })).toBe(false);
  });
```

Planner instruction: graph source should remain provider-neutral. Use these tests to prove Plane gateway injection covers report/comment and auto-merge state updates.

### Linear-To-Plane Migration-Only Path

**Target files:** `apps/orchestrator-api/src/planeMigration.ts`, `apps/orchestrator-api/src/planeMigrationCli.ts`, `apps/orchestrator-api/src/planeMigration.test.ts`, `packages/plane/src/index.test.ts`, `docs/runbooks/plane-migration-2026-06-20.md`.

**Analog:** `apps/orchestrator-api/src/planeMigration.ts`

**Migration service pattern** (lines 92-148):
```typescript
export async function migrateLinearCardsToPlane(
  input: PlaneMigrationInput,
): Promise<PlaneMigrationResult> {
  let created = 0;
  let commented = 0;
  let skipped = 0;
  const failed: Array<{ id: string; error: string }> = [];

  for (const card of input.linearCards) {
    try {
      const provenanceComment = buildProvenanceComment(card);
      const existing = await input.plane.listCardsByExternal({
        externalSource: 'linear',
        externalId: card.id,
      });
```

```typescript
const createdCard = await input.plane.createCard({
  title: card.title,
  description: card.description,
  priority: card.priority,
  labelIds: card.labels
    .map((label) => input.labelIds[label])
    .filter((labelId): labelId is string => Boolean(labelId)),
  stateId,
  externalSource: 'linear',
  externalId: card.id,
});
```

**Migration CLI env guard** (source `apps/orchestrator-api/src/planeMigrationCli.ts`, lines 65-78):
```typescript
function getRequiredPlaneConfig() {
  if (!env.PLANE_API_KEY) {
    throw new Error('PLANE_API_KEY is required for plane:migrate-linear');
  }
  if (!env.LINEAR_API_KEY || !env.LINEAR_TEAM_ID) {
    throw new Error('LINEAR_API_KEY and LINEAR_TEAM_ID are required for plane:migrate-linear');
  }

  return {
    planeApiKey: env.PLANE_API_KEY,
    linearApiKey: env.LINEAR_API_KEY,
    linearTeamId: env.LINEAR_TEAM_ID,
  };
}
```

**Migration CLI main pattern** (lines 159-186):
```typescript
export async function main() {
  const config = getRequiredPlaneConfig();
  const bootstrap = await ensurePlaneProjectAndLabels({
    baseUrl: env.PLANE_BASE_URL,
    apiKey: config.planeApiKey,
    workspaceSlug: env.PLANE_WORKSPACE_SLUG,
  });
  const plane = createPlaneGateway({
    baseUrl: env.PLANE_BASE_URL,
    apiKey: config.planeApiKey,
    workspaceSlug: env.PLANE_WORKSPACE_SLUG,
    projectId: bootstrap.projectId,
  });
```

**Plane gateway external provenance pattern** (source `packages/plane/src/index.ts`, lines 127-141):
```typescript
async createCard(input: CreateCardInput) {
  const item = await request<PlaneWorkItem>(`/projects/${config.projectId}/work-items/`, {
    method: 'POST',
    body: JSON.stringify({
      name: input.title,
      description_html: markdownToPlaneHtml(input.description),
      description_stripped: input.description,
      labels: input.labelIds,
      priority: input.priority,
      state: input.stateId,
      external_source: input.externalSource,
      external_id: input.externalId,
    }),
  });
  return toCardContext(item, config.projectId);
},
```

**Migration test pattern** (source `apps/orchestrator-api/src/planeMigration.test.ts`, lines 11-65):
```typescript
describe('migrateLinearCardsToPlane', () => {
  it('skips cards already present by external id and creates missing cards', async () => {
    const plane = {
      listCardsByExternal: vi
        .fn()
        .mockResolvedValueOnce([{ id: 'existing' }])
        .mockResolvedValueOnce([]),
      listComments: vi
        .fn()
        .mockResolvedValueOnce([
          '<p>Migrated from Linear: <a href="https://linear/MAC-1">MAC-1</a>.</p>',
        ]),
      createCard: vi.fn().mockResolvedValue({ id: 'created', identifier: 'AGP-2' }),
      comment: vi.fn(),
    };
```

Planner instruction: keep this path even after active runtime Linear paths are gated. Move any Linear env setup into these migration tests.

### Env Examples, Operator Docs, And Dashboards

**Target files:** `apps/orchestrator-api/.env.example`, `infra/compose/orchestrator/.env.example`, `README.md`, `docs/ARCHITECTURE.md`, `docs/CURRENT.md`, `docs/runbooks/webhook-tailscale.md`, `docs/runbooks/secrets.md`, dashboard JSON.

**Env example analog** (source `apps/orchestrator-api/.env.example`, lines 17-35):
```dotenv
# Card providers
CARD_PRIMARY_PROVIDER=plane
CARD_EXTRA_PROVIDERS=linear

# Plane (provider principal)
PLANE_BASE_URL=http://10.10.0.14:8080
PLANE_API_KEY=change-me
PLANE_WORKSPACE_SLUG=attodev
PLANE_PROJECT_ID=change-me
PLANE_WEBHOOK_SECRET=change-me
PLANE_AI_READY_LABEL_ID=change-me
PLANE_APPROVED_LABEL_ID=change-me
PLANE_AUTO_MERGE_LABEL_ID=change-me
PLANE_SCHEDULED_LABEL_ID=change-me
PLANE_DONE_STATE_ID=change-me

# Legacy optional provider: Linear
LINEAR_API_KEY=lin_api_change-me
LINEAR_WEBHOOK_SECRET=change-me
```

Planner instruction: change examples to Plane-only defaults (`CARD_EXTRA_PROVIDERS=`). Keep Linear keys under a legacy/migration-only comment, not active default.

**Compose env example analog** (source `infra/compose/orchestrator/.env.example`, lines 11-29):
```dotenv
# Card providers
CARD_PRIMARY_PROVIDER=plane
CARD_EXTRA_PROVIDERS=linear

# Plane (provider principal)
PLANE_BASE_URL=http://10.10.0.14:8080
PLANE_API_KEY=change-me
PLANE_WORKSPACE_SLUG=attodev
PLANE_PROJECT_ID=change-me
PLANE_WEBHOOK_SECRET=change-me
PLANE_AI_READY_LABEL_ID=change-me
PLANE_APPROVED_LABEL_ID=change-me
PLANE_AUTO_MERGE_LABEL_ID=change-me
PLANE_SCHEDULED_LABEL_ID=change-me
PLANE_DONE_STATE_ID=change-me

# Legacy optional provider: Linear
LINEAR_WEBHOOK_SECRET=change-me
LINEAR_API_KEY=lin_api_change-me
```

**README wording to update** (source `README.md`, lines 40-49 and 93-98):
```markdown
Plane (primary card provider) → Orchestrator API → agent-runners → GitHub PR/merge → Plane report
                                   ↓
                            LiteLLM Gateway
                                   ↓
                      Verboo / OmniRoute combos
```

```markdown
Linear remains supported as an optional provider for legacy cards through `/webhooks/linear`.
```

```markdown
packages/
  cards/                # Abstração comum de providers de cards
  graph/                # State machines
  llm/                  # Cliente LiteLLM
  plane/                # Integração Plane (provider primário)
  linear/               # Integração Linear (legado opcional)
```

Planner instruction: replace "optional provider" with "legacy/migration-only compatibility" where active guidance appears.

**Architecture wording to update** (source `docs/ARCHITECTURE.md`, lines 3-7, 36-51, 57-61):
```markdown
card do Plane (workspace `attodev`, projeto **Agent Platform** / `AGP`) se
encaixa na estrutura. Linear fica como provider opcional legado e só entra no
mapa quando existe card histórico ou suporte explícito em `/webhooks/linear`.
```

```mermaid
PLANE["Plane (primary card provider)"]
LINEAR["Linear (legacy optional provider)"]
PLANE -->|"webhook (label ai-ready / approved)"| ORCH
LINEAR -.legacy webhook.-> ORCH
ORCH -->|"status · comentários"| PLANE
ORCH -.legacy status/comments.-> LINEAR
```

```markdown
Plane é o provider primário e
`/webhooks/linear` segue disponível como legado/optional via Tailscale Funnel.
```

**Current-state wording analog** (source `docs/CURRENT.md`, lines 5-8 and 26-30):
```markdown
`agent-platform` is a self-hosted agent delivery platform. Plane cards in
workspace `attodev`, project `Agent Platform` (`AGP`), are the current
operational intake surface. Linear remains legacy optional support and migration
history, not the default path for new work.
```

```markdown
| Card providers | `packages/cards`, `packages/plane`, `packages/linear`, `apps/orchestrator-api/src/cards.ts` | Plane is primary; Linear is legacy optional. |
| Webhook intake | `apps/orchestrator-api/src/routes/webhooks.ts` | Plane and Linear are still mixed in one route hub. |
| Run persistence | `apps/orchestrator-api/src/runs.ts`, `apps/orchestrator-api/src/db/schema.ts` | Generic card fields exist, but legacy Linear fields still matter. |
```

**Webhook runbook wording to update** (source `docs/runbooks/webhook-tailscale.md`, lines 39-67 and 118-129):
````markdown
Expõe o Plane primário → `localhost:3000` (o resto fica privado):
```bash
pct exec 201 -- tailscale funnel --bg --set-path=/webhooks/plane http://127.0.0.1:3000/webhooks/plane
```

Expõe também o Linear legado → `localhost:3000`:
```bash
pct exec 201 -- tailscale funnel --bg --set-path=/webhooks/linear http://127.0.0.1:3000/webhooks/linear
```
````

````markdown
Para auditar runs já criados para um card específico, use o endpoint interno
protegido por bearer:

```bash
TOKEN="$(pct exec 201 -- docker exec orchestrator-api-1 printenv RUNNER_AUTH_TOKEN)"
curl -fsS \
  -H "authorization: Bearer $TOKEN" \
  "http://10.10.0.11:3000/admin/card-runs?provider=plane&cardId=<work-item-id>"
```
````

Planner instruction: make Plane the only active webhook exposure. Keep Linear webhook exposure as a manual legacy/migration note unless explicit confirmation disables/deletes route support.

**Secrets runbook wording to update** (source `docs/runbooks/secrets.md`, lines 17-30 and 39-42):
```markdown
## Configuração de cards

- `CARD_PRIMARY_PROVIDER=plane`
- `CARD_EXTRA_PROVIDERS=linear`
- `PLANE_BASE_URL=http://10.10.0.14:8080`
- `PLANE_WORKSPACE_SLUG=attodev`
- `PLANE_PROJECT_ID=change-me`
- `PLANE_AI_READY_LABEL_ID=change-me`
- `PLANE_APPROVED_LABEL_ID=change-me`
- `PLANE_AUTO_MERGE_LABEL_ID=change-me`
- `PLANE_SCHEDULED_LABEL_ID=change-me`
- `PLANE_DONE_STATE_ID=change-me`
- Linear continua como provider legado opcional; mantenha os envs dele só quando houver cards históricos ou suporte explícito.
```

```markdown
| `PLANE_API_KEY` | orchestrator `.env` | Plane SDK / API | Plane → Settings → API |
| `PLANE_WEBHOOK_SECRET` | orchestrator `.env` | HMAC do webhook | Plane → Webhooks |
| `LINEAR_API_KEY` | orchestrator `.env` (legado opcional) | Linear SDK | Linear → Settings → API |
| `LINEAR_WEBHOOK_SECRET` | orchestrator `.env` (legado opcional) | HMAC do webhook | Linear → Webhooks |
```

**Dashboard SQL anti-patterns to replace**:

Source `infra/compose/observability/provisioning/dashboards/agent-runs.json` lines 166, 346, 449:
```json
"rawSql": "SELECT created_at, linear_issue_identifier AS issue, title, status, branch, pr_url, sandbox_backend, sandbox_image, round((sandbox_total_duration_ms / 1000.0)::numeric, 1) AS sandbox_s, sandbox_command_count, sandbox_failed_command FROM runs ORDER BY created_at DESC LIMIT 50;"
"rawSql": "SELECT created_at AS time, linear_issue_identifier AS metric, sandbox_total_duration_ms / 1000.0 AS value FROM runs WHERE $__timeFilter(created_at) AND sandbox_total_duration_ms IS NOT NULL ORDER BY created_at;"
"rawSql": "SELECT created_at, linear_issue_identifier AS issue, status, verdict, tests_passed, pr_url, branch FROM runs WHERE auto_merge ORDER BY created_at DESC LIMIT 50;"
```

Source `infra/compose/observability/provisioning/dashboards/quality-memory.json` lines 338, 418, 536:
```json
"rawSql": "SELECT created_at, linear_issue_identifier AS issue, tests_passed, fix_attempts, sandbox_backend, sandbox_image, sandbox_network, sandbox_command_count, round((sandbox_total_duration_ms / 1000.0)::numeric, 1) AS sandbox_s, round((sandbox_max_command_duration_ms / 1000.0)::numeric, 1) AS max_cmd_s, sandbox_failed_command FROM runs WHERE sandbox_backend IS NOT NULL ORDER BY created_at DESC LIMIT 50;"
"rawSql": "SELECT r.created_at AS time, r.linear_issue_identifier AS metric, coalesce(sum(s.cost_usd), 0) AS value FROM runs r JOIN run_steps s ON s.run_id = r.id WHERE $__timeFilter(r.created_at) AND s.model LIKE '%critic%' GROUP BY r.created_at, r.linear_issue_identifier ORDER BY r.created_at;"
"rawSql": "SELECT r.created_at, r.linear_issue_identifier AS issue, r.status, r.tests_passed, r.sandbox_command_count, r.sandbox_failed_command, CASE WHEN a.content ILIKE '%pnpm verify%' THEN 'pnpm verify' WHEN a.content ILIKE '%pnpm test%' THEN 'legacy pnpm test' ELSE '(sem evidencia)' END AS validation_gate, left(regexp_replace(coalesce(a.content, ''), '[[:space:]]+', ' ', 'g'), 240) AS validation_excerpt FROM runs r LEFT JOIN artifacts a ON a.run_id = r.id AND a.kind = 'validation' WHERE r.sandbox_backend IS NOT NULL ORDER BY r.created_at DESC LIMIT 50;"
```

Recommended replacement pattern:
```sql
coalesce(card_identifier, linear_issue_identifier) AS issue
```

For time-series metrics:
```sql
coalesce(card_identifier, linear_issue_identifier) AS metric
```

Include `card_provider` in table panels where it helps operators distinguish Plane rows from legacy Linear rows.

## Shared Patterns

### Authentication

**Source:** `apps/orchestrator-api/src/routes/admin.ts` lines 54-62
**Apply to:** admin/card-run history tests and any new admin verification route.

```typescript
async function requireAdmin(c: Context, next: Next) {
  if (c.req.header('authorization') !== `Bearer ${env.RUNNER_AUTH_TOKEN}`) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  await next();
}

adminRoute.use('/admin/*', requireAdmin);
```

### Webhook Security

**Source:** `apps/orchestrator-api/src/routes/webhooks.ts` lines 85-90 and 319-322
**Apply to:** Plane webhook tests and any legacy webhook gating.

```typescript
if (!verifyPlaneSignature(rawBody, signature)) {
  logger.warn('Plane webhook with invalid signature rejected');
  return c.json({ error: 'invalid signature' }, 401);
}
```

### Provider Resolution

**Source:** `packages/cards/src/index.ts` lines 37-53
**Apply to:** provider registration, agent graph binding, worker comment routing.

```typescript
export function createCardGatewayRegistry(input: {
  primaryProvider: CardProvider;
  gateways: CardGateway[];
}): CardGatewayRegistry {
  const byProvider = new Map<CardProvider, CardGateway>();
  for (const gateway of input.gateways) byProvider.set(gateway.provider, gateway);
  const primary = byProvider.get(input.primaryProvider);
  if (!primary) throw new Error(`Primary card provider not configured: ${input.primaryProvider}`);

  return {
    primary,
    forProvider(provider) {
      const gateway = byProvider.get(provider);
      if (!gateway) throw new Error(`Card provider not configured: ${provider}`);
      return gateway;
    },
  };
}
```

### Error Handling

**Sources:** `packages/plane/src/index.ts` lines 71-74, `apps/orchestrator-api/src/routes/webhooks.ts` lines 195-204, `apps/orchestrator-api/src/worker.ts` lines 252-266.

Use explicit errors for misconfiguration or API failures; use local non-fatal `try/catch` only for side effects that must not fail the run.

```typescript
if (!res.ok) {
  const body = await res.text().catch(() => '');
  throw new Error(`Plane API ${res.status} ${res.statusText}: ${body}`);
}
```

```typescript
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
```

```typescript
try {
  if (job.data.kind === 'plan') {
    await saveArtifacts(runId, { plan: result.plan });
  } else {
    await saveArtifacts(runId, {
      patch: result.diff,
      review: result.review,
      validation: result.testSummary,
      summary: result.summary,
      research: result.research,
    });
  }
} catch (err) {
  log.warn({ err }, 'falha ao salvar artefatos (não-fatal)');
}
```

### Test Isolation

**Source:** `apps/orchestrator-api/src/env.test.ts` lines 22-50 and `apps/orchestrator-api/src/planeMigration.test.ts` lines 327-440.

Use `vi.resetModules()` before dynamic imports when env module state is under test. Use `vi.doMock` for CLI modules that import `env.ts` at module load.

### Compatibility Boundary

**Source:** `.planning/phases/03-plane-only-provider-cutover/03-CONTEXT.md` and existing code analogs.

Apply this rule across all plans:

- New intake, reports, scheduler, card-run history, and defaults are Plane-only.
- `linear_issue_id` and `linear_issue_identifier` stay readable and populated for compatibility.
- `packages/linear`, `/webhooks/linear`, and `plane:migrate-linear` are not deleted in this phase.
- Linear fallback is allowed only when row data explicitly says `cardProvider: 'linear'` or a migration command is operating on Linear-origin data.

## No Analog Found

None. New files (`queue.test.ts`, `worker.test.ts`, `scheduleWorker.test.ts`, optional `0017_plane_default_card_provider.sql`) have close role-match analogs in the codebase.

## Metadata

**Analog search scope:** `apps/orchestrator-api/src`, `packages/cards`, `packages/plane`, `packages/graph`, `infra/compose/observability/provisioning/dashboards`, `docs`, `README.md`, `vitest.setup.ts`.

**Files scanned:** 292 files in targeted scope, 402 files in repo listing.

**Pattern extraction date:** 2026-07-02
