# Agent Role Quality System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add versioned role contracts, role model resolution, focused role evals, and quality metrics for the existing software-delivery pipeline.

**Architecture:** Keep the current LangGraph pipeline intact and improve each role through local versioned skills plus small shared helpers. Planner and critic consume role contracts first because they are the highest quality gates; coder receives role instructions through the existing worker skill injection path. PR/reporter remain deterministic initially, while exposing their contracts and quality summary helpers.

**Tech Stack:** TypeScript, pnpm workspaces, Vitest, Hono/LangGraph nodes, local `agent-skills/`, Drizzle-backed run state without an initial migration.

## Global Constraints

- Do not split roles into separate workers, queues, or physical agents.
- Do not replace the current LangGraph flow.
- Keep `coder-agent` compatible with existing labels and runs.
- Do not import, execute, or synchronize content from `https://github.com/affaan-m/ECC/tree/main`; use it only as a manually reviewed reference.
- Avoid a database migration in the first implementation; derive metrics from existing state, tests, comments, and artifacts.
- Follow `CLAUDE.md`: prefix commands with `rtk`, use Conventional Commits, and keep Plane as the primary card provider.

---

## File Structure

- Create `agent-skills/software-planner/SKILL.md`: planner role contract.
- Create `agent-skills/software-coder/SKILL.md`: coder role contract.
- Create `agent-skills/software-critic/SKILL.md`: critic role contract.
- Create `agent-skills/software-pr/SKILL.md`: PR role contract.
- Create `agent-skills/software-reporter/SKILL.md`: reporter role contract.
- Modify `agent-skills/registry.json`: register role skills for `software-delivery-pipeline` and `coder-agent`.
- Modify `docs/runbooks/agent-skills.md`: document role skills and ECC reference policy.
- Create `packages/graph/src/roleContracts.ts`: loads local role skill content and builds role prompts with fallback.
- Create `packages/graph/src/roleContracts.test.ts`: contract loading and fallback coverage.
- Create `packages/graph/src/roleModels.ts`: resolves model alias by role.
- Create `packages/graph/src/roleModels.test.ts`: alias defaults and overrides.
- Modify `packages/graph/src/nodes/planner.ts`: consume planner contract and role alias helper.
- Modify `packages/graph/src/nodes/planner.test.ts`: prompt contract and alias coverage.
- Modify `packages/graph/src/nodes/review.ts`: consume critic contract and role alias helper.
- Modify `packages/graph/src/nodes/review.test.ts`: critic contract and loop coverage.
- Modify `apps/worker-code/src/executor/agentSkills.ts`: make pipeline/coder role skills available to the worker.
- Modify `apps/worker-code/src/executor/codegen.test.ts`: prove `coder-agent` receives software role instructions.
- Create `apps/worker-code/src/eval/roleQuality.ts`: pure role quality scoring helpers for planner and critic fixtures.
- Create `apps/worker-code/src/eval/roleQuality.test.ts`: deterministic role eval coverage.
- Create `packages/graph/src/qualityMetrics.ts`: derives quality metrics from `AgentStateType`.
- Create `packages/graph/src/qualityMetrics.test.ts`: metrics coverage.
- Modify `packages/graph/src/nodes/report.ts`: include concise quality metric lines in the final comment.
- Modify `packages/graph/src/nodes/report.test.ts`: final report contains quality metrics.
- Modify `docs/ARCHITECTURE.md`: note role contracts, aliases, evals, and metrics.

---

### Task 1: Add Versioned Role Skills

**Files:**
- Create: `agent-skills/software-planner/SKILL.md`
- Create: `agent-skills/software-coder/SKILL.md`
- Create: `agent-skills/software-critic/SKILL.md`
- Create: `agent-skills/software-pr/SKILL.md`
- Create: `agent-skills/software-reporter/SKILL.md`
- Modify: `agent-skills/registry.json`
- Modify: `docs/runbooks/agent-skills.md`

**Interfaces:**
- Consumes: existing `buildSkillInstructions(agentKey, capabilities, root)`.
- Produces: registry entries named `software-planner`, `software-coder`, `software-critic`, `software-pr`, `software-reporter`.

- [ ] **Step 1: Write the failing worker skill test**

Add this test in `apps/worker-code/src/executor/codegen.test.ts` inside `describe('buildAgentInstructions', ...)`:

```ts
it('carrega contratos de role para coder-agent e software-delivery-pipeline', () => {
  const coder = buildAgentInstructions('coder-agent', ['typescript']);
  const pipeline = buildAgentInstructions('software-delivery-pipeline', ['role:planner']);

  expect(coder).toContain('software-coder');
  expect(coder).toContain('Preserve todo código não relacionado');
  expect(coder).toContain('software-critic');
  expect(pipeline).toContain('software-planner');
  expect(pipeline).toContain('APPROVAL_REASONS');
  expect(pipeline).toContain('software-reporter');
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
rtk corepack pnpm vitest run apps/worker-code/src/executor/codegen.test.ts
```

Expected: FAIL because `coder-agent` currently returns an empty instruction block and the new skill names are not registered.

- [ ] **Step 3: Create role skill files**

Create `agent-skills/software-planner/SKILL.md`:

```md
---
name: software-planner
description: Contract for the planner role in the software delivery pipeline.
---

# Software Planner

You turn a Plane card into an executable engineering plan.

Inputs:
- card identifier, title, and description;
- repository conventions when available;
- prior lessons when available.

Output:
- markdown plan with understanding, scope, likely files, ordered steps, validation commands, acceptance criteria, risks, and self-review;
- final line exactly `APPROVAL_REASONS: <values or none>`.

Rules:
- Do not write code.
- Prefer small changes and YAGNI.
- For feature, bugfix, and refactor work, specify RED/GREEN/REFACTOR.
- Name likely files with exact paths when known.
- Include only real approval reasons: migration, auth_security, infra, deploy, critical_deps, file_deletion.
```

Create `agent-skills/software-coder/SKILL.md`:

```md
---
name: software-coder
description: Contract for the coder role in the software delivery pipeline.
---

# Software Coder

You implement the approved plan inside the existing repository.

Inputs:
- approved plan;
- current file contents selected for the batch;
- repository conventions and examples;
- critic feedback when revising.

Output:
- complete final file contents in the requested JSON schema;
- concise PR title and summary.

Rules:
- Preserve todo código não relacionado.
- Modify only files selected for the current batch.
- Add or update tests before implementation when behavior changes.
- Respect existing style, module boundaries, and package conventions.
- Do not add dependencies unless the plan explicitly requires them.
- When addressing critic feedback, change only what resolves the feedback.
```

Create `agent-skills/software-critic/SKILL.md`:

```md
---
name: software-critic
description: Contract for the critic role in the software delivery pipeline.
---

# Software Critic

You review the generated diff as a senior code reviewer.

Inputs:
- card title and description;
- approved plan;
- sandbox validation result;
- generated diff.

Output:
- markdown review with `Veredito: APROVADO`, `Veredito: APROVADO COM RESSALVAS`, or `Veredito: REPROVADO`;
- concrete problems with file paths and corrective guidance;
- observations about tests, scope, and plan adherence.

Blocking issues:
- functional bugs;
- security regressions;
- broken tests or missing tests for changed behavior;
- scope changes not requested by the plan.

Operational caveats:
- missing production evidence;
- post-deploy checks;
- database inspection that cannot be performed in the sandbox.

Rules:
- Be concise and specific.
- Do not request recode for purely operational caveats.
- Do not rewrite the full solution.
```

Create `agent-skills/software-pr/SKILL.md`:

```md
---
name: software-pr
description: Contract for the PR role in the software delivery pipeline.
---

# Software PR

You package the completed branch into a GitHub pull request.

Inputs:
- branch, base branch, title, summary, plan, validation result, critic review, and auto-merge eligibility.

Output:
- Conventional Commits PR title;
- PR body with summary, validation, critic review, and plan;
- draft status when auto-merge is not eligible.

Rules:
- Keep PR text factual and reviewable.
- Never mark a PR ready for auto-merge unless validation passed and critic verdict allows it.
```

Create `agent-skills/software-reporter/SKILL.md`:

```md
---
name: software-reporter
description: Contract for the reporter role in the software delivery pipeline.
---

# Software Reporter

You publish the final run outcome back to the Plane card.

Inputs:
- final status;
- PR URL and branch;
- validation result;
- critic verdict;
- review rounds;
- fix attempts;
- estimated cost.

Output:
- concise markdown comment for the card.

Rules:
- Make the final state obvious in the first lines.
- Include quality signals that help operators decide the next action.
- Include raw error text only when the run failed.
```

- [ ] **Step 4: Register skills**

Modify `agent-skills/registry.json` so `agentSkills` includes:

```json
"coder-agent": [
  "software-planner",
  "software-coder",
  "software-critic",
  "software-pr",
  "software-reporter"
],
"software-delivery-pipeline": [
  "software-planner",
  "software-coder",
  "software-critic",
  "software-pr",
  "software-reporter"
]
```

Add these entries to `skills`:

```json
{
  "name": "software-planner",
  "path": "agent-skills/software-planner/SKILL.md",
  "description": "Plan software delivery work with scope, TDD, validation, approval reasons, and self-review."
},
{
  "name": "software-coder",
  "path": "agent-skills/software-coder/SKILL.md",
  "description": "Implement approved software plans while preserving unrelated code and respecting repo conventions."
},
{
  "name": "software-critic",
  "path": "agent-skills/software-critic/SKILL.md",
  "description": "Review generated diffs for bugs, regressions, tests, security, scope, and operational caveats."
},
{
  "name": "software-pr",
  "path": "agent-skills/software-pr/SKILL.md",
  "description": "Package validated branches into factual GitHub pull requests with safe auto-merge gates."
},
{
  "name": "software-reporter",
  "path": "agent-skills/software-reporter/SKILL.md",
  "description": "Report final run outcomes and quality signals back to Plane cards."
}
```

- [ ] **Step 5: Update role skill docs**

Add to `docs/runbooks/agent-skills.md` under “Pipeline roles”:

```md
Each pipeline role has a local reviewed skill:

- `software-planner`
- `software-coder`
- `software-critic`
- `software-pr`
- `software-reporter`

`coder-agent` and `software-delivery-pipeline` both load these skills so existing labels keep working while the clearer pipeline identity evolves.

External reference note: `https://github.com/affaan-m/ECC/tree/main` can be used as a manual research source for skill and harness ideas. Do not import, execute, or synchronize ECC content automatically; review license, security, and compatibility before adapting any idea.
```

- [ ] **Step 6: Run tests and commit**

Run:

```bash
rtk corepack pnpm vitest run apps/worker-code/src/executor/codegen.test.ts
rtk corepack pnpm lint
```

Expected: PASS.

Commit:

```bash
rtk git add agent-skills apps/worker-code/src/executor/codegen.test.ts docs/runbooks/agent-skills.md
rtk git commit -m "feat(agents): add software role skills"
```

---

### Task 2: Add Shared Role Contract Loader and Model Alias Resolver

**Files:**
- Create: `packages/graph/src/roleContracts.ts`
- Create: `packages/graph/src/roleContracts.test.ts`
- Create: `packages/graph/src/roleModels.ts`
- Create: `packages/graph/src/roleModels.test.ts`

**Interfaces:**
- Produces: `type SoftwareRole = 'planner' | 'coder' | 'critic' | 'pr' | 'reporter'`.
- Produces: `buildRoleSystemPrompt(role: SoftwareRole, basePrompt: string, root?: string): string`.
- Produces: `modelAliasForRole(role: SoftwareRole, overrides?: Partial<Record<SoftwareRole, string | null>>): string | null`.

- [ ] **Step 1: Write failing role contract tests**

Create `packages/graph/src/roleContracts.test.ts`:

```ts
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildRoleSystemPrompt } from './roleContracts.js';

describe('buildRoleSystemPrompt', () => {
  it('appends the local role contract when present', async () => {
    const root = await mkdtemp(join(tmpdir(), 'role-contract-'));
    await mkdir(join(root, 'agent-skills/software-critic'), { recursive: true });
    await writeFile(
      join(root, 'agent-skills/software-critic/SKILL.md'),
      '---\nname: software-critic\n---\n\n# Critic Contract\nVeredito required.',
    );

    const prompt = buildRoleSystemPrompt('critic', 'Base prompt.', root);

    expect(prompt).toContain('Base prompt.');
    expect(prompt).toContain('## Role contract: software-critic');
    expect(prompt).toContain('Veredito required.');
  });

  it('returns the base prompt when the contract file is missing', () => {
    expect(buildRoleSystemPrompt('planner', 'Base only.', '/tmp/missing-root')).toBe('Base only.');
  });
});
```

- [ ] **Step 2: Write failing role model tests**

Create `packages/graph/src/roleModels.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { modelAliasForRole } from './roleModels.js';

describe('modelAliasForRole', () => {
  it('returns stable defaults for software roles', () => {
    expect(modelAliasForRole('planner')).toBe('research');
    expect(modelAliasForRole('coder')).toBe('strong_coder');
    expect(modelAliasForRole('critic')).toBe('critic');
    expect(modelAliasForRole('pr')).toBeNull();
    expect(modelAliasForRole('reporter')).toBeNull();
  });

  it('allows explicit overrides', () => {
    expect(modelAliasForRole('planner', { planner: 'heavy_coder' })).toBe('heavy_coder');
    expect(modelAliasForRole('reporter', { reporter: 'cheap_fast' })).toBe('cheap_fast');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run:

```bash
rtk corepack pnpm vitest run packages/graph/src/roleContracts.test.ts packages/graph/src/roleModels.test.ts
```

Expected: FAIL because the modules do not exist.

- [ ] **Step 4: Implement `roleContracts.ts`**

Create `packages/graph/src/roleContracts.ts`:

```ts
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type SoftwareRole = 'planner' | 'coder' | 'critic' | 'pr' | 'reporter';

const ROLE_SKILL_BY_ROLE: Record<SoftwareRole, string> = {
  planner: 'software-planner',
  coder: 'software-coder',
  critic: 'software-critic',
  pr: 'software-pr',
  reporter: 'software-reporter',
};

function repoRootFromModule(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, '../../..');
}

function stripFrontmatter(markdown: string): string {
  const match = markdown.match(/^---\n[\s\S]*?\n---\n?/);
  return match ? markdown.slice(match[0].length).trim() : markdown.trim();
}

export function roleSkillName(role: SoftwareRole): string {
  return ROLE_SKILL_BY_ROLE[role];
}

export function loadRoleContract(role: SoftwareRole, root = repoRootFromModule()): string {
  const skillName = roleSkillName(role);
  const path = resolve(root, `agent-skills/${skillName}/SKILL.md`);
  if (!existsSync(path)) return '';
  return stripFrontmatter(readFileSync(path, 'utf8'));
}

export function buildRoleSystemPrompt(
  role: SoftwareRole,
  basePrompt: string,
  root = repoRootFromModule(),
): string {
  const contract = loadRoleContract(role, root);
  if (!contract) return basePrompt;
  return `${basePrompt.trim()}\n\n## Role contract: ${roleSkillName(role)}\n${contract}`;
}
```

- [ ] **Step 5: Implement `roleModels.ts`**

Create `packages/graph/src/roleModels.ts`:

```ts
import type { SoftwareRole } from './roleContracts.js';

export const DEFAULT_ROLE_MODEL_ALIASES: Record<SoftwareRole, string | null> = {
  planner: 'research',
  coder: 'strong_coder',
  critic: 'critic',
  pr: null,
  reporter: null,
};

export function modelAliasForRole(
  role: SoftwareRole,
  overrides: Partial<Record<SoftwareRole, string | null>> = {},
): string | null {
  return Object.hasOwn(overrides, role) ? (overrides[role] ?? null) : DEFAULT_ROLE_MODEL_ALIASES[role];
}
```

- [ ] **Step 6: Run tests and commit**

Run:

```bash
rtk corepack pnpm vitest run packages/graph/src/roleContracts.test.ts packages/graph/src/roleModels.test.ts
rtk corepack pnpm lint
```

Expected: PASS.

Commit:

```bash
rtk git add packages/graph/src/roleContracts.ts packages/graph/src/roleContracts.test.ts packages/graph/src/roleModels.ts packages/graph/src/roleModels.test.ts
rtk git commit -m "feat(graph): add role contracts and model aliases"
```

---

### Task 3: Wire Planner and Critic to Role Contracts

**Files:**
- Modify: `packages/graph/src/nodes/planner.ts`
- Modify: `packages/graph/src/nodes/planner.test.ts`
- Modify: `packages/graph/src/nodes/review.ts`
- Modify: `packages/graph/src/nodes/review.test.ts`

**Interfaces:**
- Consumes: `buildRoleSystemPrompt(role, basePrompt)` and `modelAliasForRole(role)`.
- Preserves: planner `APPROVAL_REASONS` parsing and critic `Veredito` parsing.

- [ ] **Step 1: Write failing planner tests**

In `packages/graph/src/nodes/planner.test.ts`, update imports:

```ts
import { PLANNER_BASE_PROMPT, PLANNER_SYSTEM_PROMPT, plannerModelAlias } from './planner.js';
```

Add tests:

```ts
it('compõe o prompt do planner com contrato de role', () => {
  expect(PLANNER_BASE_PROMPT).toContain('APPROVAL_REASONS:');
  expect(PLANNER_SYSTEM_PROMPT).toContain('Role contract: software-planner');
  expect(PLANNER_SYSTEM_PROMPT).toContain('Software Planner');
});

it('usa alias de modelo da role planner', () => {
  expect(plannerModelAlias()).toBe('research');
});
```

- [ ] **Step 2: Write failing critic tests**

In `packages/graph/src/nodes/review.test.ts`, update imports:

```ts
import { CRITIC_BASE_PROMPT, CRITIC_SYSTEM_PROMPT, criticModelAlias, decideAfterReview } from './review.js';
```

Add tests:

```ts
it('compõe o prompt do critic com contrato de role', () => {
  expect(CRITIC_BASE_PROMPT).toContain('Veredito');
  expect(CRITIC_SYSTEM_PROMPT).toContain('Role contract: software-critic');
  expect(CRITIC_SYSTEM_PROMPT).toContain('Software Critic');
});

it('usa alias de modelo da role critic', () => {
  expect(criticModelAlias()).toBe('critic');
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run:

```bash
rtk corepack pnpm vitest run packages/graph/src/nodes/planner.test.ts packages/graph/src/nodes/review.test.ts
```

Expected: FAIL because the exported names do not exist yet.

- [ ] **Step 4: Update planner node**

In `packages/graph/src/nodes/planner.ts`:

```ts
import { buildRoleSystemPrompt } from '../roleContracts.js';
import { modelAliasForRole } from '../roleModels.js';
```

Rename `PLANNER_SYSTEM_PROMPT` to `PLANNER_BASE_PROMPT`, then export:

```ts
export const PLANNER_SYSTEM_PROMPT = buildRoleSystemPrompt('planner', PLANNER_BASE_PROMPT);

export function plannerModelAlias(): string {
  return modelAliasForRole('planner') ?? 'research';
}
```

Change the LLM call from:

```ts
alias: 'research',
```

to:

```ts
alias: plannerModelAlias(),
```

Change cost calculation from:

```ts
planCostUsd: estimateCostUsd('research', usage),
```

to:

```ts
planCostUsd: estimateCostUsd(plannerModelAlias(), usage),
```

- [ ] **Step 5: Update review node**

In `packages/graph/src/nodes/review.ts`:

```ts
import { buildRoleSystemPrompt } from '../roleContracts.js';
import { modelAliasForRole } from '../roleModels.js';
```

Rename `SYSTEM_PROMPT` to:

```ts
export const CRITIC_BASE_PROMPT = `Você é um revisor de código sênior e crítico.
Recebe a issue, o plano aprovado e o diff das alterações geradas por outro agente.
Revise o diff e produza um parecer conciso em markdown:
- **Veredito**: APROVADO | APROVADO COM RESSALVAS | REPROVADO (uma linha).
- **Problemas** (se houver): bugs, falhas de segurança, lógica incorreta — cada um com arquivo/trecho e correção sugerida.
- **Observações**: estilo, testes faltando, aderência ao plano.
Não reescreva o código todo; aponte o que importa. Se estiver bom, diga e seja breve.`;
export const CRITIC_SYSTEM_PROMPT = buildRoleSystemPrompt('critic', CRITIC_BASE_PROMPT);

export function criticModelAlias(): string {
  return modelAliasForRole('critic') ?? 'critic';
}
```

Change the review LLM call from:

```ts
alias: 'critic',
```

to:

```ts
alias: criticModelAlias(),
```

Change the system message from `SYSTEM_PROMPT` to `CRITIC_SYSTEM_PROMPT`, and cost from:

```ts
const reviewCostUsd = estimateCostUsd('critic', usage);
```

to:

```ts
const reviewCostUsd = estimateCostUsd(criticModelAlias(), usage);
```

- [ ] **Step 6: Run tests and commit**

Run:

```bash
rtk corepack pnpm vitest run packages/graph/src/nodes/planner.test.ts packages/graph/src/nodes/review.test.ts packages/graph/src/roleContracts.test.ts packages/graph/src/roleModels.test.ts
rtk corepack pnpm lint
```

Expected: PASS.

Commit:

```bash
rtk git add packages/graph/src/nodes/planner.ts packages/graph/src/nodes/planner.test.ts packages/graph/src/nodes/review.ts packages/graph/src/nodes/review.test.ts
rtk git commit -m "feat(graph): apply role contracts to planner and critic"
```

---

### Task 4: Add Deterministic Role Quality Evals

**Files:**
- Create: `apps/worker-code/src/eval/roleQuality.ts`
- Create: `apps/worker-code/src/eval/roleQuality.test.ts`
- Modify: `docs/runbooks/eval-harness.md`

**Interfaces:**
- Produces: `scorePlannerOutput(plan: string): EvalCheck[]`.
- Produces: `scoreCriticOutput(review: string): EvalCheck[]`.
- Consumes: existing `EvalCheck` type from `apps/worker-code/src/eval/types.ts`.

- [ ] **Step 1: Write failing role quality tests**

Create `apps/worker-code/src/eval/roleQuality.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { scoreCriticOutput, scorePlannerOutput } from './roleQuality.js';

describe('scorePlannerOutput', () => {
  it('aprova plano com escopo, arquivos, TDD, validação e approval reasons', () => {
    const checks = scorePlannerOutput([
      '## Entendimento do problema',
      '## Escopo',
      '- `apps/api/src/index.ts`',
      'RED/GREEN/REFACTOR',
      'rtk corepack pnpm test',
      '## Critérios de aceite',
      'APPROVAL_REASONS: none',
    ].join('\n'));

    expect(checks.every((check) => check.passed)).toBe(true);
  });

  it('reprova plano sem approval reasons', () => {
    const checks = scorePlannerOutput('Plano sem linha estruturada.');
    expect(checks.find((check) => check.name === 'planner:approval-reasons')?.passed).toBe(false);
  });
});

describe('scoreCriticOutput', () => {
  it('aprova parecer com veredito e problema acionável com path', () => {
    const checks = scoreCriticOutput([
      'Veredito: REPROVADO',
      '## Problemas',
      '- `src/index.ts` — bug funcional; corrija a condição.',
      '## Observações',
      '- Teste cobre regressão.',
    ].join('\n'));

    expect(checks.every((check) => check.passed)).toBe(true);
  });

  it('reprova parecer sem veredito', () => {
    const checks = scoreCriticOutput('Parece bom, mas sem formato.');
    expect(checks.find((check) => check.name === 'critic:verdict')?.passed).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
rtk corepack pnpm vitest run apps/worker-code/src/eval/roleQuality.test.ts
```

Expected: FAIL because `roleQuality.ts` does not exist.

- [ ] **Step 3: Implement role quality scoring**

Create `apps/worker-code/src/eval/roleQuality.ts`:

```ts
import type { EvalCheck } from './types.js';

function check(name: string, passed: boolean, detail: string): EvalCheck {
  return { name, passed, detail };
}

export function scorePlannerOutput(plan: string): EvalCheck[] {
  return [
    check('planner:understanding', /entendimento/i.test(plan), 'contains understanding section'),
    check('planner:scope', /escopo|fora de escopo/i.test(plan), 'contains scope section'),
    check('planner:files', /`[^`]+\.(ts|tsx|js|jsx|md|json|astro)`/.test(plan), 'contains exact file path'),
    check('planner:tdd', /RED\/GREEN\/REFACTOR|teste que falha|TDD/i.test(plan), 'contains TDD guidance'),
    check('planner:validation', /rtk .*?(pnpm|vitest|test|lint|build)/i.test(plan), 'contains rtk validation command'),
    check('planner:acceptance', /crit[eé]rios? de aceite|acceptance/i.test(plan), 'contains acceptance criteria'),
    check(
      'planner:approval-reasons',
      /APPROVAL_REASONS:\s*(none|migration|auth_security|infra|deploy|critical_deps|file_deletion)/.test(plan),
      'contains structured approval reasons line',
    ),
  ];
}

export function scoreCriticOutput(review: string): EvalCheck[] {
  const hasVerdict = /Veredito\**\s*:\s*\**\s*(APROVADO|APROVADO COM RESSALVAS|REPROVADO)/i.test(review);
  const hasProblemsSection = /problemas/i.test(review);
  const hasPath = /`[^`]+\.(ts|tsx|js|jsx|md|json|astro)`/.test(review);
  const approved = /Veredito\**\s*:\s*\**\s*APROVADO\s*$/im.test(review);

  return [
    check('critic:verdict', hasVerdict, 'contains supported verdict'),
    check('critic:problems-section', hasProblemsSection || approved, 'contains problems section or clean approval'),
    check('critic:file-path', hasPath || approved, 'contains file path for actionable feedback'),
    check(
      'critic:blocking-language',
      /bug|seguran[cç]a|regress[aã]o|teste|escopo|operacional|evid[eê]ncia|aprovado/i.test(review),
      'uses quality gate language',
    ),
  ];
}
```

- [ ] **Step 4: Document role evals**

Add to `docs/runbooks/eval-harness.md`:

```md
## Role quality checks

`apps/worker-code/src/eval/roleQuality.ts` contains deterministic checks for
planner and critic outputs. They do not call Plane, GitHub, Linear, or real LLMs.
Use them when changing role contracts or prompts:

```bash
rtk corepack pnpm vitest run apps/worker-code/src/eval/roleQuality.test.ts
```
```

- [ ] **Step 5: Run tests and commit**

Run:

```bash
rtk corepack pnpm vitest run apps/worker-code/src/eval/roleQuality.test.ts
rtk corepack pnpm lint
```

Expected: PASS.

Commit:

```bash
rtk git add apps/worker-code/src/eval/roleQuality.ts apps/worker-code/src/eval/roleQuality.test.ts docs/runbooks/eval-harness.md
rtk git commit -m "feat(eval): add role quality checks"
```

---

### Task 5: Add Quality Metrics Summary to Reports

**Files:**
- Create: `packages/graph/src/qualityMetrics.ts`
- Create: `packages/graph/src/qualityMetrics.test.ts`
- Modify: `packages/graph/src/nodes/report.ts`
- Modify: `packages/graph/src/nodes/report.test.ts`

**Interfaces:**
- Produces: `qualityMetricsForState(state): QualityMetrics`.
- Produces: `formatQualityMetrics(metrics: QualityMetrics): string[]`.
- Consumes: existing `verdictOf`, `hasOnlyOperationalCaveats`, and `AgentStateType`.

- [ ] **Step 1: Write failing quality metrics tests**

Create `packages/graph/src/qualityMetrics.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { formatQualityMetrics, qualityMetricsForState } from './qualityMetrics.js';

describe('qualityMetricsForState', () => {
  it('deriva sinais de qualidade do estado do run', () => {
    const metrics = qualityMetricsForState({
      review: 'Veredito: APROVADO',
      reviewRounds: 2,
      fixAttempts: 1,
      testsPassed: true,
      prUrl: 'https://github.com/acme/repo/pull/1',
      autoMerge: true,
      planCostUsd: 0.01,
      codeCostUsd: 0.02,
      reviewCostUsd: 0.03,
    } as never);

    expect(metrics).toEqual({
      criticVerdict: 'APROVADO',
      criticRounds: 2,
      fixAttempts: 1,
      testsPassed: true,
      prOpened: true,
      autoMergeEligible: true,
      autoMergeBlockedReason: null,
      estimatedCostUsd: 0.06,
    });
  });

  it('explica bloqueio de auto-merge por validação falha', () => {
    const metrics = qualityMetricsForState({
      review: 'Veredito: APROVADO',
      testsPassed: false,
      autoMerge: true,
    } as never);

    expect(metrics.autoMergeEligible).toBe(false);
    expect(metrics.autoMergeBlockedReason).toBe('validation failed');
  });
});

describe('formatQualityMetrics', () => {
  it('formata linhas concisas para o report', () => {
    expect(
      formatQualityMetrics({
        criticVerdict: 'APROVADO',
        criticRounds: 1,
        fixAttempts: 0,
        testsPassed: true,
        prOpened: true,
        autoMergeEligible: true,
        autoMergeBlockedReason: null,
        estimatedCostUsd: 0.0123,
      }),
    ).toContain('**Qualidade:** critic `APROVADO`, validação passou, PR aberto');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
rtk corepack pnpm vitest run packages/graph/src/qualityMetrics.test.ts
```

Expected: FAIL because `qualityMetrics.ts` does not exist.

- [ ] **Step 3: Implement quality metrics**

Create `packages/graph/src/qualityMetrics.ts`:

```ts
import type { AgentStateType } from './state.js';
import { hasOnlyOperationalCaveats, shouldAutoMerge, verdictOf } from './nodes/report.js';

export interface QualityMetrics {
  criticVerdict: string;
  criticRounds: number;
  fixAttempts: number;
  testsPassed?: boolean;
  prOpened: boolean;
  autoMergeEligible: boolean;
  autoMergeBlockedReason: string | null;
  estimatedCostUsd: number;
}

export function qualityMetricsForState(state: Partial<AgentStateType>): QualityMetrics {
  const criticVerdict = verdictOf(state.review);
  const autoMergeEligible = shouldAutoMerge({
    autoMerge: state.autoMerge,
    testsPassed: state.testsPassed,
    review: state.review,
  });

  return {
    criticVerdict,
    criticRounds: state.reviewRounds ?? 0,
    fixAttempts: state.fixAttempts ?? 0,
    testsPassed: state.testsPassed,
    prOpened: Boolean(state.prUrl),
    autoMergeEligible,
    autoMergeBlockedReason: autoMergeEligible ? null : autoMergeBlockedReason(state),
    estimatedCostUsd: (state.planCostUsd ?? 0) + (state.codeCostUsd ?? 0) + (state.reviewCostUsd ?? 0),
  };
}

function autoMergeBlockedReason(state: Partial<AgentStateType>): string | null {
  if (state.autoMerge !== true) return 'auto-merge not requested';
  if (state.testsPassed !== true) return 'validation failed';
  if (!state.review) return 'critic verdict missing';
  if (verdictOf(state.review) === 'REPROVADO') return 'critic rejected';
  if (verdictOf(state.review) === 'APROVADO COM RESSALVAS' && !hasOnlyOperationalCaveats(state.review)) {
    return 'non-operational caveat requires manual review';
  }
  return null;
}

function validationLabel(value?: boolean): string {
  if (value === undefined) return 'não executada';
  return value ? 'passou' : 'falhou';
}

export function formatQualityMetrics(metrics: QualityMetrics): string[] {
  const lines = [
    `**Qualidade:** critic \`${metrics.criticVerdict}\`, validação ${validationLabel(metrics.testsPassed)}, ${metrics.prOpened ? 'PR aberto' : 'PR não aberto'}`,
    `**Loop:** ${metrics.criticRounds} volta(s) critic, ${metrics.fixAttempts} auto-correção(ões)`,
  ];
  if (metrics.autoMergeEligible) {
    lines.push('**Auto-merge:** elegível');
  } else if (metrics.autoMergeBlockedReason) {
    lines.push(`**Auto-merge:** bloqueado — ${metrics.autoMergeBlockedReason}`);
  }
  if (metrics.estimatedCostUsd > 0) {
    lines.push(`**Custo estimado por roles:** ~$${metrics.estimatedCostUsd.toFixed(4)}`);
  }
  return lines;
}
```

- [ ] **Step 4: Wire metrics into report node**

In `packages/graph/src/nodes/report.ts`, import:

```ts
import { formatQualityMetrics, qualityMetricsForState } from '../qualityMetrics.js';
```

After the existing validation/review/fix lines, add:

```ts
lines.push(...formatQualityMetrics(qualityMetricsForState(state)));
```

Keep existing lines for backwards compatibility even if some content overlaps.

- [ ] **Step 5: Add report node assertion**

In `packages/graph/src/nodes/report.test.ts`, add:

```ts
it('inclui métricas de qualidade no comentário final', async () => {
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
    pushed: true,
    testsPassed: true,
    review: 'Veredito: APROVADO',
    reviewRounds: 1,
    fixAttempts: 0,
    prUrl: 'https://github.com/acme/repo/pull/1',
    autoMerge: true,
  } as never);

  expect(comments[0]).toContain('**Qualidade:** critic `APROVADO`, validação passou, PR aberto');
  expect(comments[0]).toContain('**Auto-merge:** elegível');
});
```

- [ ] **Step 6: Run tests and commit**

Run:

```bash
rtk corepack pnpm vitest run packages/graph/src/qualityMetrics.test.ts packages/graph/src/nodes/report.test.ts
rtk corepack pnpm lint
```

Expected: PASS.

Commit:

```bash
rtk git add packages/graph/src/qualityMetrics.ts packages/graph/src/qualityMetrics.test.ts packages/graph/src/nodes/report.ts packages/graph/src/nodes/report.test.ts
rtk git commit -m "feat(graph): report role quality metrics"
```

---

### Task 6: Update Architecture Docs and Run Full Verification

**Files:**
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/runbooks/agent-skills.md` if Task 1 docs need final wording after implementation.

**Interfaces:**
- Consumes: role skills, role contract loader, role aliases, evals, and quality metrics from prior tasks.
- Produces: final documented behavior for operators.

- [ ] **Step 1: Update architecture role description**

In `docs/ARCHITECTURE.md`, update the opening status paragraph to mention:

```md
O catálogo expõe roles com contratos versionados em `agent-skills/software-*`,
aliases de modelo por role, evals determinísticos para planner/critic e métricas
de qualidade no report final.
```

- [ ] **Step 2: Update component table**

In the `Pipeline roles` row, replace the current status text with:

```md
✅ `coder-agent` compatível + `software-delivery-pipeline`, contratos `software-*`,
aliases por role, evals planner/critic e métricas no report
```

- [ ] **Step 3: Run full verification**

Run:

```bash
rtk corepack pnpm lint
rtk corepack pnpm --filter @agent-platform/orchestrator-api build
rtk corepack pnpm --filter @agent-platform/worker-code build
rtk corepack pnpm --filter @agent-platform/graph build
rtk corepack pnpm test
```

Expected: all commands PASS.

- [ ] **Step 4: Commit final docs**

Commit:

```bash
rtk git add docs/ARCHITECTURE.md docs/runbooks/agent-skills.md
rtk git commit -m "docs(agents): document role quality system"
```

- [ ] **Step 5: Push main**

Run:

```bash
rtk git push origin main
```

Expected: push succeeds to `main`.

---

## Self-Review

- Spec coverage: Task 1 covers contracts/skills and ECC policy; Task 2 covers model alias resolution; Task 3 wires planner/critic consumers; Task 4 covers evals; Task 5 covers metrics; Task 6 covers docs and full verification.
- Scope check: no task splits roles into separate workers or replaces LangGraph.
- Placeholder scan: no unfinished-marker language remains in implementation steps.
- Type consistency: `SoftwareRole`, `buildRoleSystemPrompt`, `modelAliasForRole`, `scorePlannerOutput`, `scoreCriticOutput`, `qualityMetricsForState`, and `formatQualityMetrics` are introduced before use.
