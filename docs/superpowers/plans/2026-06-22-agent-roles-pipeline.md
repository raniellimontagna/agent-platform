# Agent Roles Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an explicit agent-role contract for the existing software delivery pipeline without changing LangGraph execution behavior.

**Architecture:** Keep the current LangGraph as the runtime unit. Add role metadata as a typed catalog/configuration layer in `apps/orchestrator-api/src/agents.ts`, expose it through the existing agent list objects, and render it in the registry UI. Preserve `coder-agent` compatibility while introducing `software-delivery-pipeline` as the clearer built-in pipeline identity.

**Tech Stack:** TypeScript, Hono, Drizzle schema types, Vitest, existing orchestrator registry route.

## Global Constraints

- Do not split each graph step into a separate service/runtime in this phase.
- Do not change the checkpointer, queue, worker manager, approval flow, Plane behavior, GitHub behavior, PR behavior, auto-merge behavior, or deploy behavior.
- Preserve compatibility with `coder-agent` and existing labels.
- Keep the LangGraph nodes and edges unchanged.
- Use `rtk` for commands.
- Follow Conventional Commits.

---

## File Structure

- Modify `apps/orchestrator-api/src/agents.ts`
  - Owns built-in agent and role metadata.
  - Exports role types, constants, and helpers.
  - Keeps `DEFAULT_AGENT_KEY` and label resolution compatible.

- Modify `apps/orchestrator-api/src/agents.test.ts`
  - Covers role contract, default pipeline metadata, and compatibility behavior.

- Modify `apps/orchestrator-api/src/routes/registry.ts`
  - Renders role metadata in the registry table when available.
  - Keeps existing HTML escaping and fallback rendering.

- Modify `apps/orchestrator-api/src/routes/registry.test.ts`
  - Covers role rendering and HTML escaping for role fields.

- Optional modify `docs/runbooks/agent-skills.md` or add a short note to `docs/runbooks/superpowers-planning.md`
  - Only if implementation introduces user-facing terminology that needs operator docs.

No database migration is required in this first implementation. Role metadata can be carried in the existing `agents.capabilities` array using stable `role:<key>` tags and exported typed constants. A future migration can add JSONB roles if role configuration needs runtime editing.

---

### Task 1: Add Typed Pipeline Role Metadata

**Files:**
- Modify: `apps/orchestrator-api/src/agents.ts`
- Test: `apps/orchestrator-api/src/agents.test.ts`

**Interfaces:**
- Produces:
  - `export const SOFTWARE_DELIVERY_PIPELINE_KEY = 'software-delivery-pipeline'`
  - `export interface AgentRoleDefinition { key: string; description: string; modelAlias: string | null; skills: string[] }`
  - `export const SOFTWARE_DELIVERY_PIPELINE_ROLES: AgentRoleDefinition[]`
  - `export function roleCapabilities(roles: AgentRoleDefinition[]): string[]`
  - `export function agentRolesFromCapabilities(capabilities: string[]): AgentRoleDefinition[]`
- Consumes:
  - Existing `DEFAULT_AGENT_KEY`, `DEFAULT_AGENTS`, `agentKeyFromLabels`, and `Agent` schema type.

- [ ] **Step 1: Write failing tests for role metadata and capability extraction**

Add these imports to `apps/orchestrator-api/src/agents.test.ts`:

```ts
import {
  SOFTWARE_DELIVERY_PIPELINE_KEY,
  SOFTWARE_DELIVERY_PIPELINE_ROLES,
  agentRolesFromCapabilities,
  roleCapabilities,
} from './agents.js';
```

Add this test block:

```ts
describe('software delivery pipeline roles', () => {
  it('declares the initial planner/coder/critic/pr/reporter roles', () => {
    expect(SOFTWARE_DELIVERY_PIPELINE_KEY).toBe('software-delivery-pipeline');
    expect(SOFTWARE_DELIVERY_PIPELINE_ROLES).toEqual([
      {
        key: 'planner',
        description: 'Gera plano e approval reasons.',
        modelAlias: 'research',
        skills: [],
      },
      {
        key: 'coder',
        description: 'Aplica plano no runner e valida mudancas.',
        modelAlias: 'strong_coder',
        skills: [],
      },
      {
        key: 'critic',
        description: 'Revisa diff e decide recode ou PR.',
        modelAlias: 'critic',
        skills: [],
      },
      {
        key: 'pr',
        description: 'Abre PR e avalia auto-merge.',
        modelAlias: null,
        skills: [],
      },
      {
        key: 'reporter',
        description: 'Publica resumo final no card.',
        modelAlias: null,
        skills: [],
      },
    ]);
  });

  it('serializes roles as stable capabilities', () => {
    expect(roleCapabilities(SOFTWARE_DELIVERY_PIPELINE_ROLES)).toEqual([
      'role:planner',
      'role:coder',
      'role:critic',
      'role:pr',
      'role:reporter',
    ]);
  });

  it('resolves role definitions from capabilities and ignores unknown tags', () => {
    expect(
      agentRolesFromCapabilities(['typescript', 'role:critic', 'role:unknown', 'role:planner']),
    ).toEqual([
      SOFTWARE_DELIVERY_PIPELINE_ROLES[0],
      SOFTWARE_DELIVERY_PIPELINE_ROLES[2],
    ]);
  });
});
```

- [ ] **Step 2: Run the focused tests and verify they fail**

Run:

```bash
rtk corepack pnpm vitest run apps/orchestrator-api/src/agents.test.ts
```

Expected: FAIL because the new role exports do not exist.

- [ ] **Step 3: Implement the role contract**

In `apps/orchestrator-api/src/agents.ts`, add near the existing agent key constants:

```ts
export const SOFTWARE_DELIVERY_PIPELINE_KEY = 'software-delivery-pipeline';

export interface AgentRoleDefinition {
  key: string;
  description: string;
  modelAlias: string | null;
  skills: string[];
}

export const SOFTWARE_DELIVERY_PIPELINE_ROLES: AgentRoleDefinition[] = [
  {
    key: 'planner',
    description: 'Gera plano e approval reasons.',
    modelAlias: 'research',
    skills: [],
  },
  {
    key: 'coder',
    description: 'Aplica plano no runner e valida mudancas.',
    modelAlias: 'strong_coder',
    skills: [],
  },
  {
    key: 'critic',
    description: 'Revisa diff e decide recode ou PR.',
    modelAlias: 'critic',
    skills: [],
  },
  {
    key: 'pr',
    description: 'Abre PR e avalia auto-merge.',
    modelAlias: null,
    skills: [],
  },
  {
    key: 'reporter',
    description: 'Publica resumo final no card.',
    modelAlias: null,
    skills: [],
  },
];

export function roleCapabilities(roles: AgentRoleDefinition[]): string[] {
  return roles.map((role) => `role:${role.key}`);
}

export function agentRolesFromCapabilities(capabilities: string[]): AgentRoleDefinition[] {
  const requested = new Set(
    capabilities
      .filter((capability) => capability.startsWith('role:'))
      .map((capability) => capability.slice('role:'.length)),
  );
  return SOFTWARE_DELIVERY_PIPELINE_ROLES.filter((role) => requested.has(role.key));
}
```

- [ ] **Step 4: Run the focused tests and verify they pass**

Run:

```bash
rtk corepack pnpm vitest run apps/orchestrator-api/src/agents.test.ts
```

Expected: PASS for all tests in `agents.test.ts`.

- [ ] **Step 5: Commit Task 1**

Run:

```bash
rtk git add apps/orchestrator-api/src/agents.ts apps/orchestrator-api/src/agents.test.ts
rtk git commit -m "feat(agents): define pipeline role metadata"
```

Expected: commit succeeds.

---

### Task 2: Seed Pipeline Metadata Without Breaking `coder-agent`

**Files:**
- Modify: `apps/orchestrator-api/src/agents.ts`
- Test: `apps/orchestrator-api/src/agents.test.ts`

**Interfaces:**
- Consumes:
  - `SOFTWARE_DELIVERY_PIPELINE_KEY`
  - `SOFTWARE_DELIVERY_PIPELINE_ROLES`
  - `roleCapabilities`
- Produces:
  - Built-in `software-delivery-pipeline v1` row in `DEFAULT_AGENTS`.
  - Existing `coder-agent` row remains active and compatible.

- [ ] **Step 1: Write failing test for built-in pipeline seed metadata**

Add this export to the existing import list in `apps/orchestrator-api/src/agents.test.ts`:

```ts
  DEFAULT_AGENTS,
```

Add this test:

```ts
describe('DEFAULT_AGENTS', () => {
  it('keeps coder-agent compatible and adds software-delivery-pipeline with roles', () => {
    const keys = DEFAULT_AGENTS.map((row) => row.key);

    expect(keys).toContain(DEFAULT_AGENT_KEY);
    expect(keys).toContain(SOFTWARE_DELIVERY_PIPELINE_KEY);

    const coder = DEFAULT_AGENTS.find((row) => row.key === DEFAULT_AGENT_KEY);
    expect(coder?.description).toContain('compat');

    const pipeline = DEFAULT_AGENTS.find((row) => row.key === SOFTWARE_DELIVERY_PIPELINE_KEY);
    expect(pipeline).toMatchObject({
      key: SOFTWARE_DELIVERY_PIPELINE_KEY,
      version: 'v1',
      description:
        'Pipeline de entrega de software com planejamento, execucao, revisao, PR e report.',
    });
    expect(pipeline?.capabilities).toEqual(
      expect.arrayContaining([
        'typescript',
        'node',
        'hono',
        'feature',
        'bugfix',
        'refactor',
        'single-repo',
        'role:planner',
        'role:coder',
        'role:critic',
        'role:pr',
        'role:reporter',
      ]),
    );
  });
});
```

- [ ] **Step 2: Run focused tests and verify failure**

Run:

```bash
rtk corepack pnpm vitest run apps/orchestrator-api/src/agents.test.ts
```

Expected: FAIL because `DEFAULT_AGENTS` is not exported or pipeline metadata is missing.

- [ ] **Step 3: Export and update built-in agent seed rows**

In `apps/orchestrator-api/src/agents.ts`, change:

```ts
const DEFAULT_AGENTS: NewAgent[] = [
```

to:

```ts
export const DEFAULT_AGENTS: NewAgent[] = [
```

Update the existing default `coder-agent` description to make compatibility explicit:

```ts
description:
  'Compatibilidade: pipeline LangGraph atual (planner→coder→reviewing→revising→pr→report).',
```

Add this row immediately after the `coder-agent` row:

```ts
{
  key: SOFTWARE_DELIVERY_PIPELINE_KEY,
  version: 'v1',
  description: 'Pipeline de entrega de software com planejamento, execucao, revisao, PR e report.',
  capabilities: [
    'typescript',
    'node',
    'hono',
    'feature',
    'bugfix',
    'refactor',
    'single-repo',
    ...roleCapabilities(SOFTWARE_DELIVERY_PIPELINE_ROLES),
  ],
},
```

Do not change `DEFAULT_AGENT_KEY` and do not change `agentKeyFromLabels`.

- [ ] **Step 4: Run focused tests and verify they pass**

Run:

```bash
rtk corepack pnpm vitest run apps/orchestrator-api/src/agents.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

Run:

```bash
rtk git add apps/orchestrator-api/src/agents.ts apps/orchestrator-api/src/agents.test.ts
rtk git commit -m "feat(agents): seed software delivery pipeline"
```

Expected: commit succeeds.

---

### Task 3: Render Roles In The Registry UI

**Files:**
- Modify: `apps/orchestrator-api/src/routes/registry.ts`
- Test: `apps/orchestrator-api/src/routes/registry.test.ts`

**Interfaces:**
- Consumes:
  - `agentRolesFromCapabilities(capabilities: string[]): AgentRoleDefinition[]`
- Produces:
  - Registry agent table includes role pills for pipeline agents.
  - Role names, model aliases, and descriptions are HTML-escaped.

- [ ] **Step 1: Write failing registry tests**

In `apps/orchestrator-api/src/routes/registry.test.ts`, change the agents mock to preserve real non-DB helpers:

```ts
vi.mock('../agents.js', async (orig) => ({
  ...(await orig<typeof import('../agents.js')>()),
  listAgents: vi.fn(),
}));
```

Add this test to `describe('renderRegistryPage')`:

```ts
it('renderiza roles do pipeline a partir das capabilities', () => {
  const html = renderRegistryPage({
    agents: [
      {
        ...agent,
        key: 'software-delivery-pipeline',
        description: 'Pipeline',
        capabilities: ['typescript', 'role:planner', 'role:critic'],
      },
    ] as never,
    tools: [],
    runs: [],
  });

  expect(html).toContain('planner');
  expect(html).toContain('research');
  expect(html).toContain('critic');
  expect(html).toContain('Revisa diff e decide recode ou PR.');
});
```

Add this test to protect escaping:

```ts
it('escapa HTML nas capabilities usadas para roles desconhecidas', () => {
  const html = renderRegistryPage({
    agents: [
      {
        ...agent,
        capabilities: ['role:<script>alert(1)</script>'],
      },
    ] as never,
    tools: [],
    runs: [],
  });

  expect(html).not.toContain('<script>alert(1)</script>');
});
```

- [ ] **Step 2: Run registry tests and verify failure**

Run:

```bash
rtk corepack pnpm vitest run apps/orchestrator-api/src/routes/registry.test.ts
```

Expected: FAIL because the registry does not render role metadata.

- [ ] **Step 3: Render role metadata**

In `apps/orchestrator-api/src/routes/registry.ts`, change the import:

```ts
import { listAgents } from '../agents.js';
```

to:

```ts
import { agentRolesFromCapabilities, listAgents } from '../agents.js';
```

Add this helper after `statusClass`:

```ts
function renderRoles(capabilities: string[]): string {
  const roles = agentRolesFromCapabilities(capabilities);
  if (roles.length === 0) return '';
  const items = roles
    .map((role) => {
      const model = role.modelAlias ? ` · ${role.modelAlias}` : '';
      return `<li><strong>${escapeHtml(role.key)}</strong><span>${escapeHtml(
        `${role.description}${model}`,
      )}</span></li>`;
    })
    .join('');
  return `<ul class="roles">${items}</ul>`;
}
```

In the agent row template, replace the capabilities cell:

```ts
<td>${agent.capabilities.map((capability) => `<code>${escapeHtml(capability)}</code>`).join(' ')}</td>
```

with:

```ts
<td>${agent.capabilities.map((capability) => `<code>${escapeHtml(capability)}</code>`).join(' ')}${renderRoles(agent.capabilities)}</td>
```

Add these CSS rules in the `<style>` block:

```css
    .roles { margin: 6px 0 0; padding: 0; list-style: none; display: grid; gap: 4px; }
    .roles li { display: grid; gap: 1px; }
    .roles strong { font-size: 12px; }
    .roles span { margin: 0; font-size: 12px; }
```

- [ ] **Step 4: Run registry tests and verify they pass**

Run:

```bash
rtk corepack pnpm vitest run apps/orchestrator-api/src/routes/registry.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 3**

Run:

```bash
rtk git add apps/orchestrator-api/src/routes/registry.ts apps/orchestrator-api/src/routes/registry.test.ts
rtk git commit -m "feat(registry): show pipeline roles"
```

Expected: commit succeeds.

---

### Task 4: Verification And Documentation

**Files:**
- Modify: `docs/runbooks/agent-skills.md`
- Test: existing test suite and build commands.

**Interfaces:**
- Consumes:
  - Pipeline role metadata and registry rendering from prior tasks.
- Produces:
  - Short operator-facing documentation explaining that `coder-agent` remains compatible and `software-delivery-pipeline` is the clearer pipeline identity.

- [ ] **Step 1: Add a short runbook note**

Append this section to `docs/runbooks/agent-skills.md`:

```md
## Pipeline roles

O `coder-agent` permanece como chave compativel do pipeline LangGraph atual.
Novas evolucoes devem tratar esse fluxo como um pipeline de entrega de software
composto por roles:

- `planner`: gera plano e approval reasons.
- `coder`: aplica plano no runner e valida mudancas.
- `critic`: revisa diff e decide recode ou PR.
- `pr`: abre PR e avalia auto-merge.
- `reporter`: publica resumo final no card.

O catalogo pode expor `software-delivery-pipeline` como identidade mais clara do
pipeline, sem mudar labels existentes nem separar a execucao fisica do LangGraph.
```

- [ ] **Step 2: Run focused tests**

Run:

```bash
rtk corepack pnpm vitest run apps/orchestrator-api/src/agents.test.ts apps/orchestrator-api/src/routes/registry.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run full verification**

Run:

```bash
rtk corepack pnpm lint
rtk corepack pnpm --filter @agent-platform/orchestrator-api build
rtk corepack pnpm test
```

Expected: all commands PASS.

- [ ] **Step 4: Commit documentation**

Run:

```bash
rtk git add docs/runbooks/agent-skills.md
rtk git commit -m "docs(agents): document pipeline roles"
```

Expected: commit succeeds if the docs changed. If Task 4 produced no doc change because the note already exists, skip this commit and mention it in the final handoff.

- [ ] **Step 5: Final status check**

Run:

```bash
rtk git status --short --branch
rtk git log --oneline -5
```

Expected: working tree clean, branch ahead by the implementation commits.

---

## Self-Review

- Spec coverage: This plan implements the approved first phase: role metadata, catalog/configuration visibility, registry rendering, compatibility, and tests. It deliberately does not split runtime execution or change LangGraph behavior.
- Completeness scan: No unresolved implementation gaps remain. Optional documentation is bounded with exact content and a skip condition.
- Type consistency: `AgentRoleDefinition`, `SOFTWARE_DELIVERY_PIPELINE_ROLES`, `roleCapabilities`, and `agentRolesFromCapabilities` are defined in Task 1 and consumed consistently in later tasks.
