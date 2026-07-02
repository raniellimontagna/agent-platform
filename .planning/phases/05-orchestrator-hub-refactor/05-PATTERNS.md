# Phase 5: Orchestrator Hub Refactor - Pattern Map

**Mapped:** 2026-07-02
**Files analyzed:** 18 candidate new/modified files
**Analogs found:** 18 / 18

## Scope Inputs

Primary scope came from `05-CONTEXT.md`, `ROADMAP.md`, `REQUIREMENTS.md`, `STATE.md`, and Phase 4 summaries. Phase 5 is a behavior-preserving refactor. Keep Plane as the active provider, keep `/webhooks/linear` as legacy compatibility only, preserve source-owner contracts from Phase 4, and do not add worker/eval/schema/deploy changes.

`05-RESEARCH.md` now exists in the Phase 5 directory and should be read before planning or executing.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `apps/orchestrator-api/src/routes/routeAuth.ts` | middleware | request-response | `apps/orchestrator-api/src/routes/agents.ts` | exact extraction |
| `apps/orchestrator-api/src/routes/routeAuth.test.ts` | test | request-response | `apps/orchestrator-api/src/routes/agents.test.ts`, `admin.test.ts` | role-match |
| `apps/orchestrator-api/src/routes/rendering.ts` | utility | transform | `apps/orchestrator-api/src/routes/registry.ts`, `admin.ts` | exact extraction |
| `apps/orchestrator-api/src/routes/rendering.test.ts` | test | transform | `apps/orchestrator-api/src/routes/admin.test.ts` render tests | role-match |
| `apps/orchestrator-api/src/routes/agents.ts` | route | CRUD/request-response | current file | exact |
| `apps/orchestrator-api/src/routes/tools.ts` | route | CRUD/request-response | current file | exact |
| `apps/orchestrator-api/src/routes/schedules.ts` | route | CRUD/request-response | current file | exact |
| `apps/orchestrator-api/src/routes/registry.ts` | route/component | request-response/transform | current file | exact |
| `apps/orchestrator-api/src/routes/admin.ts` | route/controller | request-response | current file | exact |
| `apps/orchestrator-api/src/routes/admin.test.ts` | test | request-response/transform | current file | exact |
| `apps/orchestrator-api/src/webhookSignature.ts` | utility | request-response | `routes/webhooks.ts` signature helpers | exact extraction |
| `apps/orchestrator-api/src/planeWebhook.ts` | utility | transform/event-driven | `routes/webhooks.ts` Plane parsing block | exact extraction |
| `apps/orchestrator-api/src/cardWebhook.ts` | utility | event-driven/transform | current `labelJustAdded` owner | exact |
| `apps/orchestrator-api/src/webhookRunActions.ts` | service | event-driven | `routes/webhooks.ts` run action helpers | exact extraction |
| `apps/orchestrator-api/src/routes/webhooks.ts` | route/controller | event-driven/request-response | current file | exact |
| `apps/orchestrator-api/src/routes/webhooks.test.ts` | test | event-driven/request-response | current file | exact |
| `apps/orchestrator-api/src/missionControlData.ts` | service | CRUD/read aggregation | `routes/admin.ts`, `missionTimeline.ts` | exact extraction |
| `apps/orchestrator-api/src/missionControlRender.ts` | component/utility | transform | `routes/admin.ts`, `routes/registry.ts` | exact extraction |

## Concrete Mapping Table

| New/extracted concern | Closest existing analog | Source file/test | Cautions |
|---|---|---|---|
| Hono route singleton modules | `export const ...Route = new Hono()` plus direct handlers | `routes/admin.ts:28`, `routes/registry.ts:7`, `routes/artifacts.ts:6`; tests mount with `app.route('/', route)` in `admin.test.ts:22-26`, `webhooks.test.ts:57-64` | Keep route paths and exported route names stable. Do not replace Hono or add a router framework. |
| Shared bearer auth helper | Local `requireAuth`/`requireAdmin` middleware | `agents.ts:16-25`, `tools.ts:16-25`, `schedules.ts:17-25`, `admin.ts:54-62`; protected-route tests in `admin.test.ts:28-32`, `565-569` | Preserve exact header comparison, response body, and status. Do not trim, decode, accept lowercase schemes, or widen route coverage. |
| Shared HTML escaping and date formatting | Route-local `escapeHtml`/`formatDate` | `registry.ts:9-21`, `admin.ts:242-254`; package safety reference `packages/cards/src/index.ts:154-160` | Extract only boring primitives first. Do not weaken escaping. Keep status-class semantics local where meanings differ. |
| Registry/admin HTML rendering | Template string render functions with explicit escaping | `registry.ts:49-168`, `admin.ts:438-629`; render tests in `admin.test.ts:288-356`, `400-512` | Preserve test-visible strings, classes, links, empty states, and read-only copy. Avoid UI redesign. |
| Webhook signature verification | `verifySignature` and `verifyPlaneSignature` | `webhooks.ts:85-90`, `119-124`; tests `webhooks.test.ts:614-672` | Keep timing-safe length guard and Plane dev fallback. Production without secret must reject unsigned payloads. |
| Plane payload parsing | Plane payload interfaces and helpers | `webhooks.ts:51-117`, route parse/use at `332-385`; tests `webhooks.test.ts:328-416` | Preserve support for `type`, `event`, `x-plane-event`, `updated_from`, and `updatedFrom`. |
| Label transition detection | `labelJustAdded` | `cardWebhook.ts:1-24`; tests `cardWebhook.test.ts:4-46` | Keep this as transition owner. Do not duplicate different "newly added" semantics in webhook modules. |
| AI-ready enqueue action | `handleAiReadyCard` | `webhooks.ts:149-229`; tests `webhooks.test.ts:106-369`, `553-645` | Preserve active-run, paused, budget, unique-violation, workflow-agent, createRun, and queue payload order. |
| Approval resume action | Inline approved-label block | Linear `webhooks.ts:272-297`; Plane `webhooks.ts:386-423`; tests `webhooks.test.ts:418-451` | Approval only resumes when `approved` was newly added. Keep `resolveApproval`, status `executing`, and resume job priority sequence. |
| Plane removal cancellation | Inline removal-action block | `webhooks.ts:28-35`, `81-83`, `364-378`; tests `webhooks.test.ts:453-551` | Removal must run before label handling. Missing card id skips, not cancels. |
| Mission summary data assembly | `buildRecentMissionSummaries` and related list helpers | `admin.ts:140-239`; tests `admin.test.ts:81-286` | Keep scenario filtering, mission windowing by next source run, artifact/approval flattening, and JSON shape unchanged. |
| Mission timeline domain logic | `buildMissionTimeline` | `missionTimeline.ts:99-150`; support helpers `152-332` | Treat this as current domain owner. Do not move timeline state semantics into rendering helpers. |
| Mission scenario source | `E2E_MISSION_SCENARIOS` | `missionScenarios.ts:45-129`; scenario assertions `admin.test.ts:49-79` | Phase 4 source-owner guardrail: do not duplicate mutable scenario labels/stages in extracted render code. |
| Artifact route/data access shape | Thin Hono route over artifact service | `routes/artifacts.ts:8-21`, `artifacts.ts:21-42`; tests pattern found in `routes/artifacts.test.ts` | Mission detail links depend on `/artifacts/:id`; keep route unauthenticated per current internal-network comment unless separately planned. |

## Pattern Assignments

### Existing Hono Route Module Structure

**Analog:** `apps/orchestrator-api/src/routes/admin.ts`, `routes/registry.ts`, `routes/artifacts.ts`

**Imports and singleton pattern** (`admin.ts:1-28`):
```typescript
import type { CardProvider } from '@agent-platform/cards';
import { type Context, Hono, type Next } from 'hono';
import { env } from '../env.js';

export const adminRoute = new Hono();
```

**Handler pattern** (`admin.ts:95-123`):
```typescript
adminRoute.get('/admin/mission-control', async (c) => {
  const scenarios = listE2eMissionScenarios();
  const missions = await buildRecentMissionSummaries(20, scenarios);
  return c.html(renderMissionControlPage({ scenarios, missions }));
});

adminRoute.get('/admin/mission-control/missions', async (c) => {
  const limit = Number(c.req.query('limit') ?? 20);
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 100) : 20;
  const missions = await buildRecentMissionSummaries(safeLimit, listE2eMissionScenarios());

  return c.json({ missions });
});
```

**Validation/error pattern** (`agents.ts:47-58`, `schedules.ts:29-54`):
```typescript
const body = await c.req.json().catch(() => null);
const parsed = createAgentSchema.safeParse(body);
if (!parsed.success) return c.json({ error: 'payload invalido', issues: parsed.error.issues }, 400);
try {
  const row = await createAgent(parsed.data);
  return c.json(row, 201);
} catch (err) {
  if (err instanceof AgentExistsError) return c.json({ error: 'agent already exists' }, 409);
  logger.error({ err }, 'failed to create agent');
  return c.json({ error: 'internal server error' }, 500);
}
```

Use this pattern for extracted route modules: keep routes thin, use direct `c.json`/`c.html`, and preserve existing response bodies. Do not add a global error wrapper in Phase 5; current route behavior is local and test-visible.

### Existing Route Test Structure

**Analog:** `apps/orchestrator-api/src/routes/admin.test.ts`, `routes/webhooks.test.ts`

**Module mocks and app mounting** (`admin.test.ts:1-26`, `webhooks.test.ts:57-64`):
```typescript
import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminRoute } from './admin.js';

vi.mock('../env.js', () => ({ env: { RUNNER_AUTH_TOKEN: 'secret', AGENT_MAX_CONCURRENCY: 3 } }));

const app = new Hono();
app.route('/', adminRoute);
const auth = { authorization: 'Bearer secret' };

beforeEach(() => vi.clearAllMocks());
```

**Webhook signed request helper** (`webhooks.test.ts:57-74`):
```typescript
const app = new Hono();
app.route('/', webhooks);

function signed(body: string) {
  return createHmac('sha256', 'secret').update(body).digest('hex');
}

beforeEach(() => {
  vi.clearAllMocks();
  env.NODE_ENV = 'test';
  env.CARD_EXTRA_PROVIDERS = '';
  env.LINEAR_WEBHOOK_SECRET = 'secret';
  env.PLANE_WEBHOOK_SECRET = 'secret';
});
```

New tests should keep direct Hono requests and module mocks. Do not introduce live Plane, GitHub, Redis, BullMQ, or database dependencies for characterization coverage.

### Shared Bearer Auth Helper

**Analogs:** `agents.ts:16-25`, `tools.ts:16-25`, `schedules.ts:17-25`, `admin.ts:54-62`

**Current exact behavior**:
```typescript
async function requireAuth(c: Context, next: Next) {
  if (c.req.header('authorization') !== `Bearer ${env.RUNNER_AUTH_TOKEN}`) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  await next();
}
```

**Safest helper shape:** create `apps/orchestrator-api/src/routes/routeAuth.ts` with a single exported middleware such as `requireRunnerAuth`. It should import only Hono types and `env`, compare the raw `authorization` header exactly to `Bearer ${env.RUNNER_AUTH_TOKEN}`, return the same JSON/status, and call `await next()`.

**Route application patterns to copy:**
```typescript
agentsRoute.post('/agents', requireAuth);
agentsRoute.patch('/agents/:id', requireAuth);

schedulesRoute.use('/schedules', requireAuth);
schedulesRoute.use('/schedules/*', requireAuth);

adminRoute.use('/admin/*', requireAdmin);
```

**Cautions:**

- Preserve currently open reads in `agents.ts` and `tools.ts`; only writes are protected there.
- Preserve full `/admin/*` and `/schedules/*` coverage.
- Add helper tests for missing header, wrong token, and exact success; keep route-level 401 characterization tests.

### Shared HTML, Date, and Status Rendering Helpers

**Analogs:** `registry.ts:9-33`, `admin.ts:242-279`, `packages/cards/src/index.ts:154-160`

**Escape/date primitives to extract**:
```typescript
function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return '-';
  return new Date(value).toISOString().replace('T', ' ').slice(0, 19);
}
```

**Status helper caution:** `registry.ts:27-33` maps registry statuses to `ok/muted/warn`, while `admin.ts:264-279` maps Mission timeline statuses to `passed/active/failed/locked/skipped/pending`. Do not collapse these into one generic status-class function unless the helper accepts an explicit map. The safe first extraction is:

- `escapeHtml(value: unknown): string`
- `formatDate(value: Date | string | null | undefined): string`
- `humanizeStatus(value: string | undefined): string`

Keep `statusClass` in registry rendering and `stageStatusClass` in Mission Control rendering unless tests are added for the shared map behavior.

### Webhook Signature, Parsing, and Run Actions

**Signature analog** (`webhooks.ts:85-90`, `119-124`):
```typescript
function verifySignature(rawBody: string, signature: string | undefined, secret: string): boolean {
  if (!signature) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

function verifyPlaneSignature(rawBody: string, signature: string | undefined): boolean {
  if (!env.PLANE_WEBHOOK_SECRET) {
    return env.NODE_ENV !== 'production';
  }
  return verifySignature(rawBody, signature, env.PLANE_WEBHOOK_SECRET);
}
```

**Plane parsing analog** (`webhooks.ts:76-117`, `380-385`):
```typescript
function isPlaneWorkItemWebhook(payload: PlanePayload, eventHeader: string | undefined): boolean {
  const event = eventHeader ?? payload.event ?? payload.type;
  return event === 'work_item' || event === 'issue';
}

function planeLabelNames(labels: PlaneLabel[] | undefined): string[] | undefined {
  return labels?.map((label) => label.name ?? '').filter(Boolean);
}

function planeCardIdentifier(data: PlaneWorkItemData): string {
  const projectIdentifier = data.project_detail?.identifier ?? data.project_identifier ?? 'AGP';
  const sequence = data.sequence_id ?? data.sequenceId;
  return sequence ? `${projectIdentifier}-${sequence}` : (data.id ?? projectIdentifier);
}
```

**AI-ready action analog** (`webhooks.ts:149-229`):
```typescript
if (await hasActiveRunForCard(input.provider, input.cardId)) {
  return { skipped: true, reason: 'active run already exists' } as const;
}

const workflow = workflowFromLabels(input.labels);
const agentKey = workflow ? DATA_COLLECTOR_AGENT_KEY : agentKeyFromLabels(input.labels);
const agent = await resolveAgentByKey(agentKey);

const runId = await createRun({
  cardProvider: input.provider,
  cardId: input.cardId,
  cardIdentifier: input.cardIdentifier,
  title: input.title,
  autoMerge: input.hasAutoMerge,
  agentId: agent?.id,
  workflow,
  targetRepoCreate: input.targetRepoCreate,
});

await agentQueue.add(
  'plan',
  { kind: 'plan', runId, cardProvider: input.provider, cardId: input.cardId },
  { priority: JOB_PRIORITY.plan },
);
```

**Approval resume analog** (`webhooks.ts:386-423`):
```typescript
const run = await findAwaitingApprovalRunForCard('plane', cardId);
if (!run) {
  return c.json(skipPlaneWebhook('nenhum run aguardando aprovacao', { cardId }));
}
await resolveApproval(run.id, 'approved', 'plane');
await updateRunStatus(run.id, 'executing');
await agentQueue.add('resume', { kind: 'resume', runId: run.id }, { priority: JOB_PRIORITY.resume });
return c.json({ ok: true, resumed: true, runId: run.id });
```

**Cancellation analog** (`webhooks.ts:364-378`):
```typescript
if (isPlaneRemovalAction(payload.action)) {
  const cancelled = await cancelActiveRunsForCard('plane', cardId, PLANE_REMOVED_REASON);
  return c.json({ ok: true, cancelled, reason: PLANE_REMOVED_REASON });
}
```

**Extraction recommendation:** keep `routes/webhooks.ts` as the Hono intake owner, then extract pure helpers into `webhookSignature.ts` and `planeWebhook.ts`, and side-effectful run operations into `webhookRunActions.ts`. Keep `cardWebhook.ts` as the label transition owner.

### Mission Control Data Assembly vs Rendering

**Data assembly analog** (`admin.ts:140-239`):
```typescript
async function buildRecentMissionSummaries(
  limit: number,
  scenarios: E2eMissionScenario[],
): Promise<MissionControlSummary[]> {
  const scenarioByWorkflow = new Map(scenarios.map((scenario) => [scenario.workflow, scenario]));
  const runs = (await listRuns(limit, 0)).filter((run) =>
    scenarioByWorkflow.has(run.workflow ?? ''),
  );

  const missions = await Promise.all(
    runs.map(async (run) => {
      const missionRuns = await listMissionRunsForSource(run);
      const [artifacts, approvals] = await Promise.all([
        listMissionArtifacts(missionRuns),
        listMissionApprovals(missionRuns),
      ]);
      const timeline = buildMissionTimeline({ scenarioId: scenario.id, runs: missionRuns, artifacts, approvals });
      return { id: run.id, scenarioId: scenario.id, state: timeline.state };
    }),
  );

  return missions.filter((mission) => mission !== undefined);
}
```

**Timeline owner analog** (`missionTimeline.ts:99-150`):
```typescript
export function buildMissionTimeline(input: BuildMissionTimelineInput): MissionTimeline {
  const scenario = getE2eMissionScenario(input.scenarioId);
  if (!scenario) {
    throw new Error(`Unknown mission scenario: ${input.scenarioId}`);
  }

  const runs = [...input.runs].sort(compareRuns);
  const sourceRun = runs.find((run) => run.workflow === scenario.workflow) ?? runs[0];
  const continuationRun = sourceRun
    ? runs.find((run) => run.id !== sourceRun.id && compareRuns(run, sourceRun) >= 0)
    : undefined;
  const state = resolveTimelineState(sourceRun, continuationRun);
  return { scenarioId: scenario.id, state, stages, approval, metadata };
}
```

**Rendering analog** (`admin.ts:438-629`):
```typescript
export function renderMissionDetailPage(input: {
  scenario: E2eMissionScenario;
  run: MissionControlRun;
  missionRuns?: MissionControlRun[];
  artifacts: Array<MissionControlArtifact & { runId?: string }>;
  approvals: MissionControlApproval[];
}): string {
  const timeline = buildMissionTimeline({ scenarioId: input.scenario.id, runs, artifacts, approvals });
  return `<!doctype html>...`;
}

export function renderMissionControlPage(input: {
  scenarios: E2eMissionScenario[];
  missions: MissionControlSummary[];
}): string {
  return `<!doctype html>...`;
}
```

**Extraction recommendation:** create `missionControlData.ts` for `MissionControlSummary`, `buildRecentMissionSummaries`, `listMissionRunsForSource`, `listMissionArtifacts`, `listMissionApprovals`, and a detail assembly helper if needed. Create `missionControlRender.ts` for `renderMissionControlPage`, `renderMissionDetailPage`, and local render fragments. Keep `missionScenarios.ts` and `missionTimeline.ts` as domain owners.

## Shared Patterns

### Auth

**Source:** `routes/agents.ts:16-25`, `routes/admin.ts:54-62`

Apply to `admin`, `agents`, `tools`, and `schedules` only where those routes are already protected. Preserve exact JSON error and `401`.

### Response Shapes

**Source:** current route tests

Admin JSON shapes are locked by `admin.test.ts:164-194`, `601-618`. Webhook JSON shapes are locked by `webhooks.test.ts:96-104`, `480-488`, `543-551`, `574-612`. Do not rename `ok`, `skipped`, `reason`, `queued`, `runId`, `resumed`, `cancelled`, `missions`, `scenarios`, or `runs`.

### Logging

**Source:** `webhooks.ts:132-147`, `149-229`, `364-423`

Keep structured skip logging for Plane webhooks via `skipPlaneWebhook`. For side-effect actions, preserve provider/card/run context in `logger.warn`/`logger.info`.

### Queue Contract

**Source:** `queue.ts:17-35`, `webhooks.ts:212-222`, `414-418`

Plan jobs carry `kind: 'plan'`, `runId`, `cardProvider`, and `cardId`. Legacy Linear additionally carries `issueId`. Resume jobs carry `kind: 'resume'` and `runId`. Use `JOB_PRIORITY.plan` and `JOB_PRIORITY.resume`, not numeric literals in production code.

### Source-Owner Guardrails from Phase 4

- Workflow labels: `apps/orchestrator-api/src/workflows.ts`
- Agent keys: `apps/orchestrator-api/src/agents.ts`
- Label transition semantics: `apps/orchestrator-api/src/cardWebhook.ts`
- Mission scenarios: `apps/orchestrator-api/src/missionScenarios.ts`
- Mission timeline state: `apps/orchestrator-api/src/missionTimeline.ts`
- Run identity/status/approval persistence: `apps/orchestrator-api/src/runs.ts`
- Queue payload/priority contract: `apps/orchestrator-api/src/queue.ts`
- Artifact metadata/content access: `apps/orchestrator-api/src/artifacts.ts` and `routes/artifacts.ts`

## Candidate Plan Slices and Waves

### Wave 1: Shared Route Helpers

**Candidate plan:** `05-01: Extract shared route/auth/render helpers with tests`

Work:

- Add `routes/routeAuth.ts` and focused auth tests.
- Add `routes/rendering.ts` and focused escaping/date/status text tests.
- Replace local `requireAuth`/`requireAdmin` in `admin.ts`, `agents.ts`, `tools.ts`, and `schedules.ts`.
- Replace duplicate `escapeHtml`/`formatDate` in `admin.ts` and `registry.ts`.

Dependencies: none. This should go first because later Mission Control rendering can import the shared HTML helpers.

Verification:

```bash
rtk corepack pnpm vitest run apps/orchestrator-api/src/routes/admin.test.ts apps/orchestrator-api/src/routes/agents.test.ts apps/orchestrator-api/src/routes/tools.test.ts apps/orchestrator-api/src/routes/schedules.test.ts apps/orchestrator-api/src/routes/registry.test.ts
```

### Wave 2: Webhook Seams

**Candidate plan:** `05-02: Refactor routes/webhooks.ts into Plane intake and run transition seams`

Work:

- Add or extract `webhookSignature.ts` for HMAC verification.
- Add `planeWebhook.ts` for Plane payload normalization, label extraction, event/removal detection, and card identifier formatting.
- Add `webhookRunActions.ts` for ai-ready enqueue, approval resume, and cancellation side effects.
- Keep `routes/webhooks.ts` as Hono request/response orchestration.
- Keep `cardWebhook.ts` as the transition helper owner.

Dependencies: can start after Wave 1, but it does not need Mission Control changes.

Verification:

```bash
rtk corepack pnpm vitest run apps/orchestrator-api/src/routes/webhooks.test.ts apps/orchestrator-api/src/cardWebhook.test.ts apps/orchestrator-api/src/runs.test.ts apps/orchestrator-api/src/queue.test.ts
```

### Wave 3: Admin and Mission Control Seams

**Candidate plan:** `05-03: Refactor routes/admin.ts/Mission Control rendering into focused modules`

Work:

- Add `missionControlData.ts` for summary/detail data assembly.
- Add `missionControlRender.ts` for dashboard/detail HTML and render fragments.
- Leave `routes/admin.ts` as route/auth/status orchestration.
- Preserve exported render functions or update tests to import from the new owner in the same commit.
- Keep Mission Control read-only; no launch/replay/approve/retry/cancel controls.

Dependencies: should run after Wave 1 so render helpers are stable, and after 05-02 when 05-03 owns the final phase verification gate. This keeps `rtk corepack pnpm verify` ordered after all Phase 5 refactors.

Verification:

```bash
rtk corepack pnpm vitest run apps/orchestrator-api/src/routes/admin.test.ts apps/orchestrator-api/src/missionScenarios.test.ts apps/orchestrator-api/src/missionTimeline.test.ts apps/orchestrator-api/src/artifacts.test.ts apps/orchestrator-api/src/routes/artifacts.test.ts
```

### Phase Closeout

After all slices:

```bash
rtk corepack pnpm verify
```

## No Analog Found

None. Every candidate extraction has an exact or role-match analog in the current orchestrator code. The main risk is not lack of patterns; it is over-extraction that changes route policy, HTML copy/classes, webhook idempotency, or Phase 4 source-owner boundaries.

## Metadata

**Analog search scope:** `apps/orchestrator-api/src/routes`, `apps/orchestrator-api/src`, `packages/cards/src`
**Files scanned:** 18 source/test files plus Phase 4 summaries
**Pattern extraction date:** 2026-07-02
