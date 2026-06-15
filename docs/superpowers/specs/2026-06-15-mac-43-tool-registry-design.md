# Tool Registry (MAC-43) — Design

**Data:** 2026-06-15
**Issue:** MAC-43 (Fase 7 — Produção e Escala)
**Status:** aprovado

## Problema

O sistema tem uma noção implícita de "ferramentas": o runner executa comandos
de shell no sandbox gateados por um allowlist estático
(`apps/worker-code/src/executor/commandPolicy.ts`, env
`AGENT_COMMAND_ALLOWLIST` default `pnpm,node,npm,npx,git`). Não há catálogo de
quais ferramentas existem, que permissões/risco cada uma carrega, nem
versionamento dessas definições. Isso é fundação para o Multi-Agent (MAC-47):
sem um registro do que existe e do risco de cada tool, não há como atribuir/
restringir tools por agente.

DoD do card: **permissões**, **descoberta**, **versionamento**.

## Escopo

**Catálogo puro — espelha o Agent Registry (MAC-42).** MAC-43 entrega o registro
de tools com permissões declarativas (risk + scopes) e versionamento. O
**enforcement**, a **atribuição agente↔tool** e **alimentar o allowlist do runner
a partir do banco** ficam para o MAC-47. O registro é metadado; o allowlist do
runner continua estático por env nesta fase.

Diferença vs MAC-42: **não há `runs.tool_id`** — um run não usa "uma tool"; a
relação agente↔tool é o join do MAC-47. MAC-43 é só o catálogo.

## Arquitetura

### 1. Dados (migration drizzle, próxima sequencial `0007_*`)

Editar `apps/orchestrator-api/src/db/schema.ts` e gerar a migration com
drizzle-kit.

Novos enums pg (mesmo padrão de `agent_status`):
- `tool_risk` (`safe`/`caution`/`dangerous`)
- `tool_status` (`active`/`deprecated`)

Tabela `tools`:

| coluna | tipo | nota |
|---|---|---|
| `id` | uuid PK (`defaultRandom`) | |
| `key` | text not null | nome lógico = binário do comando, ex. `git`, `pnpm` |
| `version` | text not null | versão da **definição** no registry (`v1`, `v2`) — igual MAC-42, NÃO o semver do binário |
| `description` | text | |
| `risk` | enum `tool_risk` not null default `safe` | |
| `scopes` | jsonb not null default `[]` | array de strings (tags): `fs_read`/`fs_write`/`network`/`exec`/`vcs` |
| `status` | enum `tool_status` not null default `active` | |
| `created_at` | timestamptz default now | |
| `updated_at` | timestamptz default now (`$onUpdate`) | |

Constraint: `unique(key, version)` (`tools_key_version_uq`).

**Sem coluna em `runs`.** Sem FK. (A diferença chave vs MAC-42.)

**Versionamento:** `version` = versão da definição/permissão da tool. Mudar
scopes/risk de `git` → cria `git v2` e deprecate `v1`. Idêntico ao MAC-42.

### 2. Data layer — `apps/orchestrator-api/src/tools.ts`

(Sem colisão: o `tools.ts` existente é do `apps/mcp-server`, não do
orchestrator.)

Helper **puro** (testável sem DB):
- `pickActiveTool(rows: Tool[]): Tool | null` — filtra `status==='active'`,
  retorna a de `created_at` mais recente; `null` se nenhuma.

Validação de payload com zod:
- `createToolSchema`: `key` e `version` não-vazios; `description` opcional;
  `risk` enum (`safe`/`caution`/`dangerous`) com default `safe`; `scopes` array
  de strings com default `[]`.

Funções de DB:
- `listTools(filter?: { key?: string; status?: ToolStatus; risk?: ToolRisk }): Promise<Tool[]>`
- `getTool(id: string): Promise<Tool | null>`
- `createTool(parts: CreateToolInput): Promise<Tool>` — insere; viola
  `unique(key,version)` → lança `ToolExistsError` (mapeado para 409 na rota).
- `updateToolStatus(id: string, status: ToolStatus): Promise<Tool | null>` —
  também seta `updated_at`.
- `ensureDefaultTools(): Promise<void>` — idempotente; insere o seed (§5) com
  `onConflictDoNothing` em `(key,version)`.

`ToolRisk` e `ToolStatus` derivados de `schema.toolRisk.enumValues` /
`schema.toolStatus.enumValues`.

### 3. REST — `apps/orchestrator-api/src/routes/tools.ts`

| Rota | Auth | Faz |
|---|---|---|
| `GET /tools` (`?key=`, `?status=`, `?risk=`) | aberta | lista (descoberta); `status`/`risk` validados via zod enum → 400 em valor inválido |
| `GET /tools/:id` | aberta | detalhe; 404 se não existe |
| `POST /tools` | bearer `RUNNER_AUTH_TOKEN` | registra tool/versão; 409 em duplicado; 400 em payload inválido |
| `PATCH /tools/:id` | bearer | muda `status` (deprecate); 404 se não existe; 400 em status inválido |

Leituras abertas (rede isolada, igual `agents`/`runs`); escritas com
`requireAuth` (bearer registrado nos handlers POST/PATCH antes do handler real,
mesmo padrão de `routes/agents.ts`). Registrar a rota em `app.ts` (`buildApp`).

**Guard de uuid (MAC-64):** adicionar `/tools/:id` e `/tools/:id/*` à lista do
`uuidGuard` em `app.ts`.

### 4. MCP tools (facade read-only) — `apps/mcp-server`

Adicionar ao cliente + tools (padrão MAC-42/46):
- `list_tools` → `GET /tools` (aceita `key?`, `status?`, `risk?`)
- `get_tool` → `GET /tools/:id`

Escrita (registro) continua via REST — YAGNI no MCP. Atualizar a tabela de tools
no `apps/mcp-server/README.md`.

### 5. Seed idempotente

No boot do worker (`startAgentWorker`, junto do `ensureDefaultAgent()` do
MAC-42), chamar `ensureDefaultTools()`. Insere as 5 tools reais do allowlist
default (`AGENT_COMMAND_ALLOWLIST` = `pnpm,node,npm,npx,git`), todas `version v1`,
`status active`:

| key | risk | scopes |
|---|---|---|
| `git` | `caution` | `[vcs, fs_write]` |
| `pnpm` | `dangerous` | `[network, exec, fs_write]` |
| `npm` | `dangerous` | `[network, exec, fs_write]` |
| `npx` | `dangerous` | `[network, exec, fs_write]` |
| `node` | `caution` | `[exec]` |

Idempotente via `onConflictDoNothing`. Não-fatal (try/catch, igual ao seed do
MAC-42).

### 6. Variáveis de ambiente

Nenhuma nova. O seed usa a lista hardcoded acima (espelha o default do
`AGENT_COMMAND_ALLOWLIST`, que vive no worker-code). MAC-43 não lê o allowlist em
runtime — apenas semeia as mesmas 5 tools.

## Error handling

- `POST /tools` duplicado (key+version) → 409 `{ error: 'tool already exists' }`.
- payload inválido → 400 com as issues do zod.
- `GET`/`PATCH` `/tools/:id` inexistente → 404.
- `:id` não-uuid → 404 (uuidGuard).
- `?status=`/`?risk=` inválido → 400 (validação zod antes do data layer).
- seed nunca derruba o boot (try/catch não-fatal).

## Testes

- `pickActiveTool`: ignora deprecated; escolhe a mais recente; `null` sem active
  (≥2 casos).
- `createToolSchema`: aceita válido (default risk `safe`, scopes `[]`); rejeita
  key/version vazios; rejeita risk inválido; rejeita scopes não-array (≥3 casos).
- rotas `tools.test.ts` (mock do data layer via `vi.mock`, padrão
  `agents.test.ts`): list, list com filtro inválido (400), get 200/404, post
  201/409/400, patch 200/404, status inválido 400, auth 401 nas escritas.
- guard de uuid: `/tools/nao-uuid` → 404 (estende `app.test.ts`).

## Fora de escopo

- Enforcement / atribuição agente↔tool (MAC-47).
- Alimentar o allowlist do runner a partir do banco (MAC-47).
- `runs.tool_id` / vincular tool a run.
- Tool MCP de escrita (registro via REST).
- Painel Grafana de tools (follow-up).
- Versão real (semver) do binário — `version` é a versão da definição.
