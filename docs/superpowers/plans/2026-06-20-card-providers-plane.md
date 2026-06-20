# Plane-First Card Providers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate `agent-platform` from Linear-only cards to multi-provider cards with Plane Attodev as the primary provider and Linear as optional legacy support.

**Architecture:** Add a provider-neutral card contract in `packages/cards`, implement Plane REST access in `packages/plane`, adapt Linear to the same interface, and route all orchestrator/graph card operations through a provider registry. Add generic card fields to `runs`, Plane webhook handling, idempotent Plane bootstrap/migration scripts, and documentation for Plane-first operation.

**Tech Stack:** TypeScript, pnpm workspaces, Hono, BullMQ, Drizzle/Postgres, Vitest, Linear SDK, Plane REST API.

## Global Constraints

- Follow `CLAUDE.md`: prefix shell commands with `rtk`.
- Follow Conventional Commits for all commits.
- Preserve existing Linear-origin runs and legacy `linear_issue_id` / `linear_issue_identifier` compatibility.
- Plane Attodev is primary for this project: `CARD_PRIMARY_PROVIDER=plane`, `PLANE_WORKSPACE_SLUG=attodev`.
- Linear remains optional; do not remove `packages/linear` or `/webhooks/linear`.
- Migration scope is active/relevant Linear cards: `Todo`, `Backlog`, and `In Progress`, excluding completed/canceled history.
- New Plane project: name `Agent Platform`, identifier `AGP`.
- Migration must be idempotent using `external_source=linear` and `external_id=MAC-xxx`.

---

## File Structure

- Create `packages/cards/`: provider-neutral types, registry helpers, markdown-to-HTML helper, package config, tests.
- Modify `packages/linear/src/index.ts`: keep current API and add `CardGateway` compatibility.
- Create `packages/plane/`: Plane REST gateway, bootstrap/migration helpers, package config, tests.
- Modify `packages/graph/src/`: replace `LinearGateway` deps with `CardGateway` in graph nodes.
- Modify `apps/orchestrator-api/src/db/schema.ts` and add migration SQL: generic card persistence fields and active-card unique index.
- Modify `apps/orchestrator-api/src/runs.ts`: provider-aware create/read/dedup helpers with Linear fallback.
- Modify `apps/orchestrator-api/src/queue.ts`: provider-aware plan jobs.
- Modify `apps/orchestrator-api/src/env.ts`: Plane and provider env variables.
- Modify `apps/orchestrator-api/src/agent.ts`, `worker.ts`, `scheduleWorker.ts`, `routes/webhooks.ts`: card registry, Plane webhook, Plane-first scheduler/worker flow.
- Create `apps/orchestrator-api/src/cards.ts`: runtime gateway construction.
- Create `apps/orchestrator-api/src/cardWebhooks.ts`: shared webhook normalization utilities.
- Create `apps/orchestrator-api/src/planeBootstrap.ts` and `planeMigration.ts`: operational bootstrap/migration entrypoints.
- Update docs and `.env.example` files.

---

### Task 1: Provider-Neutral Cards Package

**Files:**
- Create: `packages/cards/package.json`
- Create: `packages/cards/tsconfig.json`
- Create: `packages/cards/src/index.ts`
- Create: `packages/cards/src/index.test.ts`
- Modify: `pnpm-lock.yaml` after `rtk pnpm install --lockfile-only`

**Interfaces:**
- Produces: `CardProvider`, `CardContext`, `CardGateway`, `CardGatewayRegistry`, `createCardGatewayRegistry()`, `markdownToPlaneHtml()`.
- Consumes: none.

- [ ] **Step 1: Write failing tests**

Create `packages/cards/src/index.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  createCardGatewayRegistry,
  markdownToPlaneHtml,
  type CardGateway,
} from './index.js';

const plane: CardGateway = {
  provider: 'plane',
  getCard: async () => ({
    provider: 'plane',
    id: 'plane-1',
    identifier: 'AGP-1',
    title: 'Plane card',
    description: '',
    labels: [],
  }),
  comment: async () => undefined,
  setCardState: async () => undefined,
  createCard: async () => ({
    provider: 'plane',
    id: 'plane-1',
    identifier: 'AGP-1',
    title: 'Plane card',
    description: '',
    labels: [],
  }),
};

const linear: CardGateway = { ...plane, provider: 'linear' };

describe('createCardGatewayRegistry', () => {
  it('selects the configured primary and explicit providers', () => {
    const registry = createCardGatewayRegistry({
      primaryProvider: 'plane',
      gateways: [plane, linear],
    });

    expect(registry.primary.provider).toBe('plane');
    expect(registry.forProvider('linear').provider).toBe('linear');
  });

  it('throws a clear error when a provider is missing', () => {
    const registry = createCardGatewayRegistry({
      primaryProvider: 'plane',
      gateways: [plane],
    });

    expect(() => registry.forProvider('linear')).toThrow('Card provider not configured: linear');
  });
});

describe('markdownToPlaneHtml', () => {
  it('converts common markdown safely for Plane comments', () => {
    expect(markdownToPlaneHtml('## Title\n\n**Status:** `ok`\n\n- item')).toBe(
      '<h2>Title</h2><p><strong>Status:</strong> <code>ok</code></p><ul><li>item</li></ul>',
    );
  });
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
rtk pnpm --filter @agent-platform/cards test
```

Expected: fails because package and exports do not exist.

- [ ] **Step 3: Add package files**

Create `packages/cards/package.json`:

```json
{
  "name": "@agent-platform/cards",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "devDependencies": {
    "typescript": "^5.7.3",
    "vitest": "^3.2.0"
  }
}
```

Create `packages/cards/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 4: Implement the card contract**

Create `packages/cards/src/index.ts`:

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
  projectId?: string;
}

export interface CreateCardInput {
  title: string;
  description: string;
  labelIds?: string[];
  priority?: 'urgent' | 'high' | 'medium' | 'low' | 'none';
  stateId?: string;
  externalSource?: string;
  externalId?: string;
}

export interface CardGateway {
  provider: CardProvider;
  getCard(id: string): Promise<CardContext>;
  comment(cardId: string, body: string): Promise<void>;
  setCardState(cardId: string, stateId: string): Promise<void>;
  createCard(input: CreateCardInput): Promise<CardContext>;
}

export interface CardGatewayRegistry {
  primary: CardGateway;
  forProvider(provider: CardProvider): CardGateway;
}

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

export function markdownToPlaneHtml(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  const out: string[] = [];
  let list: string[] = [];

  const flushList = () => {
    if (list.length === 0) return;
    out.push(`<ul>${list.map((item) => `<li>${inlineMarkdown(item)}</li>`).join('')}</ul>`);
    list = [];
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushList();
      continue;
    }
    if (line.startsWith('## ')) {
      flushList();
      out.push(`<h2>${inlineMarkdown(line.slice(3))}</h2>`);
      continue;
    }
    if (line.startsWith('- ')) {
      list.push(line.slice(2));
      continue;
    }
    flushList();
    out.push(`<p>${inlineMarkdown(line)}</p>`);
  }
  flushList();
  return out.join('');
}

function inlineMarkdown(value: string): string {
  return escapeHtml(value)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
```

- [ ] **Step 5: Run tests**

Run:

```bash
rtk pnpm --filter @agent-platform/cards test
rtk pnpm --filter @agent-platform/cards build
```

Expected: both pass.

- [ ] **Step 6: Update lockfile**

Run:

```bash
rtk pnpm install --lockfile-only
```

Expected: lockfile includes `@agent-platform/cards`.

- [ ] **Step 7: Commit**

```bash
rtk git add packages/cards pnpm-lock.yaml
rtk git commit -m "feat(cards): add provider-neutral card gateway"
```

---

### Task 2: Linear Adapter Implements CardGateway

**Files:**
- Modify: `packages/linear/package.json`
- Modify: `packages/linear/src/index.ts`
- Create: `packages/linear/src/index.test.ts`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: `CardGateway`, `CardContext`, `CreateCardInput` from `@agent-platform/cards`.
- Produces: `LinearGateway extends CardGateway`, existing `getIssue`, `createIssue`, `setIssueState`, `comment` remain available.

- [ ] **Step 1: Add failing adapter test**

Create `packages/linear/src/index.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { CardGateway } from '@agent-platform/cards';
import type { LinearGateway } from './index.js';

describe('LinearGateway', () => {
  it('is assignable to CardGateway while preserving legacy methods', () => {
    const gateway = {} as LinearGateway;
    const cardGateway: CardGateway = gateway;
    expect(cardGateway).toBe(gateway);
  });
});
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
rtk pnpm --filter @agent-platform/linear test
```

Expected: fails because test script and `@agent-platform/cards` dependency are missing.

- [ ] **Step 3: Update package dependencies and scripts**

Modify `packages/linear/package.json`:

```json
{
  "name": "@agent-platform/linear",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@agent-platform/cards": "workspace:*",
    "@linear/sdk": "^39.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.13.4",
    "typescript": "^5.7.3",
    "vitest": "^3.2.0"
  }
}
```

- [ ] **Step 4: Adapt LinearGateway**

Modify `packages/linear/src/index.ts` so the interface and returned object include:

```ts
import { LinearClient } from '@linear/sdk';
import type { CardContext, CardGateway, CreateCardInput } from '@agent-platform/cards';

export interface IssueContext {
  id: string;
  identifier: string;
  title: string;
  description: string;
}

export interface LinearGateway extends CardGateway {
  provider: 'linear';
  getIssue(id: string): Promise<IssueContext>;
  createIssue(input: {
    title: string;
    description: string;
    teamId: string;
    labelIds?: string[];
  }): Promise<IssueContext>;
}

function toIssueContext(issue: {
  id: string;
  identifier: string;
  title: string;
  description?: string | null;
}): IssueContext {
  return {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    description: issue.description ?? '',
  };
}

function toCardContext(issue: IssueContext): CardContext {
  return {
    provider: 'linear',
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    description: issue.description,
    labels: [],
  };
}
```

In `createLinearGateway`, add `provider: 'linear'`, `getCard`, and `createCard`:

```ts
export function createLinearGateway(apiKey: string, defaults?: { teamId?: string }): LinearGateway {
  const client = new LinearClient({ apiKey });

  const gateway: LinearGateway = {
    provider: 'linear',

    async getIssue(id) {
      const issue = await withRetry(() => client.issue(id));
      return toIssueContext(issue);
    },

    async getCard(id) {
      return toCardContext(await gateway.getIssue(id));
    },

    async comment(issueId, body) {
      await client.createComment({ issueId, body });
    },

    async setIssueState(issueId, stateId) {
      await client.updateIssue(issueId, { stateId });
    },

    async createIssue(input) {
      const payload = await client.createIssue({
        teamId: input.teamId,
        title: input.title,
        description: input.description,
        ...(input.labelIds?.length ? { labelIds: input.labelIds } : {}),
      });
      const issue = await payload.issue;
      if (!issue) throw new Error('Linear createIssue nao retornou a issue');
      return toIssueContext(issue);
    },

    async createCard(input: CreateCardInput) {
      if (!defaults?.teamId) {
        throw new Error('Linear teamId default is required to create cards');
      }
      return toCardContext(
        await gateway.createIssue({
          title: input.title,
          description: input.description,
          teamId: defaults.teamId,
          labelIds: input.labelIds,
        }),
      );
    },
  };

  return gateway;
}
```

Preserve the existing `withRetry` function.

- [ ] **Step 5: Run tests and build**

Run:

```bash
rtk pnpm --filter @agent-platform/linear test
rtk pnpm --filter @agent-platform/linear build
rtk pnpm install --lockfile-only
```

Expected: pass and lockfile updated.

- [ ] **Step 6: Commit**

```bash
rtk git add packages/linear pnpm-lock.yaml
rtk git commit -m "feat(linear): adapt gateway to card provider contract"
```

---

### Task 3: Plane Gateway Package

**Files:**
- Create: `packages/plane/package.json`
- Create: `packages/plane/tsconfig.json`
- Create: `packages/plane/src/index.ts`
- Create: `packages/plane/src/index.test.ts`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: `CardGateway`, `CreateCardInput`, `markdownToPlaneHtml`.
- Produces: `PlaneGateway`, `createPlaneGateway(config)`, `PlaneConfig`, `PlaneLabelIds`.

- [ ] **Step 1: Write failing Plane gateway tests**

Create `packages/plane/src/index.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPlaneGateway } from './index.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('createPlaneGateway', () => {
  it('normalizes retrieved work items into CardContext', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'work-1',
        sequence_id: 7,
        name: 'Build cards',
        description_stripped: 'Description',
        labels: [{ name: 'ai-ready' }],
        project_detail: { identifier: 'AGP' },
      }),
    } as Response);

    const gateway = createPlaneGateway({
      baseUrl: 'http://plane.local',
      apiKey: 'key',
      workspaceSlug: 'attodev',
      projectId: 'project-1',
    });

    await expect(gateway.getCard('work-1')).resolves.toEqual({
      provider: 'plane',
      id: 'work-1',
      identifier: 'AGP-7',
      title: 'Build cards',
      description: 'Description',
      labels: ['ai-ready'],
      projectId: 'project-1',
    });
  });

  it('creates work items with external provenance', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    globalThis.fetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return {
        ok: true,
        json: async () => ({
          id: 'work-2',
          sequence_id: 8,
          name: 'Migrated',
          description_stripped: 'Body',
          labels: [],
          project_detail: { identifier: 'AGP' },
        }),
      } as Response;
    });

    const gateway = createPlaneGateway({
      baseUrl: 'http://plane.local',
      apiKey: 'key',
      workspaceSlug: 'attodev',
      projectId: 'project-1',
    });

    await gateway.createCard({
      title: 'Migrated',
      description: 'Body',
      externalSource: 'linear',
      externalId: 'MAC-121',
    });

    expect(calls[0]?.url).toBe(
      'http://plane.local/api/v1/workspaces/attodev/projects/project-1/work-items/',
    );
    expect(JSON.parse(String(calls[0]?.init.body))).toMatchObject({
      name: 'Migrated',
      description_html: '<p>Body</p>',
      description_stripped: 'Body',
      external_source: 'linear',
      external_id: 'MAC-121',
    });
  });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
rtk pnpm --filter @agent-platform/plane test
```

Expected: fails because package does not exist.

- [ ] **Step 3: Add package files**

Create `packages/plane/package.json`:

```json
{
  "name": "@agent-platform/plane",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@agent-platform/cards": "workspace:*"
  },
  "devDependencies": {
    "@types/node": "^22.13.4",
    "typescript": "^5.7.3",
    "vitest": "^3.2.0"
  }
}
```

Create `packages/plane/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 4: Implement Plane gateway**

Create `packages/plane/src/index.ts`:

```ts
import {
  markdownToPlaneHtml,
  type CardContext,
  type CardGateway,
  type CreateCardInput,
} from '@agent-platform/cards';

export interface PlaneConfig {
  baseUrl: string;
  apiKey: string;
  workspaceSlug: string;
  projectId: string;
}

export interface PlaneGateway extends CardGateway {
  provider: 'plane';
  projectId: string;
  listCardsByExternal(input: { externalSource: string; externalId: string }): Promise<CardContext[]>;
}

interface PlaneWorkItem {
  id: string;
  sequence_id?: number;
  sequenceId?: number;
  name: string;
  description_stripped?: string | null;
  description_html?: string | null;
  labels?: Array<{ name?: string } | string>;
  project_detail?: { identifier?: string };
  project_identifier?: string;
}

export function createPlaneGateway(config: PlaneConfig): PlaneGateway {
  const base = `${config.baseUrl.replace(/\/$/, '')}/api/v1/workspaces/${config.workspaceSlug}`;
  const headers = {
    'content-type': 'application/json',
    'x-api-key': config.apiKey,
  };

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${base}${path}`, {
      ...init,
      headers: { ...headers, ...(init?.headers ?? {}) },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Plane API ${res.status} ${res.statusText}: ${body}`);
    }
    return (await res.json()) as T;
  }

  const gateway: PlaneGateway = {
    provider: 'plane',
    projectId: config.projectId,

    async getCard(id) {
      const item = await request<PlaneWorkItem>(`/projects/${config.projectId}/work-items/${id}/`);
      return toCardContext(item, config.projectId);
    },

    async comment(cardId, body) {
      await request(`/projects/${config.projectId}/work-items/${cardId}/comments/`, {
        method: 'POST',
        body: JSON.stringify({
          comment_html: markdownToPlaneHtml(body),
          access: 'EXTERNAL',
        }),
      });
    },

    async setCardState(cardId, stateId) {
      await request(`/projects/${config.projectId}/work-items/${cardId}/`, {
        method: 'PATCH',
        body: JSON.stringify({ state: stateId }),
      });
    },

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

    async listCardsByExternal(input) {
      const data = await request<{ results?: PlaneWorkItem[] } | PlaneWorkItem[]>(
        `/projects/${config.projectId}/work-items/?external_source=${encodeURIComponent(
          input.externalSource,
        )}&external_id=${encodeURIComponent(input.externalId)}`,
      );
      const rows = Array.isArray(data) ? data : (data.results ?? []);
      return rows.map((item) => toCardContext(item, config.projectId));
    },
  };

  return gateway;
}

function toCardContext(item: PlaneWorkItem, projectId: string): CardContext {
  const projectIdentifier =
    item.project_detail?.identifier ?? item.project_identifier ?? 'AGP';
  const sequence = item.sequence_id ?? item.sequenceId;
  return {
    provider: 'plane',
    id: item.id,
    identifier: sequence ? `${projectIdentifier}-${sequence}` : item.id,
    title: item.name,
    description: item.description_stripped ?? '',
    labels: (item.labels ?? []).map((label) =>
      typeof label === 'string' ? label : (label.name ?? ''),
    ).filter(Boolean),
    projectId,
  };
}
```

- [ ] **Step 5: Run tests and build**

Run:

```bash
rtk pnpm --filter @agent-platform/plane test
rtk pnpm --filter @agent-platform/plane build
rtk pnpm install --lockfile-only
```

Expected: pass and lockfile updated.

- [ ] **Step 6: Commit**

```bash
rtk git add packages/plane pnpm-lock.yaml
rtk git commit -m "feat(plane): add Plane card gateway"
```

---

### Task 4: Environment and Runtime Card Registry

**Files:**
- Modify: `apps/orchestrator-api/package.json`
- Modify: `apps/orchestrator-api/src/env.ts`
- Modify: `apps/orchestrator-api/src/env.test.ts`
- Create: `apps/orchestrator-api/src/cards.ts`
- Create: `apps/orchestrator-api/src/cards.test.ts`
- Modify: `vitest.setup.ts`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: `createCardGatewayRegistry`, `createPlaneGateway`, `createLinearGateway`.
- Produces: `createRuntimeCards(env): CardGatewayRegistry`.

- [ ] **Step 1: Write failing registry test**

Create `apps/orchestrator-api/src/cards.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createRuntimeCards } from './cards.js';

describe('createRuntimeCards', () => {
  it('uses Plane as primary and keeps Linear optional', () => {
    const cards = createRuntimeCards({
      CARD_PRIMARY_PROVIDER: 'plane',
      CARD_EXTRA_PROVIDERS: 'linear',
      PLANE_BASE_URL: 'http://plane.local',
      PLANE_API_KEY: 'plane-key',
      PLANE_WORKSPACE_SLUG: 'attodev',
      PLANE_PROJECT_ID: 'project-1',
      LINEAR_API_KEY: 'linear-key',
      LINEAR_TEAM_ID: 'team-1',
    });

    expect(cards.primary.provider).toBe('plane');
    expect(cards.forProvider('linear').provider).toBe('linear');
  });
});
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
rtk pnpm --filter @agent-platform/orchestrator-api test -- src/cards.test.ts
```

Expected: fails because `cards.ts` and env fields do not exist.

- [ ] **Step 3: Add dependencies**

Modify `apps/orchestrator-api/package.json` dependencies:

```json
"@agent-platform/cards": "workspace:*",
"@agent-platform/plane": "workspace:*"
```

Keep existing dependencies.

- [ ] **Step 4: Extend env schema**

In `apps/orchestrator-api/src/env.ts`, add:

```ts
  CARD_PRIMARY_PROVIDER: z.enum(['plane', 'linear']).default('plane'),
  CARD_EXTRA_PROVIDERS: z.string().default('linear'),

  PLANE_BASE_URL: z.string().url().default('http://10.10.0.14:8080'),
  PLANE_API_KEY: z.string().optional(),
  PLANE_WORKSPACE_SLUG: z.string().default('attodev'),
  PLANE_PROJECT_ID: z.string().optional(),
  PLANE_WEBHOOK_SECRET: z.string().optional(),
  PLANE_AI_READY_LABEL_ID: z.string().optional(),
  PLANE_APPROVED_LABEL_ID: z.string().optional(),
  PLANE_AUTO_MERGE_LABEL_ID: z.string().optional(),
  PLANE_SCHEDULED_LABEL_ID: z.string().optional(),
  PLANE_DONE_STATE_ID: z.string().optional(),
```

Update `SECRET_KEYS` to include `PLANE_API_KEY` and `PLANE_WEBHOOK_SECRET`.

- [ ] **Step 5: Implement runtime card registry**

Create `apps/orchestrator-api/src/cards.ts`:

```ts
import { createCardGatewayRegistry, type CardGateway, type CardProvider } from '@agent-platform/cards';
import { createLinearGateway } from '@agent-platform/linear';
import { createPlaneGateway } from '@agent-platform/plane';

export interface RuntimeCardEnv {
  CARD_PRIMARY_PROVIDER: CardProvider;
  CARD_EXTRA_PROVIDERS: string;
  PLANE_BASE_URL: string;
  PLANE_API_KEY?: string;
  PLANE_WORKSPACE_SLUG: string;
  PLANE_PROJECT_ID?: string;
  LINEAR_API_KEY?: string;
  LINEAR_TEAM_ID?: string;
}

export function createRuntimeCards(env: RuntimeCardEnv) {
  const enabled = new Set<CardProvider>([
    env.CARD_PRIMARY_PROVIDER,
    ...env.CARD_EXTRA_PROVIDERS.split(',').map((p) => p.trim()).filter(Boolean) as CardProvider[],
  ]);
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

  if (enabled.has('linear')) {
    if (!env.LINEAR_API_KEY) {
      if (env.CARD_PRIMARY_PROVIDER === 'linear') {
        throw new Error('Linear card provider requires LINEAR_API_KEY');
      }
    } else {
      gateways.push(createLinearGateway(env.LINEAR_API_KEY, { teamId: env.LINEAR_TEAM_ID }));
    }
  }

  return createCardGatewayRegistry({
    primaryProvider: env.CARD_PRIMARY_PROVIDER,
    gateways,
  });
}
```

- [ ] **Step 6: Update test env defaults**

In `vitest.setup.ts`, add safe dummy values:

```ts
process.env.CARD_PRIMARY_PROVIDER ??= 'plane';
process.env.CARD_EXTRA_PROVIDERS ??= 'linear';
process.env.PLANE_API_KEY ??= 'plane-test-key';
process.env.PLANE_PROJECT_ID ??= 'plane-project-test';
process.env.PLANE_WEBHOOK_SECRET ??= 'plane-secret';
```

Update `env.test.ts` with:

```ts
expect(env.CARD_PRIMARY_PROVIDER).toBe('plane');
expect(env.PLANE_WORKSPACE_SLUG).toBe('attodev');
```

- [ ] **Step 7: Run tests**

Run:

```bash
rtk pnpm --filter @agent-platform/orchestrator-api test -- src/cards.test.ts src/env.test.ts
rtk pnpm install --lockfile-only
```

Expected: pass.

- [ ] **Step 8: Commit**

```bash
rtk git add apps/orchestrator-api/package.json apps/orchestrator-api/src/cards.ts apps/orchestrator-api/src/cards.test.ts apps/orchestrator-api/src/env.ts apps/orchestrator-api/src/env.test.ts vitest.setup.ts pnpm-lock.yaml
rtk git commit -m "feat(orchestrator): configure card provider registry"
```

---

### Task 5: Generic Card Persistence and Queue Payloads

**Files:**
- Modify: `apps/orchestrator-api/src/db/schema.ts`
- Add: `apps/orchestrator-api/drizzle/0015_card_providers.sql`
- Modify: `apps/orchestrator-api/src/runs.ts`
- Modify: `apps/orchestrator-api/src/queue.ts`
- Modify: `apps/orchestrator-api/src/routes/registry.ts`
- Modify tests: `apps/orchestrator-api/src/routes/registry.test.ts`, add `apps/orchestrator-api/src/runs.test.ts` if needed.

**Interfaces:**
- Produces: `cardProvider`, `cardId`, `cardIdentifier`, `cardProjectId` fields on runs.
- Produces: `hasActiveRunForCard(provider, cardId)`, `findAwaitingApprovalRunForCard(provider, cardId)`.
- Updates: `AgentJobData.plan` includes `cardProvider` and `cardId`.

- [ ] **Step 1: Write failing run tests**

Create or extend `apps/orchestrator-api/src/runs.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { NewRunInput } from './runs.js';

describe('NewRunInput', () => {
  it('accepts generic card fields while preserving linear fields', () => {
    const input: NewRunInput = {
      cardProvider: 'plane',
      cardId: 'plane-work-1',
      cardIdentifier: 'AGP-1',
      cardProjectId: 'project-1',
      linearIssueId: 'plane-work-1',
      linearIssueIdentifier: 'AGP-1',
      title: 'Plane card',
    };

    expect(input.cardProvider).toBe('plane');
  });
});
```

- [ ] **Step 2: Run focused tests and verify failure**

Run:

```bash
rtk pnpm --filter @agent-platform/orchestrator-api test -- src/runs.test.ts
```

Expected: type failure for missing fields.

- [ ] **Step 3: Add schema columns**

In `apps/orchestrator-api/src/db/schema.ts`, add to `runs`:

```ts
    cardProvider: text('card_provider').notNull().default('linear'),
    cardId: text('card_id'),
    cardIdentifier: text('card_identifier'),
    cardProjectId: text('card_project_id'),
```

Add index:

```ts
    uniqueIndex('runs_active_card_uq')
      .on(t.cardProvider, t.cardId)
      .where(
        sql`${t.status} in ('pending','planning','awaiting_approval','executing','reviewing') and ${t.cardId} is not null`,
      ),
```

- [ ] **Step 4: Add SQL migration**

Create `apps/orchestrator-api/drizzle/0015_card_providers.sql`:

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

- [ ] **Step 5: Update run input and helpers**

In `apps/orchestrator-api/src/runs.ts`, update `NewRunInput`:

```ts
  cardProvider?: 'plane' | 'linear';
  cardId?: string;
  cardIdentifier?: string;
  cardProjectId?: string;
```

In `createRun`, set:

```ts
      cardProvider: input.cardProvider ?? 'linear',
      cardId: input.cardId ?? input.linearIssueId,
      cardIdentifier: input.cardIdentifier ?? input.linearIssueIdentifier,
      ...(input.cardProjectId ? { cardProjectId: input.cardProjectId } : {}),
```

Add:

```ts
export async function hasActiveRunForCard(
  cardProvider: 'plane' | 'linear',
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

export async function findAwaitingApprovalRunForCard(
  cardProvider: 'plane' | 'linear',
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
```

Keep `hasActiveRunForIssue` and `findAwaitingApprovalRun` as wrappers around Linear.

- [ ] **Step 6: Update queue payload**

In `apps/orchestrator-api/src/queue.ts`:

```ts
import type { CardProvider } from '@agent-platform/cards';

export type AgentJobData =
  | { kind: 'plan'; runId: string; cardProvider: CardProvider; cardId: string; context?: string }
  | { kind: 'resume'; runId: string };
```

- [ ] **Step 7: Update registry display fallback**

In `apps/orchestrator-api/src/routes/registry.ts`, where run issue identifier is displayed, use:

```ts
const cardIdentifier = run.cardIdentifier ?? run.linearIssueIdentifier;
```

- [ ] **Step 8: Run tests**

Run:

```bash
rtk pnpm --filter @agent-platform/orchestrator-api test -- src/runs.test.ts src/routes/registry.test.ts
rtk pnpm --filter @agent-platform/orchestrator-api build
```

Expected: pass.

- [ ] **Step 9: Commit**

```bash
rtk git add apps/orchestrator-api/src/db/schema.ts apps/orchestrator-api/drizzle/0015_card_providers.sql apps/orchestrator-api/src/runs.ts apps/orchestrator-api/src/queue.ts apps/orchestrator-api/src/routes/registry.ts apps/orchestrator-api/src/routes/registry.test.ts apps/orchestrator-api/src/runs.test.ts
rtk git commit -m "feat(orchestrator): persist provider-aware cards"
```

---

### Task 6: Graph Uses CardGateway

**Files:**
- Modify: `packages/graph/package.json`
- Modify: `packages/graph/src/build.ts`
- Modify: `packages/graph/src/nodes/planner.ts`
- Modify: `packages/graph/src/nodes/pr.ts`
- Modify: `packages/graph/src/nodes/merging.ts`
- Modify: `packages/graph/src/nodes/cloudflareDeploy.ts`
- Modify: `packages/graph/src/nodes/report.ts`
- Update graph tests that type mock `linear`.
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: `CardGateway`.
- Produces: graph deps `cards: CardGateway` or `card: CardGateway` instead of `linear`.

- [ ] **Step 1: Write type-focused failing test**

Add to `packages/graph/src/nodes/report.test.ts`:

```ts
import type { CardGateway } from '@agent-platform/cards';
import { makeReportNode } from './report.js';

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
    setCardState: async () => undefined,
    createCard: async () => ({
      provider: 'plane',
      id: 'card-1',
      identifier: 'AGP-1',
      title: 'Card',
      description: '',
      labels: [],
    }),
  };

  const node = makeReportNode({ cards });
  await node({
    runId: 'run-1',
    issueId: 'card-1',
    issueIdentifier: 'AGP-1',
    title: 'Card',
    description: '',
    status: 'completed',
  } as never);

  expect(comments[0]).toContain('AGP-1');
});
```

- [ ] **Step 2: Run focused graph tests and verify failure**

Run:

```bash
rtk pnpm --filter @agent-platform/graph test -- src/nodes/report.test.ts
```

Expected: fails because graph still imports `LinearGateway`.

- [ ] **Step 3: Add graph dependency**

In `packages/graph/package.json`, add:

```json
"@agent-platform/cards": "workspace:*"
```

- [ ] **Step 4: Replace node deps**

For each graph node, replace:

```ts
import type { LinearGateway } from '@agent-platform/linear';
```

with:

```ts
import type { CardGateway } from '@agent-platform/cards';
```

Rename dependency property from `linear` to `cards` in node deps:

```ts
export interface ReportDeps {
  cards: CardGateway;
}
```

Replace calls:

```ts
await deps.linear.comment(...)
await deps.linear.setIssueState(...)
```

with:

```ts
await deps.cards.comment(...)
await deps.cards.setCardState(...)
```

- [ ] **Step 5: Update graph build dependencies**

In `packages/graph/src/build.ts`:

```ts
import type { CardGateway } from '@agent-platform/cards';

export interface GraphDeps {
  llm: LlmClient;
  cards: CardGateway;
  ...
}
```

Pass `cards: deps.cards` into `makePlannerNode`, `makeCoderNode`, `makeReviewNode`, `makePrNode`, `makeMergingNode`, `makeCloudflareDeployNode`, and `makeReportNode`.

- [ ] **Step 6: Run graph tests and build**

Run:

```bash
rtk pnpm --filter @agent-platform/graph test
rtk pnpm --filter @agent-platform/graph build
rtk pnpm install --lockfile-only
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
rtk git add packages/graph pnpm-lock.yaml
rtk git commit -m "feat(graph): use generic card gateway"
```

---

### Task 7: Orchestrator Worker and Agent Use Card Registry

**Files:**
- Modify: `apps/orchestrator-api/src/agent.ts`
- Modify: `apps/orchestrator-api/src/worker.ts`
- Modify: `apps/orchestrator-api/src/scheduleWorker.ts`
- Modify tests: `apps/orchestrator-api/src/workerManager.test.ts` only if type fallout appears.

**Interfaces:**
- Consumes: `createRuntimeCards`, generic run fields, provider-aware queue payloads.
- Produces: runtime `Agent` with `cards` registry; worker selects gateway by run/provider.

- [ ] **Step 1: Update Agent construction**

In `apps/orchestrator-api/src/agent.ts`, import:

```ts
import type { CardGatewayRegistry } from '@agent-platform/cards';
import { createRuntimeCards } from './cards.js';
```

Change `Agent`:

```ts
export interface Agent {
  graph: AgentGraph;
  cards: CardGatewayRegistry;
  llm: LlmClient;
  github: GithubGateway;
  workerManager: WorkerManager;
}
```

In `init()`:

```ts
  const cards = createRuntimeCards(env);
```

Pass to graph:

```ts
      cards: cards.primary,
      doneStateId: env.PLANE_DONE_STATE_ID ?? env.LINEAR_DONE_STATE_ID,
```

Return:

```ts
  return { graph, cards, llm, github, workerManager };
```

- [ ] **Step 2: Update worker plan path**

In `apps/orchestrator-api/src/worker.ts`, change:

```ts
const { graph, cards, llm, github } = await getRuntimeAgent();
```

For `job.data.kind === 'plan'`:

```ts
const run = await getRun(runId);
const cardProvider = run?.cardProvider ?? job.data.cardProvider;
const cardId = run?.cardId ?? job.data.cardId;
const cardGateway = cards.forProvider(cardProvider as 'plane' | 'linear');
const issue = await cardGateway.getCard(cardId);
```

Replace all `linear.comment(...)`, `linear.getIssue(...)`, and `sourceRun.linearIssueId` comment paths with the provider gateway selected from `sourceRun.cardProvider` and `sourceRun.cardId`.

For cost alert:

```ts
const run = await getRun(runId);
if (run?.cardProvider && run.cardId) {
  await cards.forProvider(run.cardProvider as 'plane' | 'linear').comment(run.cardId, message);
}
```

- [ ] **Step 3: Update workflow continuation**

In `maybeStartResearchToLandingWorkflow`, replace `linear` argument with `cards`. Load:

```ts
const sourceGateway = args.cards.forProvider(sourceRun.cardProvider as 'plane' | 'linear');
const issue = await sourceGateway.getCard(sourceRun.cardId ?? sourceRun.linearIssueId);
```

Create continuation run with:

```ts
    cardProvider: sourceRun.cardProvider as 'plane' | 'linear',
    cardId: sourceRun.cardId ?? sourceRun.linearIssueId,
    cardIdentifier: sourceRun.cardIdentifier ?? sourceRun.linearIssueIdentifier,
    cardProjectId: sourceRun.cardProjectId ?? undefined,
```

Enqueue:

```ts
      cardProvider: sourceRun.cardProvider as 'plane' | 'linear',
      cardId: sourceRun.cardId ?? sourceRun.linearIssueId,
```

- [ ] **Step 4: Update scheduler**

In `scheduleWorker.ts`, change:

```ts
const { cards } = await getAgent();
const card = await cards.primary.createCard({
  title: schedule.title,
  description: schedule.description,
  labelIds: env.PLANE_SCHEDULED_LABEL_ID ? [env.PLANE_SCHEDULED_LABEL_ID] : env.LINEAR_SCHEDULED_LABEL_ID ? [env.LINEAR_SCHEDULED_LABEL_ID] : undefined,
});
```

Create run:

```ts
      linearIssueId: card.id,
      linearIssueIdentifier: card.identifier,
      cardProvider: card.provider,
      cardId: card.id,
      cardIdentifier: card.identifier,
      cardProjectId: card.projectId,
```

Enqueue:

```ts
{ kind: 'plan', runId, cardProvider: card.provider, cardId: card.id }
```

- [ ] **Step 5: Run orchestrator tests and build**

Run:

```bash
rtk pnpm --filter @agent-platform/orchestrator-api test
rtk pnpm --filter @agent-platform/orchestrator-api build
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
rtk git add apps/orchestrator-api/src/agent.ts apps/orchestrator-api/src/worker.ts apps/orchestrator-api/src/scheduleWorker.ts
rtk git commit -m "feat(orchestrator): route execution through card registry"
```

---

### Task 8: Plane and Linear Webhooks Share Provider-Aware Flow

**Files:**
- Modify: `apps/orchestrator-api/src/routes/webhooks.ts`
- Modify: `apps/orchestrator-api/src/routes/webhooks.test.ts`
- Create: `apps/orchestrator-api/src/cardWebhook.ts`
- Create: `apps/orchestrator-api/src/cardWebhook.test.ts`

**Interfaces:**
- Produces: `/webhooks/plane`.
- Preserves: `/webhooks/linear`.
- Consumes: `hasActiveRunForCard`, `findAwaitingApprovalRunForCard`.

- [ ] **Step 1: Add shared label tests**

Create `apps/orchestrator-api/src/cardWebhook.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { labelJustAdded } from './cardWebhook.js';

describe('labelJustAdded', () => {
  it('detects a newly added label by name or id', () => {
    expect(
      labelJustAdded({
        currentNames: ['ai-ready'],
        currentIds: [],
        previousNames: [],
        previousIds: [],
        action: 'update',
        name: 'ai-ready',
        id: 'ai-ready-id',
      }),
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Implement shared helper**

Create `apps/orchestrator-api/src/cardWebhook.ts`:

```ts
export function labelJustAdded(input: {
  currentNames: string[];
  currentIds: string[];
  previousNames: string[];
  previousIds: string[];
  action: string;
  name: string;
  id?: string;
}): boolean {
  const hasNow = input.currentNames.includes(input.name) || (!!input.id && input.currentIds.includes(input.id));
  if (!hasNow) return false;
  if (input.action !== 'update') return true;
  const hadBefore =
    input.previousNames.includes(input.name) || (!!input.id && input.previousIds.includes(input.id));
  return !hadBefore;
}
```

- [ ] **Step 3: Add Plane webhook test**

Extend `webhooks.test.ts` with:

```ts
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

  const res = await app.request('/webhooks/plane', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-plane-signature': signed(body) },
    body,
  });

  expect(res.status).toBe(200);
  expect(createRun).toHaveBeenCalledWith(
    expect.objectContaining({
      cardProvider: 'plane',
      cardId: 'plane-work-1',
      cardIdentifier: 'AGP-1',
      cardProjectId: 'plane-project',
    }),
  );
  expect(agentQueue.add).toHaveBeenCalledWith(
    'plan',
    { kind: 'plan', runId: 'run-plane', cardProvider: 'plane', cardId: 'plane-work-1' },
    { priority: 10 },
  );
});
```

- [ ] **Step 4: Update env mock in webhook tests**

Add:

```ts
    PLANE_WEBHOOK_SECRET: 'secret',
    PLANE_AI_READY_LABEL_ID: 'plane-ai-ready-id',
    PLANE_APPROVED_LABEL_ID: 'plane-approved-id',
    PLANE_AUTO_MERGE_LABEL_ID: 'plane-auto-merge-id',
```

Mock new run helpers:

```ts
  findAwaitingApprovalRunForCard: vi.fn(),
  hasActiveRunForCard: vi.fn().mockResolvedValue(false),
```

- [ ] **Step 5: Implement Plane route and update Linear route**

In `routes/webhooks.ts`, use `labelJustAdded` helper for both providers. Add a provider-aware internal function:

```ts
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
    return { skipped: true, reason: 'active run already exists' };
  }
  const workflow = workflowFromLabels(input.labels);
  const agentKey = workflow ? DATA_COLLECTOR_AGENT_KEY : agentKeyFromLabels(input.labels);
  const agent = await resolveAgentByKey(agentKey);
  const runId = await createRun({
    linearIssueId: input.cardId,
    linearIssueIdentifier: input.cardIdentifier,
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
    { kind: 'plan', runId, cardProvider: input.provider, cardId: input.cardId },
    { priority: JOB_PRIORITY.plan },
  );
  return { queued: true, runId };
}
```

Add `/webhooks/plane` parsing Plane work item payloads. Use HMAC with `PLANE_WEBHOOK_SECRET` when set; if the secret is absent in development, accept unsigned payloads only when `NODE_ENV !== 'production'`.

Update `/webhooks/linear` to call provider-aware helpers and enqueue provider-aware payload.

- [ ] **Step 6: Run webhook tests**

Run:

```bash
rtk pnpm --filter @agent-platform/orchestrator-api test -- src/cardWebhook.test.ts src/routes/webhooks.test.ts
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
rtk git add apps/orchestrator-api/src/cardWebhook.ts apps/orchestrator-api/src/cardWebhook.test.ts apps/orchestrator-api/src/routes/webhooks.ts apps/orchestrator-api/src/routes/webhooks.test.ts
rtk git commit -m "feat(webhooks): add provider-aware Plane automation"
```

---

### Task 9: Plane Bootstrap and Linear-to-Plane Migration Scripts

**Files:**
- Create: `apps/orchestrator-api/src/planeBootstrap.ts`
- Create: `apps/orchestrator-api/src/planeBootstrap.test.ts`
- Create: `apps/orchestrator-api/src/planeMigration.ts`
- Create: `apps/orchestrator-api/src/planeMigration.test.ts`
- Modify: `apps/orchestrator-api/package.json`

**Interfaces:**
- Produces: `ensurePlaneProjectAndLabels(config)`.
- Produces: `migrateLinearCardsToPlane(input)`.
- Adds scripts: `plane:bootstrap`, `plane:migrate-linear`.

- [ ] **Step 1: Write bootstrap test**

Create `apps/orchestrator-api/src/planeBootstrap.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { ensurePlaneProjectAndLabels } from './planeBootstrap.js';

describe('ensurePlaneProjectAndLabels', () => {
  it('creates Agent Platform when AGP is missing', async () => {
    const calls: string[] = [];
    const fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      if (url.endsWith('/projects/?per_page=100')) {
        return { ok: true, json: async () => ({ results: [] }) } as Response;
      }
      if (url.endsWith('/projects/')) {
        return { ok: true, json: async () => ({ id: 'project-1', identifier: 'AGP' }) } as Response;
      }
      if (url.endsWith('/labels/')) {
        return { ok: true, json: async () => ({ results: [] }) } as Response;
      }
      return { ok: true, json: async () => ({ id: 'label-1' }) } as Response;
    });

    const result = await ensurePlaneProjectAndLabels({
      baseUrl: 'http://plane.local',
      apiKey: 'key',
      workspaceSlug: 'attodev',
      fetch,
    });

    expect(result.projectId).toBe('project-1');
    expect(calls.some((call) => call.includes('POST'))).toBe(true);
  });
});
```

- [ ] **Step 2: Implement bootstrap**

Create `planeBootstrap.ts` with:

```ts
export const REQUIRED_PLANE_LABELS = [
  'ai-ready',
  'approved',
  'auto-merge',
  'repo:create',
  'workflow:landing-page',
  'agent:reviewer',
  'agent:landing-page',
  'agent:data-collector',
  'Improvement',
  'Feature',
] as const;

export interface PlaneBootstrapConfig {
  baseUrl: string;
  apiKey: string;
  workspaceSlug: string;
  fetch?: typeof globalThis.fetch;
}

export async function ensurePlaneProjectAndLabels(config: PlaneBootstrapConfig) {
  const doFetch = config.fetch ?? globalThis.fetch;
  const base = `${config.baseUrl.replace(/\/$/, '')}/api/v1/workspaces/${config.workspaceSlug}`;
  const headers = { 'content-type': 'application/json', 'x-api-key': config.apiKey };
  const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
    const res = await doFetch(`${base}${path}`, { ...init, headers: { ...headers, ...(init?.headers ?? {}) } });
    if (!res.ok) throw new Error(`Plane bootstrap failed: ${res.status} ${await res.text()}`);
    return (await res.json()) as T;
  };

  const projects = await request<{ results?: Array<{ id: string; identifier: string }> }>('/projects/?per_page=100');
  let project = projects.results?.find((p) => p.identifier === 'AGP');
  if (!project) {
    project = await request<{ id: string; identifier: string }>('/projects/', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Agent Platform',
        identifier: 'AGP',
        description: 'Automation cards for /root/agent-platform. Plane is the primary provider; Linear remains optional for legacy cards.',
        emoji: 'gear',
        module_view: true,
        cycle_view: true,
        issue_views_view: true,
        page_view: true,
        intake_view: true,
      }),
    });
  }

  const labels = await request<{ results?: Array<{ id: string; name: string }> }>(`/projects/${project.id}/labels/`);
  const byName = new Map((labels.results ?? []).map((label) => [label.name, label.id]));
  const labelIds: Record<string, string> = {};
  for (const name of REQUIRED_PLANE_LABELS) {
    let id = byName.get(name);
    if (!id) {
      const created = await request<{ id: string }>(`/projects/${project.id}/labels/`, {
        method: 'POST',
        body: JSON.stringify({ name, color: '#64748b' }),
      });
      id = created.id;
    }
    labelIds[name] = id;
  }

  return { projectId: project.id, labelIds };
}
```

- [ ] **Step 3: Write migration tests**

Create `planeMigration.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { migrateLinearCardsToPlane } from './planeMigration.js';

describe('migrateLinearCardsToPlane', () => {
  it('skips cards already present by external id and creates missing cards', async () => {
    const plane = {
      listCardsByExternal: vi.fn()
        .mockResolvedValueOnce([{ id: 'existing' }])
        .mockResolvedValueOnce([]),
      createCard: vi.fn().mockResolvedValue({ id: 'created', identifier: 'AGP-2' }),
      comment: vi.fn(),
    };
    const linearCards = [
      { id: 'MAC-1', title: 'Existing', description: 'A', labels: [], priority: 'none', url: 'https://linear/MAC-1' },
      { id: 'MAC-2', title: 'Missing', description: 'B', labels: ['ai-ready'], priority: 'medium', url: 'https://linear/MAC-2' },
    ];

    const result = await migrateLinearCardsToPlane({
      plane: plane as never,
      linearCards,
      labelIds: { 'ai-ready': 'label-ai-ready' },
    });

    expect(result.skipped).toBe(1);
    expect(result.created).toBe(1);
    expect(plane.createCard).toHaveBeenCalledWith(expect.objectContaining({ externalId: 'MAC-2' }));
  });
});
```

- [ ] **Step 4: Implement migration helper**

Create `planeMigration.ts`:

```ts
import type { PlaneGateway } from '@agent-platform/plane';

export interface LinearCardSnapshot {
  id: string;
  title: string;
  description: string;
  labels: string[];
  priority: 'urgent' | 'high' | 'medium' | 'low' | 'none';
  url: string;
}

export async function migrateLinearCardsToPlane(input: {
  plane: Pick<PlaneGateway, 'listCardsByExternal' | 'createCard' | 'comment'>;
  linearCards: LinearCardSnapshot[];
  labelIds: Record<string, string>;
}) {
  let created = 0;
  let skipped = 0;
  const failed: Array<{ id: string; error: string }> = [];

  for (const card of input.linearCards) {
    try {
      const existing = await input.plane.listCardsByExternal({
        externalSource: 'linear',
        externalId: card.id,
      });
      if (existing.length > 0) {
        skipped++;
        continue;
      }
      const createdCard = await input.plane.createCard({
        title: card.title,
        description: card.description,
        priority: card.priority,
        labelIds: card.labels.map((label) => input.labelIds[label]).filter(Boolean),
        externalSource: 'linear',
        externalId: card.id,
      });
      await input.plane.comment(
        createdCard.id,
        `Migrated from Linear: [${card.id}](${card.url}).`,
      );
      created++;
    } catch (err) {
      failed.push({ id: card.id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return { created, skipped, failed };
}
```

- [ ] **Step 5: Add CLI scripts**

In `apps/orchestrator-api/package.json` scripts:

```json
"plane:bootstrap": "tsx src/planeBootstrapCli.ts",
"plane:migrate-linear": "tsx src/planeMigrationCli.ts"
```

Create CLI wrappers only after helper tests pass. CLI wrappers read `env`, call helpers, and print JSON with project/label IDs or migration report.

- [ ] **Step 6: Run tests**

Run:

```bash
rtk pnpm --filter @agent-platform/orchestrator-api test -- src/planeBootstrap.test.ts src/planeMigration.test.ts
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
rtk git add apps/orchestrator-api/src/planeBootstrap.ts apps/orchestrator-api/src/planeBootstrap.test.ts apps/orchestrator-api/src/planeMigration.ts apps/orchestrator-api/src/planeMigration.test.ts apps/orchestrator-api/package.json
rtk git commit -m "feat(plane): add bootstrap and migration helpers"
```

---

### Task 10: Documentation and Env Examples

**Files:**
- Modify: `CLAUDE.md`
- Modify: `README.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/decisions/ADR-0005-linear-github-agent-workflow.md`
- Modify: `docs/runbooks/webhook-tailscale.md`
- Modify: `docs/runbooks/secrets.md`
- Modify: `apps/orchestrator-api/.env.example`
- Modify: `infra/compose/orchestrator/.env.example`

**Interfaces:**
- Produces: operator docs for Plane-first card providers.

- [ ] **Step 1: Update CLAUDE.md sync language**

Replace:

```md
## Sync Linear

- Ao concluir issue -> atualizar status no Linear + comentar progresso
- Novas cards/milestones criadas via MCP quando necessário
```

with:

```md
## Sync Cards

- Provedor principal deste projeto: Plane workspace `attodev`, projeto `Agent Platform` (`AGP`).
- Ao concluir card -> atualizar status no provedor de origem + comentar progresso.
- Linear permanece opcional/legado; use somente quando o card original estiver no Linear.
- Novos cards/milestones devem ser criados no Plane, salvo instrução explícita em contrário.
```

- [ ] **Step 2: Update env examples**

Add:

```dotenv
CARD_PRIMARY_PROVIDER=plane
CARD_EXTRA_PROVIDERS=linear
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
```

Keep Linear variables in a "legacy optional provider" block.

- [ ] **Step 3: Update architecture and runbooks**

In each doc, replace Linear-only phrasing with:

```md
Plane (primary card provider) -> Orchestrator API -> agent-runners -> GitHub PR -> Plane report
```

Add:

```md
Linear remains supported as an optional provider for legacy cards through `/webhooks/linear`.
```

- [ ] **Step 4: Run doc checks**

Run:

```bash
rtk grep "Linear \\(cloud\\)|Sync Linear|Linear \\+ GitHub \\+ Agent" README.md CLAUDE.md docs
rtk pnpm lint
```

Expected: remaining Linear references are explicitly legacy/optional or historical ADR context; lint passes.

- [ ] **Step 5: Commit**

```bash
rtk git add CLAUDE.md README.md docs/ARCHITECTURE.md docs/decisions/ADR-0005-linear-github-agent-workflow.md docs/runbooks/webhook-tailscale.md docs/runbooks/secrets.md apps/orchestrator-api/.env.example infra/compose/orchestrator/.env.example
rtk git commit -m "docs(cards): document Plane-first provider workflow"
```

---

### Task 11: End-to-End Verification and Real Migration

**Files:**
- External state: Plane workspace `attodev`
- External state: Linear team `MAC`
- Optional update: migration report file `docs/runbooks/plane-migration-2026-06-20.md`

**Interfaces:**
- Proves: Plane project exists, active Linear cards are migrated, Plane automation works.

- [ ] **Step 1: Run full local verification**

Run:

```bash
rtk pnpm -r build
rtk pnpm test
```

Expected: all packages build and tests pass.

- [ ] **Step 2: Bootstrap Plane project**

Run:

```bash
rtk pnpm --filter @agent-platform/orchestrator-api plane:bootstrap
```

Expected JSON includes:

```json
{
  "projectId": "00000000-0000-0000-0000-000000000000",
  "labelIds": {
    "ai-ready": "11111111-1111-1111-1111-111111111111",
    "approved": "22222222-2222-2222-2222-222222222222"
  }
}
```

Record the actual UUID values printed by the command in local/prod env. The UUIDs above are examples of the JSON shape only; do not use them as configuration values.

- [ ] **Step 3: Migrate Linear cards**

Run:

```bash
rtk pnpm --filter @agent-platform/orchestrator-api plane:migrate-linear
```

Expected report includes created/skipped/failed counts. `failed` must be empty before considering migration complete.

- [ ] **Step 4: Verify Plane contains migrated cards**

Use Plane MCP with the actual project ID from Step 2:

```text
list_work_items(project_id="actual-plane-project-uuid-from-bootstrap", external_source=linear, per_page=100)
```

Expected: work items exist for active/relevant Linear cards including current `Todo`, `Backlog`, and `In Progress` cards.

- [ ] **Step 5: Create one Plane test card**

Use Plane MCP or Plane UI with the actual IDs from Step 2:

```text
create_work_item(project_id="actual-plane-project-uuid-from-bootstrap", name="AGP E2E provider smoke", description_stripped="Create a small docs note to validate Plane webhook automation.", labels=["actual-ai-ready-label-uuid-from-bootstrap"])
```

Expected: Plane returns a work item ID and identifier.

- [ ] **Step 6: Verify run creation**

Inspect orchestrator DB/API:

```bash
rtk curl http://127.0.0.1:3000/runs?limit=5
```

Expected: newest run has `cardProvider` or serialized equivalent as `plane`, `cardIdentifier` matching the Plane card, and status `awaiting_approval` after planning.

- [ ] **Step 7: Approve via Plane**

Add `approved` label to the Plane card.

Expected: `/webhooks/plane` resolves approval, enqueues `resume`, and the worker moves the run to `executing`.

- [ ] **Step 8: Verify final report**

After worker completes, inspect Plane card comments.

Expected: final report comment appears on Plane card; Linear is not required.

- [ ] **Step 9: Record migration report**

Create `docs/runbooks/plane-migration-2026-06-20.md`:

```md
# Plane Migration 2026-06-20

Plane workspace: `attodev`
Plane project: `Agent Platform` (`AGP`)

## Migration Result

- Created: use the exact `created` value printed by `plane:migrate-linear`
- Skipped existing: use the exact `skipped` value printed by `plane:migrate-linear`
- Failed: 0

## Verification

- Build: passed
- Tests: passed
- Plane webhook smoke: passed
- Plane approval smoke: passed
- Plane final report smoke: passed
```

- [ ] **Step 10: Commit report**

```bash
rtk git add docs/runbooks/plane-migration-2026-06-20.md
rtk git commit -m "docs(cards): record Plane migration verification"
```

---

## Plan Self-Review

- Spec coverage: provider-neutral interface, Plane gateway, Linear optional support, generic run persistence, Plane webhook, scheduler, migration, docs, and verification are each covered by tasks.
- Marker scan: no unresolved marker text or unspecified implementation steps remain.
- Type consistency: `CardProvider`, `CardGateway`, `CardContext`, `cardProvider`, `cardId`, and provider-aware queue payload names are consistent across tasks.
- Scope check: the plan migrates active/relevant cards and does not remove Linear support, matching the approved design.
