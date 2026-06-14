# MCP server no Proxmox (zero-túnel) — Design

**Data:** 2026-06-14
**Issue:** follow-up do MAC-46 (MCP server)
**Status:** aprovado

## Problema

O `apps/mcp-server` (facade stdio sobre a REST API do orchestrator) hoje roda
**localmente no laptop** e só funciona com um túnel SSH manual de pé
(`ssh -fN -L 3000:10.10.0.11:3000 root@192.168.0.10`). O túnel:

- cai a cada restart do orchestrator (passo manual recorrente);
- expõe a porta 3000 no laptop;
- faz o tráfego da API sair da rede isolada vmbr1.

Objetivo: rodar o mcp-server **dentro da infra** (LXC 201), de modo que ele
alcance a API por `localhost`, o cliente conecte via cadeia ssh→container e
**nenhum túnel** seja necessário. A API nunca sai da vmbr1.

## Decisão de empacotamento

Rodar o servidor **dentro do container `orchestrator-api-1` já existente** (LXC
201), spawnado por conexão via `docker exec -i`. Alternativas descartadas:

- **Node nativo na LXC 201** — adicionaria runtime node a uma LXC que só tinha
  Docker, mais um target de deploy e mecanismo de passagem de token. Sem ganho
  sobre reusar o container.
- **Container Docker dedicado** — nova imagem + join de rede + passagem de
  token; peças demais para um facade stdio.

O container do orchestrator já tem tudo: node 22, `RUNNER_AUTH_TOKEN` no env, a
API em `localhost:3000` e os `node_modules` do workspace. Falta só o `dist` do
mcp-server na imagem.

## Arquitetura

### 1. Build (imagem do orchestrator)

`apps/orchestrator-api/Dockerfile`, stage `build`: adicionar o mcp-server ao
comando de build.

```dockerfile
RUN pnpm --filter "@agent-platform/orchestrator-api..." \
         --filter "@agent-platform/mcp-server..." build
```

`@agent-platform/mcp-server` só depende de `@modelcontextprotocol/sdk` e `zod`
(externos) — buildado isoladamente (`tsc` → `apps/mcp-server/dist/index.js`). O
stage `deploy` já faz `COPY --from=build /app /app`, então o dist entra na
imagem. Nenhuma outra mudança no Dockerfile, compose ou `deploy.sh`.

### 2. Runtime

Sem processo persistente novo. Cada conexão MCP spawna um `node` efêmero dentro
do container já rodando, via `docker exec -i`. Variáveis:

- `RUNNER_AUTH_TOKEN` — **herdado** do env do container do orchestrator.
- `ORCHESTRATOR_BASE_URL=http://localhost:3000` — passado via `-e` no exec. A API
  escuta nessa porta dentro do próprio container → a chamada nunca sai dele.

Logs do mcp-server já vão exclusivamente para stderr (stdout reservado ao
protocolo MCP) — confirmado em `apps/mcp-server/src` (MAC-46).

### 3. Transporte (config do cliente)

Config MCP do Claude Code no laptop:

```
command: ssh
args:
  - -T
  - root@192.168.0.10
  - pct
  - exec
  - "201"
  - --
  - docker
  - exec
  - -i
  - -e
  - ORCHESTRATOR_BASE_URL=http://localhost:3000
  - orchestrator-api-1
  - node
  - /app/apps/mcp-server/dist/index.js
```

Cadeia: `ssh -T` (sem tty, sem MOTD no stdout) → `pct exec 201` (o host alcança a
LXC isolada sem sshd dentro dela) → `docker exec -i` (pipe binário limpo,
bidirecional). O resultado é um transporte stdio equivalente ao local.

### 4. Deploy

`bash infra/deploy/deploy.sh orchestrator` no host Proxmox (build `--no-cache`,
gotcha conhecido do cache Docker) passa a incluir o dist do mcp-server. Sem
migration, sem target novo no deploy.sh.

### 5. Config local (substituição)

Substituir o registro MCP atual (`agent-platform`, apontando para
`localhost:3000` + túnel) pelo comando remoto acima
(`claude mcp remove agent-platform -s user` + `claude mcp add ...`). O túnel
deixa de ser necessário. O modo local+túnel fica documentado no runbook como
fallback (útil em dev local com a fonte na máquina).

### 6. Documentação

- Novo `docs/runbooks/mcp-proxmox.md`: comando do cliente pronto, como
  registrar/remover no Claude Code, troubleshooting (stdout sujo, container com
  nome diferente, handshake), e o fallback local+túnel.
- Atualizar `apps/mcp-server/README.md` com a seção "rodar no Proxmox
  (zero-túnel)" referenciando o runbook.

## Validação E2E

1. `deploy.sh orchestrator` no host → confirmar imagem nova com o dist
   (`pct exec 201 -- docker exec orchestrator-api-1 ls /app/apps/mcp-server/dist`).
2. Reconfigurar o cliente MCP no laptop (comando remoto).
3. `claude mcp list` → `agent-platform: ✔ Connected` (handshake).
4. Rodar a tool `list_runs` **sem túnel de pé** → retorna os runs reais.
5. Conferir stdout limpo (sem lixo de banner quebrando o JSON-RPC).

## Riscos e notas

- **Nome do container fixo** (`orchestrator-api-1`): derivado de project (dir
  `orchestrator`) + service (`api`). Documentado no runbook; se mudar, ajustar o
  arg. Alternativa robusta documentada como nota:
  `docker exec -i $(docker ps -qf name=orchestrator-api) ...` (via `sh -c`).
- **Stdout sujo**: mitigado por `ssh -T` + exec não-interativo. Se algum estágio
  poluir stdout, isolar com um wrapper. Validar no passo 5 do E2E.
- **Acoplamento de lifecycle**: mudar o mcp-server passa a exigir rebuild do
  orchestrator. Aceitável — o mcp-server muda raramente e é facade desta API.
- **Concorrência**: 1 processo node efêmero por conexão dentro do container
  (leve, sem estado compartilhado).

## Fora de escopo

- Target dedicado no `deploy.sh` (não necessário com Approach 1).
- Autenticação/transporte para clientes fora da LAN (remoto via internet).
- Migração do mcp-server para SSE/HTTP transport (continua stdio).
