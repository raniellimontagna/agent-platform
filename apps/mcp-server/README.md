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
| `list_lessons` | Lições do Memory Layer por repo; com `query`, busca semântica por relevância |
| `list_agents` | Lista agentes registrados (catálogo) → `GET /agents` |
| `get_agent` | Detalha um agente pelo id → `GET /agents/:id` |
| `list_tools` | Lista ferramentas registradas (catálogo) → `GET /tools` |
| `get_tool` | Detalha uma ferramenta pelo id → `GET /tools/:id` |
| `agent_status` | Pausado/ativo → `GET /admin/status` |
| `agent_concurrency` | Limite configurado, runs ativos e contagem por status → `GET /admin/concurrency` |
| `get_stats` | Resumo agregado (runs, custo, lições, taxa de sucesso, auto-correção) |
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
ssh num host que alcança — ver [`docs/runbooks/mcp-server.md`](../../docs/runbooks/mcp-server.md).

## Rodar no Proxmox (zero-túnel)

Em produção o servidor roda dentro do container `orchestrator-api-1` (LXC 201),
sem túnel SSH. O cliente conecta por ssh→`pct exec`→`docker exec`. Comando de
registro e troubleshooting em [`docs/runbooks/mcp-proxmox.md`](../../docs/runbooks/mcp-proxmox.md).
