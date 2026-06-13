# Worker Manager — failover entre runners (design)

> Spec de design. Data: 2026-06-13. Time `MAC`, projeto *Orquestrador de Agentes com LangGraph*.
> Card: MAC-39 (Fase 6 — Runtime e Governança).

## Problema

O orchestrator hoje conhece **um único runner** (`RUNNER_BASE_URL`). O nó `coder`
(`packages/graph`) faz `fetch(runner.baseUrl + '/jobs/sync')` direto. Se esse runner
está fora/doente, o run falha — não há para onde rotear.

O Worker Manager dá **resiliência/failover**: o orchestrator conhece N runners,
checa a saúde no momento de despachar e roteia o job para um runner saudável.

## Decisões (do brainstorm)

1. **Foco:** resiliência/failover (não escala de throughput nem concorrência por
   runner — esses são follow-up). Vale mesmo com 1–2 runners (degrada gracioso).
2. **Fonte dos runners:** env `RUNNER_BASE_URLS` (lista separada por vírgula).
   Default = o `RUNNER_BASE_URL` atual (retrocompatível). Infra estática — sem
   tabela/CRUD/auto-registro.
3. **Health + seleção:** probe no dispatch + failover. Ao despachar, tenta os
   runners em ordem (começando por um índice round-robin); para cada um, `GET
   /health` (timeout ~2s); se ok, manda o job; se a chamada falhar por transporte,
   tenta o próximo. Sem poller em background.
4. **Failover só em erro de transporte:** runner fora, timeout, ou HTTP 5xx de
   infra. Um `200` com `result.status: 'failed'` é um RESULTADO real do job e **não**
   re-despacha (evita re-rodar codegen à toa).
5. **`packages/graph` fica transport-agnostic:** a lógica de fleet/health/failover
   vive no orchestrator e é **injetada** no grafo (igual ao `loadLessons` do MAC-23).

## Arquitetura

```
coder node (packages/graph)
  monta o body do job → deps.dispatch(body)
                              │
                              ▼
workerManager (orchestrator)  dispatch(body):
  ordem round-robin dos baseUrls
  p/ cada url:  GET /health (timeout 2s)
                 ├─ saudável → POST /jobs/sync → devolve RunnerResult
                 └─ erro de transporte → próximo
  todos fora → throw 'nenhum runner saudável'
```

## Componentes

### 1. env (`apps/orchestrator-api/src/env.ts`)

- `RUNNER_BASE_URLS` (opcional): lista de URLs separadas por vírgula. Se ausente,
  cai no `RUNNER_BASE_URL` (mantido). `parseRunnerUrls(raw, fallback)` (pura,
  testável): split por vírgula, trim, remove vazios, dedup; se vazio usa `[fallback]`.

### 2. `workerManager.ts` (orchestrator)

`createWorkerManager({ baseUrls, authToken, fetchImpl?, healthTimeoutMs? })` →
`{ dispatch, probeAll }`.

- Estado: contador round-robin module/closure-level (qual índice começa).
- `dispatch(body): Promise<RunnerResult>`:
  - calcula a ordem dos candidatos a partir do índice round-robin (incrementa a cada dispatch);
  - para cada `url` na ordem:
    - `isHealthy(url)` = `GET url/health` com timeout (`AbortController`, default 2000ms); 200 → true; senão/erro → false.
    - se não saudável → próximo.
    - se saudável → `POST url/jobs/sync` (Bearer authToken, body JSON). Se a resposta não for ok por **infra** (5xx) ou o fetch lançar → log + próximo. Se ok → `return await res.json() as RunnerResult`.
  - esgotou todos → `throw new Error('nenhum runner saudável disponível')`.
- `probeAll(): Promise<{ url; healthy; ms }[]>`: health de todos em paralelo (p/ o endpoint admin).
- `fetchImpl` injetável (default `globalThis.fetch`) p/ testes — padrão do `mcp-server` client.

**Importante (semântica de failover):** o `POST /jobs/sync` que retorna `200` com
`{ status: 'failed' }` é sucesso de transporte — `dispatch` devolve esse resultado
sem tentar outro runner. Só erro de rede / 5xx aciona o próximo candidato.

### 3. Injeção no grafo (`packages/graph`)

- `GraphDeps`/`CoderDeps` ganham `dispatch: (body) => Promise<RunnerResult>` no lugar
  do uso direto de `runner.baseUrl`. `RunnerConfig` mantém só `repoUrl` (usado para
  montar o body); `authToken`/`baseUrl(s)` saem do grafo (vivem no workerManager).
- `coder.ts`: troca o bloco `fetch(${deps.runner.baseUrl}/jobs/sync, {...})` por
  `const result = await deps.dispatch(body)` onde `body` é o mesmo objeto JSON de
  hoje (`runId, issueIdentifier, repoUrl, baseBranch, branch, title, description,
  plan, commands, lessons, reviewFeedback`). O tratamento do `result`/erro continua
  igual (sucesso → estado; throw → run `failed` + comenta no Linear).
- O tipo `RunnerResult` (hoje local no coder) passa a ser exportado/compartilhado
  para o workerManager usar o mesmo shape (mover p/ um ponto comum do graph e
  reusar no orchestrator, ou redeclarar idêntico — decidir no plano; preferir
  exportar de `packages/graph`).

### 4. `GET /admin/runners` (`routes/admin.ts`)

Protegido pelo mesmo bearer do `/admin` (MAC-32). Chama `workerManager.probeAll()`
e retorna `{ runners: [{ url, healthy, ms }] }`. Dá visibilidade operacional e cobre
o "health checks" do DoD. O `adminRoute` passa a receber o `workerManager` (via
factory `makeAdminRoute(workerManager)` ou import do singleton do agent) — decidir
no plano, preferindo não quebrar o registro atual de rotas.

### 5. Wiring (`agent.ts` / `index.ts`)

- `agent.ts`: cria o `workerManager` com `parseRunnerUrls(env.RUNNER_BASE_URLS, env.RUNNER_BASE_URL)` + `env.RUNNER_AUTH_TOKEN`; injeta `dispatch` em `buildAgentGraph` deps; `runner` passa a carregar só `repoUrl`. Expõe o `workerManager` no objeto `Agent` (p/ a rota admin).
- `index.ts`: a rota admin precisa do `workerManager` — obter via `getAgent()`.

## Escopo / não-objetivos (follow-up)

- Distribuição por carga real (least-busy) e limite de concorrência por runner.
- Tabela `runners` + CRUD / auto-registro / heartbeat.
- Poller de saúde em background + métricas Prometheus de disponibilidade.
- Retry com backoff entre runners (hoje: tenta cada um uma vez, em ordem).

## Tratamento de erros

- Nenhum runner saudável → `dispatch` lança → `coder` marca run `failed` e comenta
  no Linear (caminho de erro já existente). Não regride o comportamento atual.
- Health probe com timeout (AbortController) — runner pendurado não trava o dispatch.
- `RUNNER_BASE_URLS` malformado/vazio → `parseRunnerUrls` cai no fallback (nunca
  array vazio).

## Testes

- `parseRunnerUrls`: split/trim/dedup; vazio → fallback; uma URL; várias.
- `workerManager.dispatch` (com `fetchImpl` mock):
  - 1º saudável → manda lá, não tenta outros;
  - 1º não-saudável (health falha) → pula pro 2º;
  - 1º saudável mas POST lança/5xx → failover pro 2º;
  - POST 200 com `{status:'failed'}` → devolve o resultado, **não** faz failover;
  - todos fora → lança.
- `probeAll`: mapeia saúde de cada url.
- (`coder` com dispatch injetado: o teste existente do graph cobre slugify; a troca
  é coberta pelo build + pelos testes do workerManager.)

## Arquivos prováveis (confirmar no plano)

- `apps/orchestrator-api/src/env.ts` — `RUNNER_BASE_URLS` + `parseRunnerUrls` (ou helper à parte).
- `apps/orchestrator-api/src/workerManager.ts` — `createWorkerManager`, `dispatch`, `probeAll`.
- `apps/orchestrator-api/src/workerManager.test.ts` — testes.
- `apps/orchestrator-api/src/agent.ts` — cria/injeta workerManager; `runner` só repoUrl; expõe no `Agent`.
- `apps/orchestrator-api/src/routes/admin.ts` — `GET /admin/runners`.
- `apps/orchestrator-api/src/index.ts` — passa workerManager pra rota admin (via getAgent).
- `packages/graph/src/build.ts` + `nodes/coder.ts` — `dispatch` nas deps; coder usa dispatch; `RunnerResult`/`RunnerConfig` ajustados.
- `apps/orchestrator-api/.env.example` — documenta `RUNNER_BASE_URLS`.
