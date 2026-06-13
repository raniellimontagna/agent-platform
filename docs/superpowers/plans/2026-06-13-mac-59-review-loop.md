# MAC-59 — Loop de revisão pelo critic (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quando o critic reprova ou aponta ressalvas, realimentar o coder (revisão incremental) → re-revisar, com teto, antes de abrir o PR.

**Architecture:** Loop graph-level. `reviewing` decide rotear para um novo nó `revising` (cópia do coder em modo revisão, **fora** do `interruptBefore` que serve à aprovação) ou para `pr`. `revising` clona a branch de trabalho no runner e corrige em cima do código existente com o parecer do critic no prompt; volta para `reviewing`. Teto via env, com guarda de no-progress e corte por cost guard. Custos passam a acumular (reducers de soma) ao longo das voltas.

**Tech Stack:** TypeScript (ESM), LangGraph (`@langchain/langgraph`), Hono runner, vitest. Monorepo pnpm. Pacotes: `@agent-platform/graph` (orchestrator) e `apps/worker-code` (runner).

**Spec:** `docs/superpowers/specs/2026-06-13-mac-59-review-loop-design.md`

**Convenções do repo:** trabalha-se direto na `main` (commit + push a cada task). Use `rtk` nos comandos (CLAUDE.md). Imports ESM com sufixo `.js`. Testes vitest (`pnpm test` na raiz). Build monorepo: `pnpm -r build`.

---

## File Structure

- `packages/graph/src/nodes/review.ts` — **MODIFY**: função pura `decideAfterReview` + nó grava roteamento/feedback.
- `packages/graph/src/nodes/review.test.ts` — **CREATE**: testes de `decideAfterReview`.
- `packages/graph/src/state.ts` — **MODIFY**: reducers de soma p/ custo + campos novos do loop.
- `packages/graph/src/nodes/coder.ts` — **MODIFY**: `makeCoderNode` ganha modo revisão.
- `packages/graph/src/nodes/report.ts` — **MODIFY**: linha de voltas de revisão no resumo.
- `packages/graph/src/build.ts` — **MODIFY**: nó `revising` + arestas condicionais + deps novas.
- `apps/orchestrator-api/src/env.ts` — **MODIFY**: `AGENT_MAX_REVIEW_ROUNDS`.
- `apps/orchestrator-api/src/agent.ts` — **MODIFY**: passa as deps novas ao grafo.
- `apps/worker-code/src/types.ts` — **MODIFY**: `reviewFeedback` no `jobSchema`.
- `apps/worker-code/src/executor/worktree.ts` — **MODIFY**: clone da branch de trabalho (modo revisão).
- `apps/worker-code/src/executor/codegen.ts` — **MODIFY**: injeta o parecer no prompt (select + generate).
- `apps/worker-code/src/executor/runJob.ts` — **MODIFY**: detecta modo revisão e encadeia.

---

## Task 1: Função de decisão de roteamento (`decideAfterReview`)

**Files:**
- Modify: `packages/graph/src/nodes/review.ts`
- Test: `packages/graph/src/nodes/review.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/graph/src/nodes/review.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { decideAfterReview } from './review.js';

const opts = { maxReviewRounds: 1, maxCostPerRunUsd: 2 };
const base = { reviewRounds: 0, lastReview: '', totalCostUsd: 0 };

describe('decideAfterReview', () => {
  it('APROVADO seco → pr', () => {
    const r = decideAfterReview({ ...base, review: '**Veredito**: APROVADO' }, opts);
    expect(r).toBe('pr');
  });

  it('REPROVADO com rounds < teto → coding', () => {
    const r = decideAfterReview({ ...base, review: 'Veredito: REPROVADO' }, opts);
    expect(r).toBe('coding');
  });

  it('APROVADO COM RESSALVAS com rounds < teto → coding', () => {
    const r = decideAfterReview({ ...base, review: 'Veredito: APROVADO COM RESSALVAS' }, opts);
    expect(r).toBe('coding');
  });

  it('REPROVADO com rounds == teto → pr', () => {
    const r = decideAfterReview(
      { ...base, reviewRounds: 1, review: 'Veredito: REPROVADO' },
      opts,
    );
    expect(r).toBe('pr');
  });

  it('no-progress (parecer idêntico ao anterior) → pr', () => {
    const review = 'Veredito: REPROVADO\nmesmo problema';
    const r = decideAfterReview(
      { ...base, reviewRounds: 1, lastReview: review, review },
      { maxReviewRounds: 3, maxCostPerRunUsd: 2 },
    );
    expect(r).toBe('pr');
  });

  it('custo acumulado >= teto → pr', () => {
    const r = decideAfterReview(
      { ...base, review: 'Veredito: REPROVADO', totalCostUsd: 2 },
      opts,
    );
    expect(r).toBe('pr');
  });

  it('sem veredito parseável (—) → pr', () => {
    const r = decideAfterReview({ ...base, review: 'parecer sem rótulo' }, opts);
    expect(r).toBe('pr');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk vitest run packages/graph/src/nodes/review.test.ts`
Expected: FAIL — `decideAfterReview is not a function` / import error.

- [ ] **Step 3: Write minimal implementation**

In `packages/graph/src/nodes/review.ts`, adicione o import do `verdictOf` no topo (junto aos imports existentes) e a função + tipos exportados (antes de `makeReviewNode`):

```ts
import { verdictOf } from './report.js';

export interface ReviewDecisionOpts {
  maxReviewRounds: number;
  maxCostPerRunUsd: number;
}

export interface ReviewDecisionArgs {
  review: string;
  reviewRounds: number;
  lastReview: string;
  totalCostUsd: number;
}

/**
 * Decide o próximo passo após a revisão do critic (MAC-59). Volta pro coder
 * (`coding`) quando o veredito é acionável (REPROVADO ou COM RESSALVAS) e ainda
 * há orçamento de voltas/custo e houve progresso; senão segue pro PR.
 * Pura e testável — sem I/O.
 */
export function decideAfterReview(
  args: ReviewDecisionArgs,
  opts: ReviewDecisionOpts,
): 'coding' | 'pr' {
  const verdict = verdictOf(args.review);
  const actionable = /REPROVAD/i.test(verdict) || /RESSALVA/i.test(verdict);
  if (!actionable) return 'pr';
  if (args.reviewRounds >= opts.maxReviewRounds) return 'pr';
  if (args.totalCostUsd >= opts.maxCostPerRunUsd) return 'pr';
  // Guarda de no-progress: parecer da volta atual igual ao anterior → para.
  if (args.reviewRounds > 0 && args.review.trim() === args.lastReview.trim()) return 'pr';
  return 'coding';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `rtk vitest run packages/graph/src/nodes/review.test.ts`
Expected: PASS (7 testes).

- [ ] **Step 5: Commit**

```bash
rtk git add packages/graph/src/nodes/review.ts packages/graph/src/nodes/review.test.ts
rtk git commit -m "feat(graph): decideAfterReview — roteamento do loop de revisão (MAC-59)"
```

---

## Task 2: Estado — reducers de custo somam + campos do loop

**Files:**
- Modify: `packages/graph/src/state.ts`

- [ ] **Step 1: Trocar os campos de custo por reducers de soma**

Em `packages/graph/src/state.ts`, substitua as três linhas de custo atuais:

```ts
  /** Custo estimado por fase em USD (MAC-40). */
  planCostUsd: Annotation<number>(),
  codeCostUsd: Annotation<number>(),
  reviewCostUsd: Annotation<number>(),
```

por (planCostUsd continua replace — planner roda 1x; code/review acumulam ao longo do loop MAC-59):

```ts
  /** Custo estimado por fase em USD (MAC-40). */
  planCostUsd: Annotation<number>(),
  // MAC-59: o loop roda coder/review várias vezes — custo acumula (não substitui).
  codeCostUsd: Annotation<number>({
    reducer: (a, b) => (a ?? 0) + (b ?? 0),
    default: () => 0,
  }),
  reviewCostUsd: Annotation<number>({
    reducer: (a, b) => (a ?? 0) + (b ?? 0),
    default: () => 0,
  }),
```

- [ ] **Step 2: Adicionar os campos novos do loop**

Logo após o campo `error` (último do objeto), antes do `});`, adicione:

```ts
  /** MAC-59: voltas de revisão já executadas (reducer soma; 0 = sem loop). */
  reviewRounds: Annotation<number>({
    reducer: (a, b) => (a ?? 0) + (b ?? 0),
    default: () => 0,
  }),
  /** MAC-59: veredito da volta anterior (guarda de no-progress). */
  lastVerdict: Annotation<string>(),
  /** MAC-59: parecer da volta anterior (comparação do guarda de no-progress). */
  lastReview: Annotation<string>(),
  /** MAC-59: parecer do critic injetado no próximo job de revisão. */
  reviewFeedback: Annotation<string>(),
  /** MAC-59: destino escolhido pelo nó reviewing ('coding' | 'pr'). */
  nextAfterReview: Annotation<string>(),
```

- [ ] **Step 3: Verify build**

Run: `rtk pnpm --filter @agent-platform/graph build`
Expected: build OK, sem erros de tipo.

- [ ] **Step 4: Commit**

```bash
rtk git add packages/graph/src/state.ts
rtk git commit -m "feat(graph): custo acumula + estado do loop de revisão (MAC-59)"
```

---

## Task 3: Nó `reviewing` usa a decisão e grava roteamento/feedback

**Files:**
- Modify: `packages/graph/src/nodes/review.ts`

- [ ] **Step 1: Estender `ReviewDeps` com os tetos**

Substitua a interface `ReviewDeps` por:

```ts
export interface ReviewDeps {
  llm: LlmClient;
  linear: LinearGateway;
  /** Teto de voltas de revisão (MAC-59). */
  maxReviewRounds: number;
  /** Teto de custo por run em USD — corta o loop (MAC-40/59). */
  maxCostPerRunUsd: number;
}
```

- [ ] **Step 2: Early-return sem diff vai pro PR**

No corpo do nó, troque o early-return de "sem diff":

```ts
    // Sem diff (nada gerado) não há o que revisar — segue para o PR.
    if (!state.diff?.trim()) {
      return { status: 'coding' };
    }
```

por:

```ts
    // Sem diff (nada gerado) não há o que revisar — segue para o PR.
    if (!state.diff?.trim()) {
      return { status: 'coding', nextAfterReview: 'pr' };
    }
```

- [ ] **Step 3: Decidir o roteamento no sucesso**

Substitua o bloco de sucesso (o `await deps.linear.comment(...)` do parecer + o `return { review, status: 'coding', reviewCostUsd: ... }`) por:

```ts
      const reviewCostUsd = estimateCostUsd('critic', usage);
      const totalCostUsd =
        (state.planCostUsd ?? 0) +
        (state.codeCostUsd ?? 0) +
        (state.reviewCostUsd ?? 0) +
        reviewCostUsd;

      const next = decideAfterReview(
        {
          review,
          reviewRounds: state.reviewRounds ?? 0,
          lastReview: state.lastReview ?? '',
          totalCostUsd,
        },
        { maxReviewRounds: deps.maxReviewRounds, maxCostPerRunUsd: deps.maxCostPerRunUsd },
      );

      const roundNote =
        next === 'coding'
          ? `\n\n_O agente vai tentar endereçar o parecer (revisão ${(state.reviewRounds ?? 0) + 1})._`
          : '';
      await deps.linear.comment(
        state.issueId,
        `## 🔎 Revisão do agente (critic)\n\n${review}${roundNote}`,
      );

      return {
        review,
        status: 'coding',
        reviewCostUsd,
        lastReview: review,
        lastVerdict: verdictOf(review),
        nextAfterReview: next,
        // Reducer soma: +1 só quando vai revisar; feedback alimenta o próximo job.
        reviewRounds: next === 'coding' ? 1 : 0,
        reviewFeedback: next === 'coding' ? review : '',
      };
```

- [ ] **Step 4: Catch vai pro PR**

No bloco `catch`, troque `return { status: 'coding' };` por:

```ts
      return { status: 'coding', nextAfterReview: 'pr' };
```

- [ ] **Step 5: Verify build + tests**

Run: `rtk pnpm --filter @agent-platform/graph build && rtk vitest run packages/graph`
Expected: build OK; testes do graph passam (incluindo review.test.ts da Task 1).

- [ ] **Step 6: Commit**

```bash
rtk git add packages/graph/src/nodes/review.ts
rtk git commit -m "feat(graph): nó reviewing decide loop e grava feedback (MAC-59)"
```

---

## Task 4: Coder em modo revisão

**Files:**
- Modify: `packages/graph/src/nodes/coder.ts`

- [ ] **Step 1: `makeCoderNode` aceita o modo revisão**

Troque a assinatura:

```ts
export function makeCoderNode(deps: CoderDeps) {
  return async (state: AgentStateType): Promise<Partial<AgentStateType>> => {
```

por:

```ts
export function makeCoderNode(deps: CoderDeps, opts: { revise?: boolean } = {}) {
  return async (state: AgentStateType): Promise<Partial<AgentStateType>> => {
```

- [ ] **Step 2: Reusar a branch e mandar o parecer no modo revisão**

Troque o cálculo da branch:

```ts
    const shortRun = state.runId.slice(0, 8);
    const branch = `agent/${state.issueIdentifier.toLowerCase()}-${slugify(state.title)}-${shortRun}`;
```

por (no modo revisão a branch já existe no estado):

```ts
    const shortRun = state.runId.slice(0, 8);
    const branch = opts.revise
      ? state.branch
      : `agent/${state.issueIdentifier.toLowerCase()}-${slugify(state.title)}-${shortRun}`;
```

No corpo do `fetch` ao runner, adicione `reviewFeedback` ao JSON do body (logo após `lessons,`):

```ts
          lessons,
          reviewFeedback: opts.revise ? (state.reviewFeedback ?? '') : '',
```

- [ ] **Step 3: Sufixo "(revisão N)" no comentário**

Troque o cabeçalho do comentário de execução:

```ts
        `## 🤖 Execução\nBranch \`${branch}\` — runner: **${result.status}**.` +
```

por:

```ts
        `## 🤖 Execução${opts.revise ? ` (revisão ${state.reviewRounds ?? 1})` : ''}\nBranch \`${branch}\` — runner: **${result.status}**.` +
```

- [ ] **Step 4: Verify build**

Run: `rtk pnpm --filter @agent-platform/graph build`
Expected: build OK.

- [ ] **Step 5: Commit**

```bash
rtk git add packages/graph/src/nodes/coder.ts
rtk git commit -m "feat(graph): coder em modo revisão (reusa branch + parecer) (MAC-59)"
```

---

## Task 5: Topologia do grafo — nó `revising` + arestas condicionais

**Files:**
- Modify: `packages/graph/src/build.ts`

- [ ] **Step 1: Deps novas em `GraphDeps`**

Em `GraphDeps`, adicione (após `loadLessons?`):

```ts
  /** Teto de voltas de revisão pelo critic (MAC-59). Default 1. */
  maxReviewRounds?: number;
  /** Teto de custo por run em USD — corta o loop de revisão (MAC-40/59). Default 2. */
  maxCostPerRunUsd?: number;
```

- [ ] **Step 2: Criar o nó `revising` e passar tetos ao review**

Troque a criação dos nós `coding` e `review`:

```ts
  const coding = makeCoderNode({
    linear: deps.linear,
    runner: deps.runner,
    testCommands: deps.testCommands ?? [],
    loadLessons: deps.loadLessons,
  });
  const review = makeReviewNode({ llm: deps.llm, linear: deps.linear });
```

por:

```ts
  const coderDeps = {
    linear: deps.linear,
    runner: deps.runner,
    testCommands: deps.testCommands ?? [],
    loadLessons: deps.loadLessons,
  };
  const coding = makeCoderNode(coderDeps);
  const revising = makeCoderNode(coderDeps, { revise: true });
  const review = makeReviewNode({
    llm: deps.llm,
    linear: deps.linear,
    maxReviewRounds: deps.maxReviewRounds ?? 1,
    maxCostPerRunUsd: deps.maxCostPerRunUsd ?? 2,
  });
```

- [ ] **Step 3: Reescrever o grafo (nó + arestas)**

Troque o bloco `return new StateGraph(AgentState)...compile(...)` por:

```ts
  return new StateGraph(AgentState)
    .addNode('planning', planning)
    .addNode('coding', coding)
    .addNode('revising', revising)
    .addNode('reviewing', review)
    .addNode('pr', pr)
    .addNode('report', report)
    .addEdge(START, 'planning')
    .addEdge('planning', 'coding')
    .addConditionalEdges(
      'coding',
      (state) => (state.status === 'failed' ? 'report' : 'reviewing'),
      { reviewing: 'reviewing', report: 'report' },
    )
    // MAC-59: o critic decide revisar (volta pro coder em modo revisão) ou seguir.
    .addConditionalEdges(
      'reviewing',
      (state) => (state.nextAfterReview === 'coding' ? 'revising' : 'pr'),
      { revising: 'revising', pr: 'pr' },
    )
    // O nó de revisão (fora do interruptBefore) re-revisa; falha vai pro report.
    .addConditionalEdges(
      'revising',
      (state) => (state.status === 'failed' ? 'report' : 'reviewing'),
      { reviewing: 'reviewing', report: 'report' },
    )
    .addEdge('pr', 'report')
    .addEdge('report', END)
    .compile({ checkpointer, interruptBefore: ['coding'] });
```

(Note: `interruptBefore` continua só `['coding']` — `revising` NÃO interrompe, evitando re-pedir aprovação no loop.)

- [ ] **Step 4: Atualizar o comentário de topologia do `buildAgentGraph`**

Troque a linha do diagrama no JSDoc:

```
 *   START → planning → [⏸ aprovação humana] → coding → reviewing → pr → report → END
```

por:

```
 *   START → planning → [⏸ aprovação] → coding → reviewing → [revisar? → revising → reviewing] → pr → report → END
```

- [ ] **Step 5: Verify build**

Run: `rtk pnpm --filter @agent-platform/graph build`
Expected: build OK (tipos do StateGraph aceitam os nós/arestas novos).

- [ ] **Step 6: Commit**

```bash
rtk git add packages/graph/src/build.ts
rtk git commit -m "feat(graph): nó revising + arestas do loop de revisão (MAC-59)"
```

---

## Task 6: Env + wiring no orchestrator

**Files:**
- Modify: `apps/orchestrator-api/src/env.ts`
- Modify: `apps/orchestrator-api/src/agent.ts`

- [ ] **Step 1: Nova env `AGENT_MAX_REVIEW_ROUNDS`**

Em `apps/orchestrator-api/src/env.ts`, após `AGENT_MAX_COST_PER_DAY_USD`, adicione:

```ts
  // Loop de revisão pelo critic (MAC-59): máximo de voltas de re-revisão.
  AGENT_MAX_REVIEW_ROUNDS: z.coerce.number().default(1),
```

- [ ] **Step 2: Passar deps novas ao grafo**

Em `apps/orchestrator-api/src/agent.ts`, no objeto passado a `buildAgentGraph`, adicione (após `loadLessons,`):

```ts
      maxReviewRounds: env.AGENT_MAX_REVIEW_ROUNDS,
      maxCostPerRunUsd: env.AGENT_MAX_COST_PER_RUN_USD,
```

- [ ] **Step 3: Verify build**

Run: `rtk pnpm --filter @agent-platform/orchestrator-api build`
Expected: build OK.

- [ ] **Step 4: Commit**

```bash
rtk git add apps/orchestrator-api/src/env.ts apps/orchestrator-api/src/agent.ts
rtk git commit -m "feat(api): env AGENT_MAX_REVIEW_ROUNDS + wiring do loop (MAC-59)"
```

---

## Task 7: Report menciona as voltas de revisão

**Files:**
- Modify: `packages/graph/src/nodes/report.ts`

- [ ] **Step 1: Linha de voltas no resumo**

No `makeReportNode`, dentro do bloco `if (state.pushed) {`, logo após a linha de `Auto-correção`, adicione:

```ts
      if (state.reviewRounds && state.reviewRounds > 0) {
        lines.push(`**Revisões (loop critic):** ${state.reviewRounds} volta(s)`);
      }
```

- [ ] **Step 2: Verify build + tests**

Run: `rtk pnpm --filter @agent-platform/graph build && rtk vitest run packages/graph`
Expected: build OK; testes do graph passam.

- [ ] **Step 3: Commit**

```bash
rtk git add packages/graph/src/nodes/report.ts
rtk git commit -m "feat(graph): report mostra voltas do loop de revisão (MAC-59)"
```

---

## Task 8: Runner — modo revisão (schema, worktree, codegen)

**Files:**
- Modify: `apps/worker-code/src/types.ts`
- Modify: `apps/worker-code/src/executor/worktree.ts`
- Modify: `apps/worker-code/src/executor/codegen.ts`
- Modify: `apps/worker-code/src/executor/runJob.ts`

- [ ] **Step 1: `reviewFeedback` no `jobSchema`**

Em `apps/worker-code/src/types.ts`, dentro do `jobSchema`, após o campo `lessons`, adicione:

```ts
  /** Parecer do critic a endereçar — ativa o modo revisão (MAC-59). */
  reviewFeedback: z.string().default(''),
```

- [ ] **Step 2: `prepareWorktree` clona a branch de trabalho no modo revisão**

Em `apps/worker-code/src/executor/worktree.ts`, troque a assinatura/corpo de `prepareWorktree`:

```ts
export async function prepareWorktree(args: {
  runId: string;
  repoUrl: string;
  baseBranch: string;
  branch: string;
}): Promise<string> {
  const dir = worktreePath(args.runId);
  // Garante diretório limpo antes de clonar.
  await rm(dir, { recursive: true, force: true });

  const clone = await runCommand(
    `git clone --depth 1 --branch ${args.baseBranch} ${args.repoUrl} ${dir}`,
    env.RUNNER_WORKDIR,
  );
  if (clone.exitCode !== 0) {
    throw new Error(`git clone failed: ${clone.stderr || clone.stdout}`);
  }

  const checkout = await runCommand(`git checkout -b ${args.branch}`, dir);
  if (checkout.exitCode !== 0) {
    throw new Error(`git checkout failed: ${checkout.stderr || checkout.stdout}`);
  }

  return dir;
}
```

por:

```ts
export async function prepareWorktree(args: {
  runId: string;
  repoUrl: string;
  baseBranch: string;
  branch: string;
  /** MAC-59: parte da branch de trabalho já existente (revisão incremental). */
  revise?: boolean;
}): Promise<string> {
  const dir = worktreePath(args.runId);
  // Garante diretório limpo antes de clonar.
  await rm(dir, { recursive: true, force: true });

  // Clona a base (main) — mantém o ref local `main` p/ calcular o diff do PR.
  const clone = await runCommand(
    `git clone --depth 1 --branch ${args.baseBranch} ${args.repoUrl} ${dir}`,
    env.RUNNER_WORKDIR,
  );
  if (clone.exitCode !== 0) {
    throw new Error(`git clone failed: ${clone.stderr || clone.stdout}`);
  }

  if (args.revise) {
    // Modo revisão: traz a branch de trabalho (já tem o código da passada
    // anterior) e faz checkout nela. Diff continua vs base (main ref local).
    const fetched = await runCommand(`git fetch --depth 1 origin ${args.branch}`, dir);
    if (fetched.exitCode !== 0) {
      throw new Error(`git fetch failed: ${fetched.stderr || fetched.stdout}`);
    }
    const checkout = await runCommand(`git checkout -b ${args.branch} FETCH_HEAD`, dir);
    if (checkout.exitCode !== 0) {
      throw new Error(`git checkout failed: ${checkout.stderr || checkout.stdout}`);
    }
  } else {
    const checkout = await runCommand(`git checkout -b ${args.branch}`, dir);
    if (checkout.exitCode !== 0) {
      throw new Error(`git checkout failed: ${checkout.stderr || checkout.stdout}`);
    }
  }

  return dir;
}
```

- [ ] **Step 3: `codegen` injeta o parecer (select + generate)**

Em `apps/worker-code/src/executor/codegen.ts`:

(a) Adicione `reviewFeedback` ao `CodegenArgs`:

```ts
export interface CodegenArgs {
  llm: LlmClient;
  dir: string;
  title: string;
  description: string;
  plan: string;
  /** Lições de runs anteriores do repo, já formatadas (MAC-23). */
  lessons?: string;
  /** Parecer do critic a endereçar na revisão incremental (MAC-59). */
  reviewFeedback?: string;
  log: Logger;
}
```

(b) Estenda `selectFiles` para receber o parecer no `ctx`:

```ts
async function selectFiles(
  llm: LlmClient,
  ctx: {
    title: string;
    description: string;
    plan: string;
    fileTree: string;
    conventions: string;
    reviewFeedback?: string;
  },
  log: Logger,
  onUsage?: (usage: TokenUsage) => void,
): Promise<{ edit: string[]; create: string[] }> {
  return completeJson(
    llm,
    {
      temperature: 0,
      onUsage,
      messages: [
        { role: 'system', content: SELECT_PROMPT },
        {
          role: 'user',
          content: [
            `# Issue: ${ctx.title}`,
            ctx.description ? `\n${ctx.description}` : '',
            `\n# Plano aprovado\n${ctx.plan}`,
            ctx.reviewFeedback
              ? `\n# Parecer da revisão a endereçar (foque nestes pontos)\n${ctx.reviewFeedback}`
              : '',
            ctx.conventions ? `\n# Convenções do projeto\n${ctx.conventions}` : '',
            `\n# Arquivos do repositório\n${ctx.fileTree}`,
          ].join('\n'),
        },
      ],
    },
    selectSchema,
    log,
  );
}
```

(c) Em `generateAndApplyCode`, desestruture `reviewFeedback` e passe-o ao `selectFiles` e ao prompt de geração:

Troque:

```ts
  const { llm, dir, title, description, plan, lessons, log } = args;
```

por:

```ts
  const { llm, dir, title, description, plan, lessons, reviewFeedback, log } = args;
```

Troque a chamada de `selectFiles`:

```ts
  const selection = await selectFiles(
    llm,
    { title, description, plan, fileTree, conventions },
    log,
    addUsage,
  );
```

por:

```ts
  const selection = await selectFiles(
    llm,
    { title, description, plan, fileTree, conventions, reviewFeedback },
    log,
    addUsage,
  );
```

No array de `content` do prompt de geração (`completeJson` com `GENERATE_PROMPT`), adicione o bloco do parecer logo após a linha de `lessons`:

```ts
            lessons ? `\n# Lições de runs anteriores (evite repetir estes erros)\n${lessons}` : '',
            reviewFeedback
              ? `\n# Parecer da revisão a endereçar (corrija estes pontos, preservando o resto)\n${reviewFeedback}`
              : '',
```

- [ ] **Step 4: `runJob` detecta o modo revisão**

Em `apps/worker-code/src/executor/runJob.ts`:

(a) Logo no início do `try` (antes de `log.info('preparing worktree')`), adicione:

```ts
    const reviseMode = Boolean(job.reviewFeedback?.trim());
    if (reviseMode) log.info('modo revisão (MAC-59): partindo da branch de trabalho');
```

(b) Passe `revise` ao `prepareWorktree`:

```ts
    const dir = await prepareWorktree({
      runId: job.runId,
      repoUrl: job.repoUrl,
      baseBranch: job.baseBranch,
      branch: job.branch,
      revise: reviseMode,
    });
```

(c) Passe `reviewFeedback` ao `generateAndApplyCode`:

```ts
      const gen = await generateAndApplyCode({
        llm,
        dir,
        title: job.title,
        description: job.description,
        plan: job.plan,
        lessons: job.lessons,
        reviewFeedback: job.reviewFeedback,
        log,
      });
```

- [ ] **Step 5: Verify build + tests**

Run: `rtk pnpm --filter @agent-platform/worker-code build && rtk vitest run apps/worker-code`
Expected: build OK; testes do worker-code passam (codegen/runJob/commandPolicy).

- [ ] **Step 6: Commit**

```bash
rtk git add apps/worker-code/src/types.ts apps/worker-code/src/executor/worktree.ts apps/worker-code/src/executor/codegen.ts apps/worker-code/src/executor/runJob.ts
rtk git commit -m "feat(worker-code): modo revisão — clona branch + injeta parecer (MAC-59)"
```

---

## Task 9: Build + testes do monorepo + push

**Files:** nenhum (verificação final).

- [ ] **Step 1: Build completo**

Run: `rtk pnpm -r build`
Expected: todos os pacotes buildam sem erro.

- [ ] **Step 2: Suite completa**

Run: `rtk pnpm test`
Expected: PASS — todos os testes (os ~61 atuais + 7 novos de `decideAfterReview` = ~68). Nenhuma regressão.

- [ ] **Step 3: Push**

```bash
rtk git push
```

- [ ] **Step 4: Nota de deploy/E2E (não automatizável aqui)**

Registrar (memory + Linear) que falta:
- **Redeploy**: orchestrator (env `AGENT_MAX_REVIEW_ROUNDS` + grafo novo) **e** runners (modo revisão no worker-code). Usar `deploy.sh` com `build --no-cache` (gotcha conhecido do cache Docker).
- **E2E**: disparar uma issue cujo diff o critic provavelmente reprove/ressalve → conferir no Linear o comentário `🔎 Revisão` com a nota de revisão, o `🤖 Execução (revisão 1)`, e o `report` final com `Revisões (loop critic): N volta(s)`. Confirmar que o PR só abre ao fim do loop e que o cost guard/no-progress cortam quando esperado.

---

## Self-Review (preenchido)

**Cobertura do spec:**
- Topologia `reviewing → coding|pr` → Task 5 (nó `revising` + arestas). ✅
- Gatilho ≠ APROVADO seco → Task 1 (`decideAfterReview`). ✅
- Teto `AGENT_MAX_REVIEW_ROUNDS` (default 1) → Task 6 (env) + Task 1/3 (uso). ✅
- Guarda de no-progress → Task 1 (compara `review` vs `lastReview`). ✅
- Corte por cost guard → Task 1 (`totalCostUsd >= maxCostPerRunUsd`) + Task 3 (cálculo). ✅
- Estratégia incremental (clona branch de trabalho) → Task 8 (worktree revise + codegen feedback). ✅
- Fix dos reducers de custo → Task 2. ✅
- `interruptBefore` só em `coding` (loop não re-interrompe) → Task 5 (nó `revising` separado). ✅
- Observabilidade (sufixo revisão + report) → Task 3/4/7. ✅
- review_rounds Grafana = follow-up (fora do escopo) → não há task, conforme decidido. ✅

**Placeholders:** nenhum — todo passo tem código/comando concreto.

**Consistência de tipos:** `decideAfterReview(args, opts)` definido na Task 1 e usado na Task 3 com os mesmos campos (`review`, `reviewRounds`, `lastReview`, `totalCostUsd`) / (`maxReviewRounds`, `maxCostPerRunUsd`). `makeCoderNode(deps, opts)` definido na Task 4 e usado na Task 5. `reviewFeedback` no schema (Task 8.1) → coder body (Task 4.2) → runJob (Task 8.4) → codegen (Task 8.3). `nextAfterReview`/`reviewRounds`/`lastReview`/`reviewFeedback` definidos na Task 2 e lidos/escritos nas Tasks 3/4/5/7.
