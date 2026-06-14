# Runbook — MCP server no Proxmox (zero-túnel)

O `apps/mcp-server` roda dentro do container `orchestrator-api-1` (LXC 201). O
Claude Code (laptop) conecta por uma cadeia ssh→pct→docker exec, sem túnel SSH.
A API nunca sai da rede isolada vmbr1 (chamada via `localhost:3000` dentro do
próprio container).

## Pré-requisitos

- `deploy.sh orchestrator` já rodado com a imagem que inclui `apps/mcp-server/dist`
  (ver commit `build(mcp): builda o mcp-server na imagem do orchestrator`).
- Acesso SSH ao host Proxmox (`root@192.168.0.10`).

## Registrar no Claude Code

Remover o registro antigo (local + túnel), se existir, e adicionar o remoto:

```bash
claude mcp remove agent-platform -s user 2>/dev/null || true
claude mcp add agent-platform -s user -- \
  ssh -T root@192.168.0.10 pct exec 201 -- \
  docker exec -i -e ORCHESTRATOR_BASE_URL=http://localhost:3000 \
  orchestrator-api-1 node /app/apps/mcp-server/dist/index.js
```

`RUNNER_AUTH_TOKEN` é herdado do env do container do orchestrator — não precisa
passar.

## Verificar

```bash
claude mcp list
```

Esperado: `agent-platform: ✔ Connected` (handshake). A primeira chamada de tool
(ex.: `list_runs`) bate na API real e retorna os runs — sem túnel de pé.

## Troubleshooting

- **stdout sujo / handshake falha:** algum estágio imprimiu lixo no stdout. O
  `ssh -T` (sem tty) já evita MOTD. Se persistir, testar a cadeia manual e
  inspecionar a saída:

  ```bash
  ssh -T root@192.168.0.10 pct exec 201 -- \
    docker exec -i orchestrator-api-1 node /app/apps/mcp-server/dist/index.js < /dev/null
  ```

  Não deve imprimir nada no stdout além de erro de env, se houver.
- **Nome do container diferente:** o nome `orchestrator-api-1` vem de
  project (dir `orchestrator`) + service (`api`). Conferir com
  `pct exec 201 -- docker ps --format '{{.Names}}'`. Para robustez, usar
  `docker exec -i $(docker ps -qf name=orchestrator-api) node ...` (via `sh -c "..."`).
- **Token errado:** `pct exec 201 -- docker exec orchestrator-api-1 printenv RUNNER_AUTH_TOKEN`
  deve bater com o do runner.

## Fallback: modo local + túnel (dev)

Quando a fonte está no laptop (dev), dá pra rodar local apontando pro túnel:

```bash
ssh -fN -L 3000:10.10.0.11:3000 root@192.168.0.10
claude mcp add agent-platform -s user \
  -e ORCHESTRATOR_BASE_URL=http://localhost:3000 \
  -e RUNNER_AUTH_TOKEN=<token> \
  -- node /caminho/agent-platform/apps/mcp-server/dist/index.js
```
