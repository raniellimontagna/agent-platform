# MCP Server (MAC-46) — design

> Spec de design. Data: 2026-06-12. Time `MAC`, projeto *Orquestrador de Agentes com LangGraph*.
> Card: MAC-46 (Fase 7).

## Problema

O orchestrator só é dirigível por webhook do Linear (disparar runs) e por chamadas
REST diretas (aprovar, pausar, inspecionar). Não há como **inspecionar e operar** o
agente de fora — de um cliente MCP como o Claude Desktop. O DoD do MAC-46:
ferramentas registradas, autenticação, documentação.

## Objetivo

Um servidor MCP que expõe as capacidades do orchestrator como **tools** MCP, para
um cliente (Claude Desktop) listar/inspecionar runs, ver lições, e
aprovar/reprovar/pausar — conversando com o agente em linguagem natural.

## Decisões (do brainstorm)

- **Transporte:** stdio. O cliente MCP spawna o processo (local ou via
  `ssh host node ...`). Padrão do Claude Desktop, código simples, não expõe a API
  do orchestrator na LAN.
- **Acoplamento:** fachada tipada sobre a **REST API existente** (cliente HTTP fino).
  Zero acesso a DB/fila. Reusa a autenticação por Bearer token.
- **Tools:** leitura + ações (aprovar/reprovar/pausar/retomar).

## Arquitetura

```
Claude Desktop ──stdio──> apps/mcp-server ──HTTP + Bearer──> orchestrator REST API
   (MCP client)            (@modelcontextprotocol/sdk)        (já existe, :3000)
```

O `mcp-server` roda onde alcança o orchestrator (no host via ssh, ou local se a API
estiver acessível). Não introduz nova superfície de rede no orchestrator.

## Componentes — `apps/mcp-server/src/`

- **`env.ts`** — valida `ORCHESTRATOR_BASE_URL` e `RUNNER_AUTH_TOKEN` (zod).
- **`client.ts`** — cliente REST fino: uma função tipada por endpoint, montando
  método/URL/headers (`Authorization: Bearer`)/query/body sobre `fetch`. Devolve o
  JSON parseado ou lança em não-2xx. **Unidade testável** (fetch mockado).
- **`tools.ts`** — define as tools (nome, descrição, input schema zod) e os handlers
  que chamam o `client` e formatam a resposta. Cada handler tem try/catch → nunca
  derruba o server.
- **`index.ts`** — bootstrap: cria o `Server` do SDK, conecta `StdioServerTransport`,
  registra as tools.

## Tools (cada uma mapeia 1 endpoint existente)

| Tool | Input | Endpoint |
|---|---|---|
| `list_runs` | `{ limit?: number }` | `GET /runs?limit=` |
| `get_run` | `{ id: string }` | `GET /runs/:id` |
| `get_run_steps` | `{ id: string }` | `GET /runs/:id/steps` |
| `get_run_approvals` | `{ id: string }` | `GET /runs/:id/approvals` |
| `list_lessons` | `{ repo: string, limit?: number }` | `GET /lessons?repo=&limit=` |
| `agent_status` | `{}` | `GET /admin/status` |
| `approve_run` | `{ id: string, by?: string }` | `POST /runs/:id/approve?by=` |
| `reject_run` | `{ id: string, by?: string }` | `POST /runs/:id/reject?by=` |
| `pause_agents` | `{}` | `POST /admin/pause` |
| `resume_agents` | `{}` | `POST /admin/resume` |

Resposta de cada tool = o JSON da API como texto (`content: [{ type: 'text', ... }]`).

## Autenticação

O `mcp-server` guarda `RUNNER_AUTH_TOKEN` e envia `Authorization: Bearer <token>`
em **todas** as chamadas. Os endpoints de admin exigem; os demais ignoram (envio
uniforme é simples e future-proof). O token é passado por env na config do cliente
MCP (`mcpServers.<name>.env`), nunca commitado.

## Error handling

- Resposta HTTP não-2xx → a tool retorna `isError: true` com status + corpo (o
  cliente vê o erro, o server segue vivo).
- Timeout/conexão recusada → mensagem clara ("orchestrator inacessível em <url>").
- Todo handler tem try/catch; nenhuma exceção encerra o transporte stdio.

## Testes

- `client.ts` com `fetch` mockado: cada função assere método, URL (com query),
  header `Authorization`, e body quando aplicável; e o tratamento de não-2xx
  (lança/erro). ~6–8 casos cobrindo read + ações.
- Handlers de tool são finos sobre o client — smoke test opcional.

## Documentação (DoD)

- `apps/mcp-server/README.md` — o que é, tools, como rodar.
- Snippet de `claude_desktop_config.json` (entry `mcpServers` com `command`, `args`,
  `env`), incluindo a variante via `ssh` para alcançar o orchestrator isolado.
- `docs/runbooks/mcp-server.md` — operação: rodar local vs via ssh, reachability do
  orchestrator, rotação do token.

## Não-objetivos (YAGNI)

- `trigger_run` (criar run manual) — exigiria novo endpoint no orchestrator; runs
  nascem do webhook do Linear. Futuro.
- Transporte HTTP/streamable remoto — evolução posterior.
- MCP *resources* e *prompts* — só *tools* no MVP.
- Backfill / mudanças na REST API existente — o server só consome o que já há.
