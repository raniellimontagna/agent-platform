# Plane-First Multi-Provider Cards Design

## Context

The platform currently treats Linear issues as the only source of work cards. That assumption appears in the package boundary (`packages/linear`), graph dependencies, worker, webhook route, scheduler, reports, run persistence, docs, and environment variables. The current Plane MCP configuration points to `http://10.10.0.14:8080`, workspace `attodev`, but the configured API key sees no existing projects in that workspace. The migration will therefore create a new Plane project for this repository before moving cards.

The target state is multi-provider card support with Plane as the primary provider for this project and Linear kept as an optional legacy/extra provider. Existing Linear-triggered runs and database rows must remain readable.

## Goals

- Make Plane Attodev the default card provider for `agent-platform`.
- Keep Linear available as an optional provider for legacy cards and temporary fallback.
- Allow the runtime to read, comment on, create, and update cards through one provider-neutral interface.
- Add Plane webhook support for `ai-ready` and `approved` style automation.
- Migrate the current relevant Linear cards to Plane.
- Preserve compatibility with existing Linear-origin runs.

## Non-Goals

- Do not migrate every completed or canceled historical Linear issue by default.
- Do not remove Linear support from the codebase.
- Do not redesign the agent graph beyond replacing provider-specific card operations with a generic card contract.
- Do not build a UI for provider configuration.

## Card Migration Scope

Migrate current active/relevant Linear cards from team `MAC`:

- All `Todo` cards.
- All `Backlog` cards that are not completed or canceled.
- All `In Progress` cards.
- Any non-terminal `ai-ready` cards included in those states.

Do not migrate completed or canceled cards unless they are needed as explicit context for an active card. For migrated cards, store Linear provenance in Plane:

- `external_source`: `linear`
- `external_id`: the Linear identifier such as `MAC-121`
- A link/comment pointing to the original Linear URL.

The first Plane project will be created in workspace `attodev`:

- Name: `Agent Platform`
- Identifier: `AGP`
- Description: `Automation cards for /root/agent-platform. Plane is the primary provider; Linear remains optional for legacy cards.`

## Architecture

Introduce a provider-neutral card package and move all orchestration code to depend on it:

```ts
export type CardProvider = 'plane' | 'linear';

export interface CardContext {
  provider: CardProvider;
  id: string;
  identifier: string;
  title: string;
  description: string;
  labels: string[];
  url?: string;
}

export interface CardGateway {
  provider: CardProvider;
  getCard(id: string): Promise<CardContext>;
  comment(cardId: string, body: string): Promise<void>;
  setCardState(cardId: string, stateId: string): Promise<void>;
  createCard(input: {
    title: string;
    description: string;
    labelIds?: string[];
  }): Promise<CardContext>;
}
```

Provider implementations:

- `packages/cards`: shared interfaces, provider registry, and routing helpers.
- `packages/plane`: Plane REST gateway using `PLANE_BASE_URL`, `PLANE_API_KEY`, `PLANE_WORKSPACE_SLUG`, `PLANE_PROJECT_ID`, label IDs, and state IDs.
- `packages/linear`: keep existing Linear gateway, adapted to also satisfy `CardGateway`.

The runtime agent receives:

- `cards.primary`: the default gateway, Plane in production.
- `cards.byProvider`: registry for explicit provider lookup.
- `linear`: optional legacy gateway only where code still needs direct Linear behavior during transition.

## Data Model

Keep existing `linear_issue_id` and `linear_issue_identifier` columns for compatibility, then add generic card fields to `runs`:

- `card_provider text not null default 'linear'`
- `card_id text`
- `card_identifier text`
- `card_project_id text`

Backfill existing rows:

- `card_provider = 'linear'`
- `card_id = linear_issue_id`
- `card_identifier = linear_issue_identifier`

New Plane-origin runs write both generic card columns and legacy Linear columns with compatible values during the transition. The application should read generic columns first and fall back to Linear columns when generic values are null.

Dedup changes from issue-only to provider-aware:

- New active-run query: `(card_provider, card_id)` within active statuses.
- Existing `runs_active_issue_uq` remains for old deployments until a later cleanup.
- New partial unique index: `runs_active_card_uq` on `(card_provider, card_id)` for active statuses.

## Runtime Flow

### Planning and Execution

The worker queue payload becomes provider-aware:

```ts
type AgentJobData =
  | { kind: 'plan'; runId: string; cardProvider: CardProvider; cardId: string; context?: string }
  | { kind: 'resume'; runId: string };
```

The worker loads the run, selects the gateway by `run.cardProvider`, reads the card, and invokes the graph with provider-neutral card fields. The graph state keeps existing issue field names for a minimal transition, but their meaning becomes "card":

- `issueId` is the provider card ID.
- `issueIdentifier` is the provider display identifier.

Node dependencies change from `LinearGateway` to `CardGateway`. Reports, planner comments, PR comments, auto-merge status updates, cost alerts, and workflow-continuation comments all call the active card gateway.

### Scheduler

Scheduled runs create synthetic cards in the primary provider. With Plane as primary, the scheduler creates Plane work items in the configured project and applies configured Plane label IDs.

### Webhooks

Add `/webhooks/plane`:

- Verify Plane webhook secret when configured.
- Normalize Plane work item events into a shared webhook event shape.
- Trigger new runs when `ai-ready` is newly added.
- Resume approval when `approved` is newly added.
- Dedup using `(provider, cardId)`.

Keep `/webhooks/linear`:

- Continue to support Linear-origin cards when Linear is enabled.
- It writes `card_provider = 'linear'` and enqueues provider-aware jobs.

## Configuration

New environment variables:

- `CARD_PRIMARY_PROVIDER=plane`
- `CARD_EXTRA_PROVIDERS=linear`
- `PLANE_BASE_URL=http://10.10.0.14:8080`
- `PLANE_API_KEY`
- `PLANE_WORKSPACE_SLUG=attodev`
- `PLANE_PROJECT_ID`
- `PLANE_WEBHOOK_SECRET`
- `PLANE_AI_READY_LABEL_ID`
- `PLANE_APPROVED_LABEL_ID`
- `PLANE_AUTO_MERGE_LABEL_ID`
- `PLANE_SCHEDULED_LABEL_ID`
- `PLANE_DONE_STATE_ID`

Existing Linear variables become optional when Linear is not in `CARD_EXTRA_PROVIDERS` and not selected as primary.

## Plane Project Bootstrap

Create an idempotent script or command path that ensures the Plane project and labels exist:

1. List projects in workspace `attodev`.
2. If identifier `AGP` does not exist, create `Agent Platform`.
3. Ensure labels:
   - `ai-ready`
   - `approved`
   - `auto-merge`
   - `repo:create`
   - `workflow:landing-page`
   - `agent:reviewer`
   - `agent:landing-page`
   - `agent:data-collector`
   - `Improvement`
   - `Feature`
4. Record resulting IDs in deployment configuration or an operator-facing migration output.

## Migration Procedure

1. Bootstrap Plane project and labels.
2. List Linear cards in team `MAC` for states `Todo`, `Backlog`, and `In Progress`.
3. For each card, check Plane by `external_source=linear` and `external_id=MAC-xxx`.
4. Create a Plane work item if missing.
5. Map Linear priority:
   - Urgent -> `urgent`
   - High -> `high`
   - Medium -> `medium`
   - Low -> `low`
   - No priority -> `none`
6. Map Linear state:
   - Backlog -> Plane backlog state.
   - Todo -> Plane unstarted/default state.
   - In Progress -> Plane started state.
7. Map labels by exact name when available.
8. Add an origin link/comment with the Linear URL.
9. Emit a migration report with created, skipped, and failed cards.

Do not close or mutate Linear cards during the first migration. This keeps rollback simple.

## Error Handling

- Provider initialization fails fast for the primary provider.
- Optional provider initialization is non-fatal but logs a warning and disables that provider.
- Missing Plane project or label IDs produces a clear configuration error.
- Webhook payloads with unknown labels or unsupported event types are skipped with structured logs.
- Migration is idempotent through Plane external source/id fields.
- Card comments are best-effort for non-critical status updates, but plan/comment failures in the primary provider fail the current graph step because the human control loop depends on them.

## Testing

Unit tests:

- Plane gateway request construction and response normalization.
- Linear adapter satisfies the generic `CardGateway`.
- Provider registry selects primary and explicit providers.
- Runs read/write generic card fields with Linear fallback.
- Webhook normalization for Plane and Linear.
- Dedup uses provider plus card ID.
- Scheduler creates a card through the primary provider.

Integration-style tests with mocked HTTP:

- Plane project bootstrap creates project and labels idempotently.
- Migration skips existing Plane work items and creates missing ones.
- Plane webhook `ai-ready` enqueues a provider-aware plan job.
- Plane webhook `approved` resolves and resumes an awaiting approval run.

Verification commands:

- `rtk pnpm --filter @agent-platform/plane test`
- `rtk pnpm --filter @agent-platform/cards test`
- `rtk pnpm --filter @agent-platform/orchestrator-api test`
- `rtk pnpm -r build`
- `rtk pnpm test`

## Documentation

Update:

- `CLAUDE.md`: replace Linear-only sync expectations with card-provider sync expectations, Plane primary.
- `README.md`: describe Plane-first flow and Linear optional support.
- `docs/ARCHITECTURE.md`: replace Linear-only diagrams with card-provider diagrams.
- `docs/decisions/ADR-0005-linear-github-agent-workflow.md`: supersede or amend with Plane-first multi-provider workflow.
- `docs/runbooks/webhook-tailscale.md`: add Plane webhook exposure.
- `docs/runbooks/secrets.md`: document Plane variables.

## Rollout

1. Land schema and generic code with Linear still primary in tests.
2. Add Plane gateway and Plane webhook.
3. Switch local/prod env to `CARD_PRIMARY_PROVIDER=plane`.
4. Bootstrap Plane project and labels.
5. Migrate current relevant Linear cards.
6. Trigger one Plane `ai-ready` test card and verify:
   - run is created with `card_provider='plane'`
   - plan comment appears in Plane
   - approval via Plane resumes the run
   - final report appears in Plane
7. Keep Linear webhook enabled only as optional fallback until no active work depends on it.

## Open Decisions Resolved

- Plane project: create `Agent Platform` because Attodev currently has no visible projects for the configured token.
- Migration scope: active/relevant cards only, not completed/canceled history.
- Linear compatibility: preserve and adapt, do not remove.
- Provider storage: add generic fields while preserving legacy Linear columns.
