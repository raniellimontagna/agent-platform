# Auto-merge (verde + aprovado, opt-in) — Design

**Data:** 2026-06-15
**Issue:** (a criar no Linear — Fase pós-7, melhoria de produto)
**Status:** aprovado

## Problema

O loop é autônomo até o **Draft PR** (MAC-26): o agente planeja, codifica, valida,
revisa e abre um Draft PR — mas o **merge é manual** (decisão consciente do MVP, pra
não mergear sozinho na `main`). Esse é o último passo manual. Quando o run termina
**verde + aprovado**, mergear à mão é trabalho mecânico que dá pra fechar com gate
conservador.

## Escopo

Auto-merge **opt-in** e **conservador**: só mergeia uma issue marcada com a label
`auto-merge` E cujo run terminou com validação ✅ E critic **APROVADO seco** (sem
ressalva/REPROVADO). Sem a label, nada muda (Draft PR manual — comportamento atual).
Merge é **non-fatal**: qualquer falha (conflito, branch atrás da main) deixa o PR
aberto pra merge manual, sem derrubar o run.

## Arquitetura

### 1. Opt-in + gate

- Label `auto-merge` na issue do Linear. Env nova `LINEAR_AUTO_MERGE_LABEL_ID`
  (env.ts + .env.example + lista `environment:` do compose do orchestrator).
- Webhook (`routes/webhooks.ts`), ao criar o run do `ai-ready`, detecta a label
  (via os helpers `hasLabel`/labelIds já usados pro ai-ready/approved) e passa
  `autoMerge` pro `createRun`. Coluna nova `runs.auto_merge` (boolean not null
  default false, migration `0010`, espelha `auto_approve` do MAC-38).
- Gate **puro e testável** em `packages/graph` (junto de `verdictOf`):
  ```ts
  export function shouldAutoMerge(state: AgentStateType): boolean {
    return (
      state.autoMerge === true &&
      state.testsPassed === true &&
      verdictOf(state.review ?? '') === 'APROVADO'
    );
  }
  ```
  `verdictOf` (em `report.ts`) extrai o texto da linha "Veredito:" — retorna
  `"APROVADO"`, `"APROVADO COM RESSALVAS"`, `"REPROVADO"` ou `"—"`. Logo
  `=== 'APROVADO'` casa **só o veredito seco** (ressalva/reprovado/ausente são
  strings diferentes → excluídos automaticamente). Gate exato, sem heurística extra.

### 2. Estado do grafo

Campos novos em `packages/graph/src/state.js` (`AgentState`):
- `autoMerge: boolean` (default false) — vem do run.
- `prNumber: number | undefined` — preenchido pelo nó `pr` (pro merge).

O worker (`worker.ts`), ao invocar o grafo, injeta `autoMerge` no estado inicial a
partir do run (`getRun(runId).autoMerge`), do mesmo jeito que já carrega outros
campos do run.

### 3. Nó `pr` (ajuste)

`packages/graph/src/nodes/pr.ts`:
- Se `shouldAutoMerge(state)` → cria o PR **não-draft** (`draft: false`, mergeável);
  senão mantém `draft: true` (atual). (O gate já é conhecido aqui — roda depois do
  `reviewing`.)
- Retorna `prNumber: pr.number` no estado (além de `prUrl`).

### 4. Nó `merging` (novo, entre `pr` e `report`)

`packages/graph/src/nodes/merging.ts`. Topologia:
`pr → merging → report` (substitui a aresta `pr → report`).

Lógica:
- `!shouldAutoMerge(state)` OU `!state.prNumber` → no-op (retorna `{}`, segue pro
  report; Draft PR fica pra merge manual).
- Gate ok: `deps.github.mergePullRequest({ number: state.prNumber, method: 'squash' })`
  → `deps.github.deleteBranch(state.branch)` → `deps.linear.comment(issueId, '✅
  Auto-merge na main (#N)')` → `deps.linear.setIssueState(issueId,
  deps.doneStateId)` (move pra Done).
- **Non-fatal:** qualquer erro (merge 405/409 por conflito/não-mergeável, delete,
  status) → `deps.linear.comment(issueId, '⚠️ auto-merge falhou — merge manual: <msg>')`
  e segue (NÃO marca o run failed; o PR continua aberto). `try/catch` por etapa:
  o merge é o crítico; delete/status são best-effort.
- Não altera `status` do run (o run já está `completed` do nó `pr`).

### 5. Gateway GitHub (`packages/github/src/index.ts`)

Adicionar ao `GithubGateway`:
- `mergePullRequest(args: { number: number; method?: 'merge' | 'squash' | 'rebase' }): Promise<void>`
  → `PUT /repos/:owner/:repo/pulls/:number/merge` com `{ merge_method }`.
- `deleteBranch(branch: string): Promise<void>`
  → `DELETE /repos/:owner/:repo/git/refs/heads/:branch` (404/422 = já deletada →
  tolerar).

### 6. Gateway Linear (`packages/linear/src/index.ts`)

Adicionar ao `LinearGateway`:
- `setIssueState(issueId: string, stateId: string): Promise<void>`
  → SDK `client.updateIssue(issueId, { stateId })`.
- Env nova `LINEAR_DONE_STATE_ID` (default `79e3b949-6f1f-469d-902d-71d135d18cae` =
  estado "Done" do time MAC) em env.ts + .env.example + compose. Injetada como
  `doneStateId` nas deps do nó `merging` (via `agent.ts`/`build.ts`).

### 7. Wiring

- `build.ts` `GraphDeps`: adicionar `doneStateId: string` (e o nó `merging` recebe
  `{ github, linear, doneStateId }`). `agent.ts` passa `env.LINEAR_DONE_STATE_ID`.
- `buildAgentGraph`: registra o nó `merging`; troca `addEdge('pr','report')` por
  `addEdge('pr','merging')` + `addEdge('merging','report')`.

## Error handling

- Merge/delete/status no nó `merging` são non-fatal (try/catch → comenta, segue).
- Run nunca vira `failed` por causa do auto-merge (o PR já está aberto/completo).
- Sem label `auto-merge` → comportamento idêntico ao atual (Draft PR manual).
- `deleteBranch` tolera branch já ausente (404/422).
- PR draft nunca é mergeado (só cria não-draft quando o gate passa).

## Testes

- `shouldAutoMerge` (puro, em graph): ≥4 casos — gate ok (true); sem autoMerge
  (false); verdict com ressalva/REPROVADO (false); testsPassed false/undefined (false).
- Gateway GitHub: `mergePullRequest` (PUT rota+merge_method) e `deleteBranch` (DELETE
  rota) via mock fetch.
- Gateway Linear: `setIssueState` chama `client.updateIssue(id,{stateId})` (mock do client).
- Nó `merging`: no-op quando gate falha (não chama github/linear); merge ok (chama
  merge+delete+comment+setIssueState); merge falha → comenta, não lança, segue.
- Webhook: label `auto-merge` presente → `createRun` recebe `autoMerge: true`.

## Fora de escopo

- Auto-merge sem opt-in (sempre exige a label).
- Rebase / resolução de conflito (conflito → merge manual).
- Runs do scheduler (MAC-38): as issues criadas pelo scheduler não recebem a label
  `auto-merge`, então não auto-mergeiam (ok; pode ser follow-up por flag no schedule).
- Re-tentar merge depois (uma tentativa por run; falhou → manual).
