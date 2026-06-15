# Agent Registry (MAC-42) — Design

**Data:** 2026-06-14
**Issue:** MAC-42 (Fase 7 — Produção e Escala)
**Status:** aprovado

## Problema

O orchestrator hoje tem **um** agente implícito: o LangGraph
(`packages/graph`, `buildAgentGraph`) montado uma vez em
`apps/orchestrator-api/src/agent.ts`. Não há catálogo de *tipos* de agente,
capacidades nem versionamento. Isso é a fundação para o Multi-Agent (MAC-47):
sem um registro do que existe, não há como rotear/coordenar.

DoD do card: **catálogo**, **capacidades**, **versionamento**.

## Escopo

**Foundation — catálogo + versionamento.** MAC-42 entrega o registro e a
gravação de qual agente rodou cada run. A **seleção/roteamento** por capacidade e
a **coordenação/paralelismo** ficam para o MAC-47. O registro não executa nada — o
grafo continua em código; o registro é metadado + FK.

## Arquitetura

### 1. Dados (migration drizzle, próxima sequencial `0006_*`)

Editar `apps/orchestrator-api/src/db/schema.ts` e gerar a migration com
drizzle-kit.

Tabela `agents`:

| coluna | tipo | nota |
|---|---|---|
| `id` | uuid PK (`defaultRandom`) | |
| `key` | text not null | identidade lógica, ex. `coder-agent` |
| `version` | text not null | ex. `v1`, `v2` |
| `description` | text | |
| `capabilities` | jsonb not null default `[]` | array de strings (tags) |
| `status` | enum `agent_status` (`active`/`deprecated`) not null default `active` | |
| `created_at` | timestamptz default now | |
| `updated_at` | timestamptz default now | |

Constraint: `unique(key, version)`.

Coluna nova em `runs`: `agent_id uuid` nullable, FK → `agents.id`
`ON DELETE SET NULL` (registra a versão exata que rodou; nullable para runs
antigos e robustez se o agente for removido).

Novo enum pg `agent_status` (mesmo padrão do `artifact_kind`).

### 2. Data layer — `apps/orchestrator-api/src/agents.ts`

- `listAgents(filter?: { key?: string; status?: AgentStatus }): Promise<Agent[]>`
- `getAgent(id: string): Promise<Agent | null>`
- `createAgent(parts: NewAgent): Promise<Agent>` — insere; viola `unique(key,version)`
  → lança erro mapeado para 409 na rota.
- `updateAgentStatus(id: string, status: AgentStatus): Promise<Agent | null>` —
  também seta `updated_at`.
- `ensureDefaultAgent(): Promise<void>` — idempotente; insere `coder-agent v1` se
  não existir (`onConflictDoNothing` em `(key,version)`).
- `resolveDefaultAgent(): Promise<Agent | null>` — `pickActiveAgent` sobre as
  linhas active da key default (`env.AGENT_KEY`).

Helper **puro** (testável sem DB) em `agents.ts`:

- `pickActiveAgent(rows: Agent[]): Agent | null` — filtra `status==='active'`,
  retorna a de `created_at` mais recente; `null` se nenhuma.

Validação de payload de criação com zod (`key`, `version` não-vazios;
`capabilities` array de strings; `description` opcional).

### 3. REST — `apps/orchestrator-api/src/routes/agents.ts`

| Rota | Auth | Faz |
|---|---|---|
| `GET /agents` (`?key=`, `?status=`) | aberta | lista (descoberta) |
| `GET /agents/:id` | aberta | detalhe; 404 se não existe |
| `POST /agents` | bearer `RUNNER_AUTH_TOKEN` | registra agente/versão; 409 em duplicado; 400 em payload inválido |
| `PATCH /agents/:id` | bearer | muda `status` (ex. deprecate); 404 se não existe |

Leituras abertas (rede isolada, igual `runsRoute`/`artifactsRoute`); escritas com
`requireAuth` (igual `schedulesRoute`). Registrar a rota em
`app.ts` (`buildApp`).

**Guard de uuid (MAC-64):** adicionar os padrões `/agents/:id` e `/agents/:id/*`
à lista do `uuidGuard` em `app.ts` (senão `:id` não-uuid → 500 no cast).

### 4. MCP tools (facade read-only) — `apps/mcp-server`

Adicionar ao cliente + tools (padrão MAC-46):

- `list_agents` → `GET /agents` (aceita `key?`, `status?`)
- `get_agent` → `GET /agents/:id`

Escrita (registro) continua via REST — YAGNI no MCP. Atualizar a tabela de tools
no `apps/mcp-server/README.md`.

### 5. Seed idempotente

No boot do worker (`startAgentWorker`, junto da reconciliação existente do
scheduler), chamar `ensureDefaultAgent()`. Insere `coder-agent v1`:

- `key`: `env.AGENT_KEY` (default `coder-agent`)
- `version`: `v1`
- `capabilities`: `["typescript","node","hono","feature","bugfix","refactor","single-repo"]`
- `status`: `active`
- `description`: pipeline LangGraph atual (planner→coder→reviewing→revising→pr→report)

Idempotente via `onConflictDoNothing`.

### 6. Integração com runs

Na criação do run (webhook em `worker.ts`/handler e no `scheduleWorker.ts`),
resolver `resolveDefaultAgent()` e gravar `agent_id` no insert do run. Se não
houver agente active (não deve acontecer pós-seed), grava `null` (não bloqueia o
run). Expor `agent_id` em `GET /runs` e `GET /runs/:id` (já serializam o row).

Seleção por capacidade (match issue↔capabilities) é **MAC-47**.

### 7. Variáveis de ambiente

- `AGENT_KEY` (default `coder-agent`) — key do agente default. Adicionar em
  `env.ts`, `.env.example` e na **lista `environment:` do compose do
  orchestrator** (gotcha conhecido: env nova precisa entrar na lista, não só no
  .env).

## Error handling

- `POST /agents` duplicado (key+version) → 409 `{ error: 'agent already exists' }`.
- payload inválido → 400 com as issues do zod.
- `GET`/`PATCH` `/agents/:id` inexistente → 404.
- `:id` não-uuid → 404 (uuidGuard).
- seed/resolve nunca derrubam o boot (try/catch não-fatal no seed, igual às
  outras inicializações).

## Testes

- `pickActiveAgent`: ignora deprecated; escolhe a mais recente; `null` sem active
  (≥3 casos).
- zod do payload de criação: aceita válido, rejeita key/version vazios e
  capabilities não-array (≥3 casos).
- rotas `agents.test.ts` (mock do data layer via `vi.mock`, padrão
  `artifacts.test.ts`): list, get 200/404, post 201/409/400, patch 200/404, auth
  401 nas escritas.
- guard de uuid: `/agents/nao-uuid` → 404 (estende `app.test.ts`).
- `ensureDefaultAgent` idempotente (chamar 2× não duplica) — teste com mock do
  insert/onConflict ou via verificação do builder.

## Fora de escopo

- Seleção/roteamento de agente por capacidade (MAC-47).
- Execução de múltiplos agentes / coordenação (MAC-47).
- Tool MCP de escrita (registro via REST).
- Painel Grafana de agentes (follow-up).
- Semver real / ranges de versão (string simples basta agora).
