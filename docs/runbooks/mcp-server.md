# Runbook — MCP Server

Expõe o orchestrator ao Claude Desktop via MCP (stdio). Detalhes e tools:
[`apps/mcp-server/README.md`](../../apps/mcp-server/README.md).

## Reachability

O orchestrator (`10.10.0.11:3000`) está na rede isolada `vmbr1`. O processo do
MCP server precisa alcançá-lo. Duas formas:

### A. Local (laptop alcança o orchestrator)
Só funciona se a API estiver acessível da LAN (ex.: um DNAT como o do Grafana —
ver [`grafana-lan-access.md`](./grafana-lan-access.md)). **Atenção:** a API tem
ações sensíveis (`approve`/`pause`); só exponha em rede confiável.

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
O Claude Desktop spawna o server **no host**, que alcança o orchestrator pela rede
interna. Mantém a API fora da LAN.

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
  junto do token do orchestrator (ver [`secrets.md`](./secrets.md)).
- Tools de ação (`approve_run`, `pause_agents`...) executam de verdade. Em dúvida,
  use só as de leitura.
