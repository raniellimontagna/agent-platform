# Auto-merge (opt-in) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quando um run termina verde+aprovado E a issue tem a label `auto-merge`, o agente faz squash-merge na main, deleta a branch, comenta e move a issue pra Done — fechando o último passo manual do MVP, de forma opt-in e non-fatal.

**Architecture:** Gate puro `shouldAutoMerge(state)` (label opt-in + `testsPassed` + critic `APROVADO` seco). Novo nó `merging` entre `pr` e `report` que executa o merge quando o gate passa (no-op senão). Label detectada no webhook → `runs.auto_merge` → state. Gateways ganham `mergePullRequest`/`deleteBranch` (github) e `setIssueState` (linear). Tudo non-fatal: falha de merge deixa o PR aberto pra merge manual.

**Tech Stack:** TypeScript, LangGraph, Drizzle (Postgres), Hono, GitHub REST, Linear SDK, Vitest.

---

## File Structure

**Modificar:**
- `apps/orchestrator-api/src/db/schema.ts` — coluna `runs.auto_merge`.
- `apps/orchestrator-api/src/runs.ts` — `NewRunInput.autoMerge` + insert.
- `apps/orchestrator-api/src/routes/webhooks.ts` — detecta label `auto-merge` → createRun.
- `apps/orchestrator-api/src/env.ts` — `LINEAR_AUTO_MERGE_LABEL_ID`, `LINEAR_DONE_STATE_ID`.
- `apps/orchestrator-api/.env.example` + `infra/compose/orchestrator/docker-compose.yml` — envs novas.
- `apps/orchestrator-api/src/worker.ts` — injeta `autoMerge` no state inicial do grafo.
- `apps/orchestrator-api/src/agent.ts` — passa `doneStateId` nas deps do grafo.
- `packages/graph/src/state.ts` — campos `autoMerge`/`prNumber`.
- `packages/graph/src/nodes/report.ts` — `shouldAutoMerge` (junto de `verdictOf`).
- `packages/graph/src/nodes/pr.ts` — non-draft quando gate + retorna `prNumber`.
- `packages/graph/src/build.ts` — registra nó `merging`, topologia `pr→merging→report`, `doneStateId` em `GraphDeps`.
- `packages/graph/src/index.ts` — exporta `shouldAutoMerge`.
- `packages/github/src/index.ts` — `mergePullRequest`/`deleteBranch`.
- `packages/linear/src/index.ts` — `setIssueState`.

**Criar:**
- `packages/graph/src/nodes/merging.ts` — nó de merge.
- `packages/graph/src/nodes/merging.test.ts` — testes do nó.
- `packages/graph/src/nodes/autoMerge.test.ts` — testes de `shouldAutoMerge`.
- `packages/github/src/index.test.ts` — testes de `mergePullRequest`/`deleteBranch` (se não houver, criar).
- `apps/orchestrator-api/drizzle/0010_*.sql` — gerado.

---

## Task 1: Schema + run.auto_merge

**Files:** `apps/orchestrator-api/src/db/schema.ts`, `apps/orchestrator-api/src/runs.ts`, `apps/orchestrator-api/drizzle/0010_*.sql`

- [ ] **Step 1: Coluna `auto_merge` em `runs`**

Em `schema.ts`, na tabela `runs` (junto de `autoApprove`):
```ts
  autoMerge: boolean('auto_merge').notNull().default(false),
```

- [ ] **Step 2: Gerar migration**

Run: `rtk pnpm --filter @agent-platform/orchestrator-api db:generate`
Expected: `0010_*.sql` com `ALTER TABLE "runs" ADD COLUMN "auto_merge" boolean DEFAULT false NOT NULL`. Sem outras mudanças.

- [ ] **Step 3: `NewRunInput.autoMerge` + insert**

Em `runs.ts`, na interface `NewRunInput`, adicionar:
```ts
  /** Issue marcada com a label auto-merge (opt-in de merge automático). */
  autoMerge?: boolean;
```
No `createRun`, no objeto `.values({...})`, adicionar:
```ts
      ...(input.autoMerge !== undefined ? { autoMerge: input.autoMerge } : {}),
```

- [ ] **Step 4: Build**

Run: `rtk pnpm --filter @agent-platform/orchestrator-api build`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
rtk git add apps/orchestrator-api/src/db/schema.ts apps/orchestrator-api/src/runs.ts apps/orchestrator-api/drizzle/
rtk git commit -m "feat(auto-merge): coluna runs.auto_merge + NewRunInput (MAC-67)"
```

---

## Task 2: `shouldAutoMerge` + state (TDD)

**Files:** `packages/graph/src/state.ts`, `packages/graph/src/nodes/report.ts`, `packages/graph/src/index.ts`, `packages/graph/src/nodes/autoMerge.test.ts`

- [ ] **Step 1: Campos no state**

Em `packages/graph/src/state.ts`, no `Annotation.Root({...})`, adicionar:
```ts
  /** Issue marcada com auto-merge (opt-in). Vem do run (MAC-67). */
  autoMerge: Annotation<boolean>(),
  /** Número do PR aberto (pro auto-merge). MAC-67. */
  prNumber: Annotation<number>(),
```

- [ ] **Step 2: Teste que falha** — criar `packages/graph/src/nodes/autoMerge.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { shouldAutoMerge } from './report.js';

const base = { autoMerge: true, testsPassed: true, review: 'Veredito: APROVADO\nok' };

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
  it('false com REPROVADO', () => {
    expect(shouldAutoMerge({ ...base, review: 'Veredito: REPROVADO' })).toBe(false);
  });
  it('false se validação não passou', () => {
    expect(shouldAutoMerge({ ...base, testsPassed: false })).toBe(false);
    expect(shouldAutoMerge({ ...base, testsPassed: undefined })).toBe(false);
  });
});
```

- [ ] **Step 3: Rodar pra ver falhar** — `rtk pnpm exec vitest run packages/graph/src/nodes/autoMerge.test.ts` → FAIL (`shouldAutoMerge` não existe).

- [ ] **Step 4: Implementar em `report.ts`** (junto de `verdictOf`):
```ts
/**
 * Gate do auto-merge (MAC-67): opt-in (label → run.auto_merge) + validação ✅ +
 * critic APROVADO seco. `verdictOf` devolve o texto do veredito, então `===
 * 'APROVADO'` exclui "APROVADO COM RESSALVAS"/"REPROVADO" automaticamente.
 */
export function shouldAutoMerge(state: {
  autoMerge?: boolean;
  testsPassed?: boolean;
  review?: string;
}): boolean {
  return (
    state.autoMerge === true &&
    state.testsPassed === true &&
    verdictOf(state.review) === 'APROVADO'
  );
}
```

- [ ] **Step 5: Exportar** — em `packages/graph/src/index.ts`, adicionar à linha de export do report:
```ts
export { verdictOf, shouldAutoMerge } from './nodes/report.js';
```
(Ajustar à forma real do export existente de `verdictOf`.)

- [ ] **Step 6: Rodar pra ver passar** — `rtk pnpm exec vitest run packages/graph/src/nodes/autoMerge.test.ts` → PASS (6). Build: `rtk pnpm --filter @agent-platform/graph build` → PASS.

- [ ] **Step 7: Commit**
```bash
rtk git add packages/graph/src/state.ts packages/graph/src/nodes/report.ts packages/graph/src/index.ts packages/graph/src/nodes/autoMerge.test.ts
rtk git commit -m "feat(auto-merge): gate shouldAutoMerge + state autoMerge/prNumber (MAC-67)"
```

---

## Task 3: GitHub gateway — merge + deleteBranch (TDD)

**Files:** `packages/github/src/index.ts`, `packages/github/src/index.test.ts`

- [ ] **Step 1: Teste que falha** — criar `packages/github/src/index.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGithubGateway } from './index.js';

const gw = () => createGithubGateway('tkn', { owner: 'o', repo: 'r' });

afterEach(() => vi.unstubAllGlobals());

function stubFetch(status: number, body = '') {
  const f = vi.fn(async () => ({ ok: status >= 200 && status < 300, status, text: async () => body }));
  vi.stubGlobal('fetch', f);
  return f;
}

describe('mergePullRequest', () => {
  it('PUT /pulls/:n/merge com merge_method squash', async () => {
    const f = stubFetch(200, '{}');
    await gw().mergePullRequest({ number: 12 });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('https://api.github.com/repos/o/r/pulls/12/merge');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body)).toEqual({ merge_method: 'squash' });
  });
  it('lança em status não-ok', async () => {
    stubFetch(405, 'not mergeable');
    await expect(gw().mergePullRequest({ number: 1 })).rejects.toThrow(/405/);
  });
});

describe('deleteBranch', () => {
  it('DELETE /git/refs/heads/:branch', async () => {
    const f = stubFetch(204);
    await gw().deleteBranch('agent/x');
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('https://api.github.com/repos/o/r/git/refs/heads/agent%2Fx');
    expect(init.method).toBe('DELETE');
  });
  it('tolera 404/422 (branch já ausente)', async () => {
    stubFetch(404);
    await expect(gw().deleteBranch('agent/x')).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Rodar pra ver falhar** — `rtk pnpm exec vitest run packages/github/src/index.test.ts` → FAIL.

- [ ] **Step 3: Implementar** — em `packages/github/src/index.ts`, na interface `GithubGateway`:
```ts
  mergePullRequest(args: { number: number; method?: 'merge' | 'squash' | 'rebase' }): Promise<void>;
  deleteBranch(branch: string): Promise<void>;
```
No objeto retornado por `createGithubGateway` (depois de `createPullRequest`):
```ts
    async mergePullRequest({ number, method = 'squash' }) {
      const res = await fetch(`${apiBase}/pulls/${number}/merge`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ merge_method: method }),
      });
      if (!res.ok) throw new Error(`GitHub merge respondeu ${res.status}: ${await res.text()}`);
    },
    async deleteBranch(branch) {
      const res = await fetch(`${apiBase}/git/refs/heads/${encodeURIComponent(branch)}`, {
        method: 'DELETE',
        headers,
      });
      // 404/422 = ref já removida → tolerar.
      if (!res.ok && res.status !== 404 && res.status !== 422) {
        throw new Error(`GitHub deleteBranch respondeu ${res.status}: ${await res.text()}`);
      }
    },
```

- [ ] **Step 4: Rodar pra ver passar** — `rtk pnpm exec vitest run packages/github/src/index.test.ts` → PASS. Build: `rtk pnpm --filter @agent-platform/github build` → PASS.

- [ ] **Step 5: Commit**
```bash
rtk git add packages/github/src/index.ts packages/github/src/index.test.ts
rtk git commit -m "feat(auto-merge): github gateway mergePullRequest + deleteBranch (MAC-67)"
```

---

## Task 4: Linear gateway — setIssueState + env

**Files:** `packages/linear/src/index.ts`, `apps/orchestrator-api/src/env.ts`

- [ ] **Step 1: `setIssueState` no gateway** — em `packages/linear/src/index.ts`, na interface `LinearGateway`:
```ts
  setIssueState(issueId: string, stateId: string): Promise<void>;
```
No objeto retornado por `createLinearGateway` (depois de `comment`):
```ts
    async setIssueState(issueId, stateId) {
      await client.updateIssue(issueId, { stateId });
    },
```

- [ ] **Step 2: Envs novas** — em `apps/orchestrator-api/src/env.ts`, no `envSchema` (perto das outras `LINEAR_*`):
```ts
  // Auto-merge (MAC-67): label de opt-in + estado "Done" do time p/ fechar a issue.
  LINEAR_AUTO_MERGE_LABEL_ID: z.string().optional(),
  LINEAR_DONE_STATE_ID: z.string().default('79e3b949-6f1f-469d-902d-71d135d18cae'),
```

- [ ] **Step 3: Build**

Run: `rtk pnpm --filter @agent-platform/linear build && rtk pnpm --filter @agent-platform/orchestrator-api build`
Expected: PASS. (`client.updateIssue(id, { stateId })` é API do `@linear/sdk`; se o tipo reclamar, conferir a assinatura na versão instalada e ajustar — é um passthrough fino.)

- [ ] **Step 4: Commit**
```bash
rtk git add packages/linear/src/index.ts apps/orchestrator-api/src/env.ts
rtk git commit -m "feat(auto-merge): linear setIssueState + envs (label/done) (MAC-67)"
```

---

## Task 5: Nó `pr` — non-draft quando gate + prNumber

**Files:** `packages/graph/src/nodes/pr.ts`

- [ ] **Step 1: Importar o gate** — no topo de `pr.ts`:
```ts
import { shouldAutoMerge } from './report.js';
```

- [ ] **Step 2: PR non-draft quando o gate passa + retornar prNumber**

No `makePrNode`, antes do `createPullRequest`, decidir o draft:
```ts
      const autoMerge = shouldAutoMerge(state);
```
Trocar a chamada `createPullRequest({ head, base, title, body })` por:
```ts
      const pr = await deps.github.createPullRequest({
        head: state.branch,
        base: deps.baseBranch,
        title,
        body,
        draft: !autoMerge, // gate ok → PR pronto p/ merge; senão Draft (manual)
      });
```
E trocar o retorno de sucesso `return { prUrl: pr.url, status: 'completed' }` por:
```ts
      return { prUrl: pr.url, prNumber: pr.number, status: 'completed' };
```

- [ ] **Step 3: Build** — `rtk pnpm --filter @agent-platform/graph build` → PASS.

- [ ] **Step 4: Commit**
```bash
rtk git add packages/graph/src/nodes/pr.ts
rtk git commit -m "feat(auto-merge): PR non-draft quando gate passa + prNumber no state (MAC-67)"
```

---

## Task 6: Nó `merging` + topologia + wiring (TDD)

**Files:** `packages/graph/src/nodes/merging.ts`, `packages/graph/src/nodes/merging.test.ts`, `packages/graph/src/build.ts`, `apps/orchestrator-api/src/agent.ts`, `apps/orchestrator-api/src/worker.ts`

- [ ] **Step 1: Teste que falha** — criar `packages/graph/src/nodes/merging.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { makeMergingNode } from './merging.js';

function deps() {
  return {
    github: { mergePullRequest: vi.fn(async () => {}), deleteBranch: vi.fn(async () => {}) },
    linear: { comment: vi.fn(async () => {}), setIssueState: vi.fn(async () => {}) },
    doneStateId: 'done-id',
  };
}
const okState = {
  autoMerge: true, testsPassed: true, review: 'Veredito: APROVADO',
  prNumber: 7, branch: 'agent/x', issueId: 'iss', status: 'completed',
};

describe('makeMergingNode', () => {
  it('no-op quando o gate não passa (sem chamar github/linear)', async () => {
    const d = deps();
    const node = makeMergingNode(d as never);
    const out = await node({ ...okState, autoMerge: false } as never);
    expect(d.github.mergePullRequest).not.toHaveBeenCalled();
    expect(out).toEqual({});
  });

  it('mergeia (squash), deleta branch, comenta e move pra Done', async () => {
    const d = deps();
    await makeMergingNode(d as never)(okState as never);
    expect(d.github.mergePullRequest).toHaveBeenCalledWith({ number: 7, method: 'squash' });
    expect(d.github.deleteBranch).toHaveBeenCalledWith('agent/x');
    expect(d.linear.setIssueState).toHaveBeenCalledWith('iss', 'done-id');
    expect(d.linear.comment).toHaveBeenCalled();
  });

  it('merge falha → comenta e segue (non-fatal, não lança)', async () => {
    const d = deps();
    d.github.mergePullRequest = vi.fn(async () => { throw new Error('not mergeable'); });
    const out = await makeMergingNode(d as never)(okState as never);
    expect(d.linear.comment).toHaveBeenCalled();
    expect(d.github.deleteBranch).not.toHaveBeenCalled();
    expect(out).toEqual({});
  });
});
```

- [ ] **Step 2: Rodar pra ver falhar** — `rtk pnpm exec vitest run packages/graph/src/nodes/merging.test.ts` → FAIL.

- [ ] **Step 3: Criar `packages/graph/src/nodes/merging.ts`:**
```ts
import type { GithubGateway } from '@agent-platform/github';
import type { LinearGateway } from '@agent-platform/linear';
import type { AgentStateType } from '../state.js';
import { shouldAutoMerge } from './report.js';

export interface MergingDeps {
  github: GithubGateway;
  linear: LinearGateway;
  /** Estado "Done" do time no Linear (move a issue ao mergear). */
  doneStateId: string;
}

/**
 * Nó MERGING (MAC-67): auto-merge opt-in. Roda entre `pr` e `report`. No-op se o
 * gate (label + validação ✅ + critic APROVADO seco) não passa — o Draft PR fica
 * pra merge manual. Non-fatal: falha de merge deixa o PR aberto, não derruba o run.
 */
export function makeMergingNode(deps: MergingDeps) {
  return async (state: AgentStateType): Promise<Partial<AgentStateType>> => {
    if (!shouldAutoMerge(state) || !state.prNumber) return {};
    try {
      await deps.github.mergePullRequest({ number: state.prNumber, method: 'squash' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await deps.linear.comment(
        state.issueId,
        `## ⚠️ Auto-merge falhou — merge manual\n\n\`\`\`\n${msg}\n\`\`\``,
      );
      return {};
    }
    // Pós-merge best-effort (não reverte o merge se algo aqui falhar).
    try {
      if (state.branch) await deps.github.deleteBranch(state.branch);
      await deps.linear.setIssueState(state.issueId, deps.doneStateId);
      await deps.linear.comment(
        state.issueId,
        `## ✅ Auto-merge na main\nPR #${state.prNumber} mergeado (squash) e branch \`${state.branch}\` removida.`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await deps.linear.comment(state.issueId, `## ⚠️ Pós-merge parcial\n\`\`\`\n${msg}\n\`\`\``);
    }
    return {};
  };
}
```

- [ ] **Step 4: Rodar pra ver passar** — `rtk pnpm exec vitest run packages/graph/src/nodes/merging.test.ts` → PASS (3).

- [ ] **Step 5: Topologia + deps no `build.ts`**

Em `packages/graph/src/build.ts`:
- import: `import { makeMergingNode } from './nodes/merging.js';`
- `GraphDeps`: adicionar `doneStateId: string;`
- montar o nó (junto dos outros):
```ts
  const merging = makeMergingNode({ github: deps.github, linear: deps.linear, doneStateId: deps.doneStateId });
```
- registrar + religar as arestas: adicionar `.addNode('merging', merging)`, trocar `.addEdge('pr', 'report')` por `.addEdge('pr', 'merging')` e `.addEdge('merging', 'report')`.

- [ ] **Step 6: Wiring no `agent.ts` + `worker.ts`**

Em `apps/orchestrator-api/src/agent.ts`, no `buildAgentGraph({...})`, adicionar:
```ts
      doneStateId: env.LINEAR_DONE_STATE_ID,
```
Em `apps/orchestrator-api/src/worker.ts`, no `graph.invoke` do job `plan` (estado inicial), adicionar `autoMerge` lido do run. Antes do invoke do plan:
```ts
        const run = await getRun(runId);
```
e no objeto de estado inicial:
```ts
            autoMerge: run?.autoMerge ?? false,
```
(`getRun` já é importado em `worker.ts`; se não, importar de `./runs.js`.)

- [ ] **Step 7: Build do monorepo** — `rtk pnpm -r build` → PASS (tipo `doneStateId` propaga; graph + orchestrator).

- [ ] **Step 8: Commit**
```bash
rtk git add packages/graph/src/nodes/merging.ts packages/graph/src/nodes/merging.test.ts packages/graph/src/build.ts apps/orchestrator-api/src/agent.ts apps/orchestrator-api/src/worker.ts
rtk git commit -m "feat(auto-merge): nó merging + topologia pr→merging→report + wiring (MAC-67)"
```

---

## Task 7: Webhook detecta label + env example/compose + suíte

**Files:** `apps/orchestrator-api/src/routes/webhooks.ts`, `apps/orchestrator-api/.env.example`, `infra/compose/orchestrator/docker-compose.yml`

- [ ] **Step 1: Detectar a label no webhook**

Em `routes/webhooks.ts`, no handler do ai-ready, na criação do run (bloco `createRun({...})` dentro do try), adicionar o campo:
```ts
      autoMerge: hasLabel(payload.data, 'auto-merge', env.LINEAR_AUTO_MERGE_LABEL_ID ?? ''),
```
(`hasLabel` já existe no arquivo; cobre nome `auto-merge` OU id do env. `payload` é a variável do corpo já parseado — conferir o nome real da variável no handler e usar o mesmo.)

- [ ] **Step 2: .env.example + compose**

Em `apps/orchestrator-api/.env.example` (perto das `LINEAR_*`):
```
# Auto-merge (MAC-67): label de opt-in + estado Done do time
LINEAR_AUTO_MERGE_LABEL_ID=
LINEAR_DONE_STATE_ID=79e3b949-6f1f-469d-902d-71d135d18cae
```
Em `infra/compose/orchestrator/docker-compose.yml`, na lista `environment:` do serviço `api` (estilo map):
```yaml
      LINEAR_AUTO_MERGE_LABEL_ID: ${LINEAR_AUTO_MERGE_LABEL_ID}
      LINEAR_DONE_STATE_ID: ${LINEAR_DONE_STATE_ID:-79e3b949-6f1f-469d-902d-71d135d18cae}
```

- [ ] **Step 3: Suíte completa** — `rtk pnpm -r build && rtk pnpm test` → PASS (todos + novos: shouldAutoMerge 6, github gateway 4, merging 3). Reportar a contagem.

- [ ] **Step 4: Commit**
```bash
rtk git add apps/orchestrator-api/src/routes/webhooks.ts apps/orchestrator-api/.env.example infra/compose/orchestrator/docker-compose.yml
rtk git commit -m "feat(auto-merge): webhook detecta label auto-merge + envs no example/compose (MAC-67)"
```

---

## Deploy + E2E (pós-implementação, rodado pelo usuário)

> Orchestrator-only (runners não mudam). Migration 0010.

1. **Criar a label `auto-merge` no Linear** (time MAC) + pegar o id → pôr em `LINEAR_AUTO_MERGE_LABEL_ID` no `.env` do LXC 201 (`/opt/agent-platform/repo/infra/compose/orchestrator/.env`). (Sem o id, o gate por nome `auto-merge` ainda funciona via `hasLabel`, mas o id é mais robusto.)
2. **Deploy:** `cd ~/agent-platform && git pull && bash infra/deploy/deploy.sh orchestrator` (migration 0010 + grafo novo).
3. **E2E:** issue de teste com labels `ai-ready` + `auto-merge`, descrição simples (codegen limpo → critic APROVADO seco). Aprovar (label `approved`). Esperar: run verde → **merge automático na main** + branch deletada + comentário "✅ Auto-merge na main" + issue movida pra Done. Conferir o PR mergeado no GitHub.
4. **Contraprova:** issue só com `ai-ready` (sem `auto-merge`) → Draft PR manual (comportamento atual, sem merge).

---

## Self-Review

**Spec coverage:**
- Opt-in label + `runs.auto_merge` + webhook detect → Tasks 1,7. ✅
- Gate `shouldAutoMerge` (label + testsPassed + APROVADO seco) → Task 2. ✅
- PR non-draft quando gate + prNumber → Task 5. ✅
- Nó `merging` (squash + deleteBranch + Linear Done + comment, non-fatal) → Task 6. ✅
- Gateways (github merge/delete, linear setIssueState) → Tasks 3,4. ✅
- Topologia pr→merging→report + wiring (doneStateId, worker autoMerge) → Task 6. ✅
- Envs (`LINEAR_AUTO_MERGE_LABEL_ID`, `LINEAR_DONE_STATE_ID`) → Tasks 4,7. ✅
- Error handling (non-fatal, gate conservador, draft só quando não-merge) → Tasks 5,6. ✅
- Testes (gate 6, github 4, merging 3) → Tasks 2,3,6. ✅

**Placeholder scan:** os "conferir nome da variável/assinatura real" são instruções de adaptação com a forma dada — não placeholders de código.

**Type consistency:** `autoMerge`/`prNumber` (state + run + webhook), `shouldAutoMerge({autoMerge,testsPassed,review})` (report.ts, usado em pr.ts + merging.ts), `mergePullRequest({number,method})`/`deleteBranch(branch)` (github), `setIssueState(issueId,stateId)` (linear), `doneStateId` (GraphDeps→MergingDeps→agent.ts env), topologia `pr→merging→report`. Consistentes entre tasks.
