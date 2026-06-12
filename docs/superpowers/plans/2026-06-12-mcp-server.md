# MCP Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um servidor MCP stdio (`apps/mcp-server`) que expõe as capacidades do orchestrator (listar/inspecionar runs, lições, status; aprovar/reprovar/pausar/retomar) como tools MCP, via cliente HTTP fino sobre a REST API existente.

**Architecture:** App standalone usando `@modelcontextprotocol/sdk` (transporte stdio). Um `createClient({baseUrl, token})` injetável encapsula as chamadas REST (testável com fetch fake); `registerTools(server, client)` registra 10 tools; `index.ts` faz o bootstrap. Zero acoplamento com DB/fila — só HTTP + Bearer.

**Tech Stack:** TypeScript ESM, `@modelcontextprotocol/sdk`, zod, Vitest.

**Referência:** spec `docs/superpowers/specs/2026-06-12-mcp-server-design.md`.

---

## File Structure

**Criar:**
- `apps/mcp-server/package.json` — manifesto + deps do SDK.
- `apps/mcp-server/tsconfig.json` — extends base.
- `apps/mcp-server/src/env.ts` — `ORCHESTRATOR_BASE_URL`, `RUNNER_AUTH_TOKEN`.
- `apps/mcp-server/src/client.ts` — cliente REST fino (DI, testável).
- `apps/mcp-server/src/client.test.ts` — testes do client.
- `apps/mcp-server/src/tools.ts` — registro das 10 tools.
- `apps/mcp-server/src/index.ts` — bootstrap stdio.
- `apps/mcp-server/README.md` — uso + config Claude Desktop.
- `docs/runbooks/mcp-server.md` — operação.

**Modificar:**
- `docs/ARCHITECTURE.md` — MAC-46 done.

---

## Task 1: Scaffold do app

**Files:**
- Create: `apps/mcp-server/package.json`
- Create: `apps/mcp-server/tsconfig.json`
- Create: `apps/mcp-server/src/env.ts`

- [ ] **Step 1: `apps/mcp-server/package.json`**

```json
{
  "name": "@agent-platform/mcp-server",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "bin": { "agent-platform-mcp": "dist/index.js" },
  "scripts": {
    "dev": "tsx src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.12.0",
    "zod": "^3.24.2"
  },
  "devDependencies": {
    "@types/node": "^22.13.4",
    "tsx": "^4.19.3",
    "typescript": "^5.7.3"
  }
}
```

- [ ] **Step 2: `apps/mcp-server/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: `apps/mcp-server/src/env.ts`**

```ts
import { z } from 'zod';

const envSchema = z.object({
  ORCHESTRATOR_BASE_URL: z.string().url(),
  RUNNER_AUTH_TOKEN: z.string().min(1),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    // stderr — stdout é reservado para o protocolo MCP.
    console.error(`Invalid environment variables:\n${issues}`);
    process.exit(1);
  }
  return parsed.data;
}

export const env = loadEnv();
```

- [ ] **Step 4: Instalar e buildar (confirma resolução do SDK)**

Run: `rtk pnpm install && rtk pnpm --filter @agent-platform/mcp-server build`
Expected: install baixa `@modelcontextprotocol/sdk`; build compila (sem código ainda além do env.ts → tsc passa). Se o tsc reclamar de resolução de `@modelcontextprotocol/sdk/...`, parar e reportar (base usa `moduleResolution: Bundler`, que honra os subpath exports — não deveria falhar).

- [ ] **Step 5: Commit**

```bash
rtk git add apps/mcp-server pnpm-lock.yaml
rtk git commit -m "feat(mcp): scaffold do app @agent-platform/mcp-server (MAC-46)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Cliente REST fino (TDD)

**Files:**
- Create: `apps/mcp-server/src/client.ts`
- Create: `apps/mcp-server/src/client.test.ts`

- [ ] **Step 1: Escrever o teste que falha** — `apps/mcp-server/src/client.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { ApiError, createClient } from './client.js';

function mockFetch(status: number, body: unknown) {
  return vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  })) as unknown as typeof fetch;
}

function cfg(fetchImpl: typeof fetch) {
  return { baseUrl: 'http://orch:3000/', token: 'tkn', fetchImpl };
}

describe('createClient', () => {
  it('GET /runs com limit, Bearer e baseUrl sem barra final', async () => {
    const f = mockFetch(200, { runs: [] });
    const out = await createClient(cfg(f)).listRuns(10);
    expect(out).toEqual({ runs: [] });
    const call = (f as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0];
    expect(call[0]).toBe('http://orch:3000/runs?limit=10');
    expect(call[1].method).toBe('GET');
    expect((call[1].headers as Record<string, string>).authorization).toBe('Bearer tkn');
  });

  it('approveRun faz POST com query by', async () => {
    const f = mockFetch(200, { ok: true });
    await createClient(cfg(f)).approveRun('abc', 'claude');
    const call = (f as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0];
    expect(call[0]).toBe('http://orch:3000/runs/abc/approve?by=claude');
    expect(call[1].method).toBe('POST');
  });

  it('omite query quando o parâmetro é undefined', async () => {
    const f = mockFetch(200, {});
    await createClient(cfg(f)).listRuns();
    const call = (f as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0];
    expect(call[0]).toBe('http://orch:3000/runs');
  });

  it('listLessons monta repo na query', async () => {
    const f = mockFetch(200, { lessons: [] });
    await createClient(cfg(f)).listLessons('owner/repo');
    const call = (f as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0];
    expect(call[0]).toBe('http://orch:3000/lessons?repo=owner%2Frepo');
  });

  it('lança ApiError em resposta não-2xx', async () => {
    const f = mockFetch(404, 'not found');
    await expect(createClient(cfg(f)).getRun('x')).rejects.toBeInstanceOf(ApiError);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `rtk vitest run apps/mcp-server/src/client.test.ts`
Expected: FAIL — `createClient`/`ApiError` não existem.

- [ ] **Step 3: Implementar `apps/mcp-server/src/client.ts`**

```ts
export interface ClientConfig {
  baseUrl: string;
  token: string;
  /** Injetável para teste; default = fetch global. */
  fetchImpl?: typeof fetch;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`orchestrator respondeu ${status}: ${body}`);
    this.name = 'ApiError';
  }
}

export interface OrchestratorClient {
  listRuns(limit?: number): Promise<unknown>;
  getRun(id: string): Promise<unknown>;
  getRunSteps(id: string): Promise<unknown>;
  getRunApprovals(id: string): Promise<unknown>;
  listLessons(repo: string, limit?: number): Promise<unknown>;
  agentStatus(): Promise<unknown>;
  approveRun(id: string, by?: string): Promise<unknown>;
  rejectRun(id: string, by?: string): Promise<unknown>;
  pauseAgents(): Promise<unknown>;
  resumeAgents(): Promise<unknown>;
}

/** Monta `?a=b&c=d` ignorando valores undefined/vazios. */
function query(params: Record<string, string | number | undefined>): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') usp.set(k, String(v));
  }
  const s = usp.toString();
  return s ? `?${s}` : '';
}

/** Cria um cliente tipado sobre a REST API do orchestrator (Bearer em toda call). */
export function createClient(cfg: ClientConfig): OrchestratorClient {
  const doFetch = cfg.fetchImpl ?? fetch;
  const base = cfg.baseUrl.replace(/\/+$/, '');

  async function call(method: string, path: string): Promise<unknown> {
    const res = await doFetch(`${base}${path}`, {
      method,
      headers: { authorization: `Bearer ${cfg.token}` },
    });
    const text = await res.text();
    if (!res.ok) throw new ApiError(res.status, text);
    return text ? JSON.parse(text) : {};
  }

  const id = (v: string) => encodeURIComponent(v);

  return {
    listRuns: (limit) => call('GET', `/runs${query({ limit })}`),
    getRun: (runId) => call('GET', `/runs/${id(runId)}`),
    getRunSteps: (runId) => call('GET', `/runs/${id(runId)}/steps`),
    getRunApprovals: (runId) => call('GET', `/runs/${id(runId)}/approvals`),
    listLessons: (repo, limit) => call('GET', `/lessons${query({ repo, limit })}`),
    agentStatus: () => call('GET', '/admin/status'),
    approveRun: (runId, by) => call('POST', `/runs/${id(runId)}/approve${query({ by })}`),
    rejectRun: (runId, by) => call('POST', `/runs/${id(runId)}/reject${query({ by })}`),
    pauseAgents: () => call('POST', '/admin/pause'),
    resumeAgents: () => call('POST', '/admin/resume'),
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `rtk vitest run apps/mcp-server/src/client.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 5: Build**

Run: `rtk pnpm --filter @agent-platform/mcp-server build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
rtk git add apps/mcp-server/src/client.ts apps/mcp-server/src/client.test.ts
rtk git commit -m "feat(mcp): cliente REST fino sobre a API do orchestrator (TDD)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Registro das tools

**Files:**
- Create: `apps/mcp-server/src/tools.ts`

- [ ] **Step 1: Criar `apps/mcp-server/src/tools.ts`**

```ts
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { OrchestratorClient } from './client.js';

/** Executa a chamada e formata o resultado como conteúdo de tool MCP. */
async function asTool(fn: () => Promise<unknown>) {
  try {
    const data = await fn();
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: [{ type: 'text' as const, text: `Erro: ${msg}` }], isError: true };
  }
}

/** Registra as tools que expõem o orchestrator ao cliente MCP (MAC-46). */
export function registerTools(server: McpServer, client: OrchestratorClient): void {
  server.tool(
    'list_runs',
    'Lista execuções do agente, mais recentes primeiro.',
    { limit: z.number().int().positive().optional() },
    ({ limit }) => asTool(() => client.listRuns(limit)),
  );

  server.tool('get_run', 'Detalha um run pelo id.', { id: z.string() }, ({ id }) =>
    asTool(() => client.getRun(id)),
  );

  server.tool(
    'get_run_steps',
    'Etapas (plan/code/review) de um run, com tempo e custo.',
    { id: z.string() },
    ({ id }) => asTool(() => client.getRunSteps(id)),
  );

  server.tool(
    'get_run_approvals',
    'Aprovações de um run e seus motivos.',
    { id: z.string() },
    ({ id }) => asTool(() => client.getRunApprovals(id)),
  );

  server.tool(
    'list_lessons',
    'Lições aprendidas (Memory Layer) acumuladas para um repo.',
    { repo: z.string(), limit: z.number().int().positive().optional() },
    ({ repo, limit }) => asTool(() => client.listLessons(repo, limit)),
  );

  server.tool('agent_status', 'Status do agente (pausado ou ativo).', {}, () =>
    asTool(() => client.agentStatus()),
  );

  server.tool(
    'approve_run',
    'Aprova um run pausado e retoma a execução.',
    { id: z.string(), by: z.string().optional() },
    ({ id, by }) => asTool(() => client.approveRun(id, by)),
  );

  server.tool(
    'reject_run',
    'Reprova um run pausado (encerra).',
    { id: z.string(), by: z.string().optional() },
    ({ id, by }) => asTool(() => client.rejectRun(id, by)),
  );

  server.tool('pause_agents', 'Pausa o processamento de novos runs (kill switch).', {}, () =>
    asTool(() => client.pauseAgents()),
  );

  server.tool('resume_agents', 'Retoma o processamento de runs.', {}, () =>
    asTool(() => client.resumeAgents()),
  );
}
```

- [ ] **Step 2: Build**

Run: `rtk pnpm --filter @agent-platform/mcp-server build`
Expected: PASS. Se o tsc reclamar da assinatura de `server.tool(...)` (overloads do SDK), confira que a forma usada é `(name, description, zodRawShape, callback)`; o shape vazio `{}` é válido para tools sem parâmetro. Reporte se a versão do SDK divergir.

- [ ] **Step 3: Commit**

```bash
rtk git add apps/mcp-server/src/tools.ts
rtk git commit -m "feat(mcp): 10 tools (runs/lessons/status + approve/reject/pause/resume)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Bootstrap stdio

**Files:**
- Create: `apps/mcp-server/src/index.ts`

- [ ] **Step 1: Criar `apps/mcp-server/src/index.ts`**

```ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createClient } from './client.js';
import { env } from './env.js';
import { registerTools } from './tools.js';

async function main(): Promise<void> {
  const client = createClient({
    baseUrl: env.ORCHESTRATOR_BASE_URL,
    token: env.RUNNER_AUTH_TOKEN,
  });
  const server = new McpServer({ name: 'agent-platform', version: '0.0.0' });
  registerTools(server, client);
  // stdout é do protocolo MCP — logs sempre no stderr.
  await server.connect(new StdioServerTransport());
  console.error('agent-platform MCP server ligado (stdio)');
}

main().catch((err) => {
  console.error('falha ao iniciar o MCP server:', err);
  process.exit(1);
});
```

- [ ] **Step 2: Build + smoke (o server sobe e fica aguardando stdio)**

Run: `rtk pnpm --filter @agent-platform/mcp-server build && ORCHESTRATOR_BASE_URL=http://localhost:3000 RUNNER_AUTH_TOKEN=dummy timeout 3 node apps/mcp-server/dist/index.js; echo "exit=$?"`
Expected: build PASS; ao rodar, imprime no stderr `agent-platform MCP server ligado (stdio)` e fica aguardando (o `timeout 3` mata → `exit=124`). Não deve sair com erro de env nem crashar.

- [ ] **Step 3: Commit**

```bash
rtk git add apps/mcp-server/src/index.ts
rtk git commit -m "feat(mcp): bootstrap stdio do MCP server (MAC-46)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Documentação

**Files:**
- Create: `apps/mcp-server/README.md`
- Create: `docs/runbooks/mcp-server.md`

- [ ] **Step 1: Criar `apps/mcp-server/README.md`**

````markdown
# @agent-platform/mcp-server

Servidor MCP (stdio) que expõe o orchestrator a clientes MCP como o Claude Desktop.
É uma fachada tipada sobre a REST API — não acessa banco nem fila.

## Tools

| Tool | Faz |
|---|---|
| `list_runs` | Lista execuções (mais recentes) |
| `get_run` | Detalha um run |
| `get_run_steps` | Etapas com tempo/custo |
| `get_run_approvals` | Aprovações e motivos |
| `list_lessons` | Lições do Memory Layer por repo |
| `agent_status` | Pausado/ativo |
| `approve_run` | Aprova e retoma um run pausado |
| `reject_run` | Reprova (encerra) |
| `pause_agents` | Kill switch — pausa novos runs |
| `resume_agents` | Retoma |

## Env

| Var | Exemplo |
|---|---|
| `ORCHESTRATOR_BASE_URL` | `http://10.10.0.11:3000` |
| `RUNNER_AUTH_TOKEN` | token compartilhado orchestrator↔runner |

## Build

```bash
pnpm --filter @agent-platform/mcp-server build
```

## Config no Claude Desktop

`claude_desktop_config.json` (rodar onde alcança o orchestrator):

```json
{
  "mcpServers": {
    "agent-platform": {
      "command": "node",
      "args": ["/ABS/PATH/agent-platform/apps/mcp-server/dist/index.js"],
      "env": {
        "ORCHESTRATOR_BASE_URL": "http://10.10.0.11:3000",
        "RUNNER_AUTH_TOKEN": "<token>"
      }
    }
  }
}
```

Se a máquina do Claude Desktop não alcança a rede isolada `10.10.0.x`, rodar via
ssh num host que alcança — ver `docs/runbooks/mcp-server.md`.
````

- [ ] **Step 2: Criar `docs/runbooks/mcp-server.md`**

````markdown
# Runbook — MCP Server

Expõe o orchestrator ao Claude Desktop via MCP (stdio). Detalhes e tools:
[`apps/mcp-server/README.md`](../../apps/mcp-server/README.md).

## Reachability

O orchestrator (`10.10.0.11:3000`) está na rede isolada `vmbr1`. O processo do
MCP server precisa alcançá-lo. Duas formas:

### A. Local (laptop alcança o orchestrator)
Só funciona se a API estiver acessível da LAN (ex.: um DNAT como o do Grafana —
ver `grafana-lan-access.md`). **Atenção:** a API tem ações sensíveis
(`approve`/`pause`); só exponha em rede confiável.

```json
{
  "mcpServers": {
    "agent-platform": {
      "command": "node",
      "args": ["/ABS/PATH/agent-platform/apps/mcp-server/dist/index.js"],
      "env": {
        "ORCHESTRATOR_BASE_URL": "http://api.agent.local:3000",
        "RUNNER_AUTH_TOKEN": "<token>"
      }
    }
  }
}
```

### B. Via ssh (recomendado — sem expor a API)
O Claude Desktop spawna o server **no host**, que alcança o orchestrator por
localhost da rede interna. Mantém a API fora da LAN.

```json
{
  "mcpServers": {
    "agent-platform": {
      "command": "ssh",
      "args": [
        "root@192.168.0.10",
        "ORCHESTRATOR_BASE_URL=http://10.10.0.11:3000 RUNNER_AUTH_TOKEN=<token> node /opt/agent-platform/apps/mcp-server/dist/index.js"
      ]
    }
  }
}
```

Requer o repo buildado no host e chave ssh sem senha. O server só fala stdio, então
o ssh transporta o protocolo direto.

## Segurança

- O `RUNNER_AUTH_TOKEN` dá acesso às ações de admin — trate como secret. Rotacione
  junto do token do orchestrator (ver `secrets.md`).
- Tools de ação (`approve_run`, `pause_agents`...) executam de verdade. Em dúvida,
  use só as de leitura.
````

- [ ] **Step 3: Commit**

```bash
rtk git add apps/mcp-server/README.md docs/runbooks/mcp-server.md
rtk git commit -m "docs(mcp): README do app + runbook de operação (reachability/ssh)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Verificação final + docs do projeto

**Files:**
- Modify: `docs/ARCHITECTURE.md`

- [ ] **Step 1: Build + testes do monorepo**

Run: `rtk pnpm -r build && rtk vitest run`
Expected: build de todos os pacotes PASS; testes PASS — 49 (44 + 5 do client).

- [ ] **Step 2: Atualizar `docs/ARCHITECTURE.md`** — na tabela §3, linha "Escala (registries, artifacts, vector, MCP, multiagente)", trocar para refletir o MCP feito:

```
| Escala (registries, artifacts, vector, MCP, multiagente) | MAC-42..47 | `apps/mcp-server`, `packages/*` | MCP server ✅ (`apps/mcp-server`); registries/artifacts/vector/multiagente ⏳ |
```

- [ ] **Step 3: Commit + push**

```bash
rtk git add docs/ARCHITECTURE.md
rtk git commit -m "docs(architecture): MCP server (MAC-46) entregue

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
rtk git push
```

---

## Deploy + uso (pós-merge — o usuário roda)

1. Buildar o app onde for rodar: `pnpm --filter @agent-platform/mcp-server build`.
2. Configurar `claude_desktop_config.json` (variante local ou ssh — ver runbook).
3. Reiniciar o Claude Desktop; as 10 tools `agent-platform` aparecem. Testar:
   "liste os últimos runs", "qual o status do agente", "aprove o run <id>".

---

## Self-Review

**Spec coverage:**
- Servidor MCP stdio, fachada sobre a REST API → Tasks 1-4. ✅
- Cliente HTTP fino, DI, testável → Task 2. ✅
- 10 tools (leitura + ações) mapeando os endpoints → Task 3. ✅
- Auth Bearer em toda call → Task 2 (`headers.authorization`). ✅
- Error handling não-fatal (isError + try/catch nos handlers) → Tasks 2/3 (`ApiError` + `asTool`). ✅
- Testes do client (método/URL/headers/query/erro) → Task 2 (5 casos). ✅
- Documentação (README + config Claude Desktop + runbook) → Task 5. ✅
- Não-objetivos respeitados (sem trigger_run, sem HTTP remoto, sem resources/prompts) → não há tasks pra eles. ✅

**Placeholder scan:** sem TODO/TBD; código e comandos completos. `/ABS/PATH` e `<token>` são marcadores de config que o usuário preenche (documentação), não placeholders de implementação.

**Type consistency:** `OrchestratorClient` (Task 2) tem os métodos `listRuns/getRun/getRunSteps/getRunApprovals/listLessons/agentStatus/approveRun/rejectRun/pauseAgents/resumeAgents`, consumidos por `registerTools` (Task 3) e instanciados em `index.ts` (Task 4) via `createClient({ baseUrl, token })`. `ApiError` exportado (Task 2) usado no teste. `env.ORCHESTRATOR_BASE_URL`/`env.RUNNER_AUTH_TOKEN` (Task 1) usados na Task 4. Assinatura `server.tool(name, description, zodRawShape, cb)` consistente nas 10 tools.

**Risco anotado:** versão do `@modelcontextprotocol/sdk` — o plano usa `server.tool(name, description, shape, cb)` e os subpaths `server/mcp.js`/`server/stdio.js` (estáveis na linha 1.x). Tasks 1/3 mandam reportar se a API divergir, em vez de adivinhar.
