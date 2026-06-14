# MCP server no Proxmox (zero-túnel) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rodar o `apps/mcp-server` dentro do container `orchestrator-api-1` (LXC 201) e conectar o Claude Code via ssh→pct→docker exec, eliminando o túnel SSH.

**Architecture:** Estender a imagem do orchestrator para buildar também o mcp-server (já presente no repo, só falta o `dist`). O servidor é spawnado por conexão via `docker exec -i`, herdando `RUNNER_AUTH_TOKEN` do container e usando `localhost:3000` para a API. Cliente conecta por uma cadeia ssh→`pct exec 201`→`docker exec -i`. Documentação em runbook + README.

**Tech Stack:** Docker multi-stage (node:22-slim), pnpm workspace filters, MCP stdio (@modelcontextprotocol/sdk), Claude Code MCP config.

Spec: `docs/superpowers/specs/2026-06-14-mcp-server-proxmox-design.md`

---

### Task 1: Incluir o mcp-server no build da imagem do orchestrator

**Files:**
- Modify: `apps/orchestrator-api/Dockerfile` (stage `build`, linha do `RUN pnpm ... build`)

- [ ] **Step 1: Editar o Dockerfile**

No stage `build`, trocar o comando de build para incluir o filtro do mcp-server:

```dockerfile
# Build do app + suas deps de workspace (llm, linear, graph) em ordem topológica.
# Inclui o mcp-server (facade stdio rodado via docker exec no Proxmox).
RUN pnpm --filter "@agent-platform/orchestrator-api..." \
         --filter "@agent-platform/mcp-server..." build
```

(Antes era só `RUN pnpm --filter "@agent-platform/orchestrator-api..." build`.)

- [ ] **Step 2: Buildar a imagem localmente e confirmar que o dist entra**

Run:
```bash
docker build -f apps/orchestrator-api/Dockerfile -t orch-mcp-check . \
  && docker run --rm --entrypoint sh orch-mcp-check -c 'ls apps/mcp-server/dist/index.js'
```
Expected: imprime `apps/mcp-server/dist/index.js` (arquivo existe na imagem). Sem o filtro novo, o `ls` falharia com "No such file".

- [ ] **Step 3: Limpar a imagem de teste**

Run: `docker image rm orch-mcp-check`
Expected: `Untagged/Deleted`.

- [ ] **Step 4: Commit**

```bash
rtk git add apps/orchestrator-api/Dockerfile
rtk git commit -m "build(mcp): builda o mcp-server na imagem do orchestrator (zero-túnel)"
```

---

### Task 2: Runbook do MCP no Proxmox

**Files:**
- Create: `docs/runbooks/mcp-proxmox.md`

- [ ] **Step 1: Criar o runbook**

```markdown
# Runbook — MCP server no Proxmox (zero-túnel)

O `apps/mcp-server` roda dentro do container `orchestrator-api-1` (LXC 201). O
Claude Code (laptop) conecta por uma cadeia ssh→pct→docker exec, sem túnel SSH.
A API nunca sai da rede isolada vmbr1 (chamada via `localhost:3000` dentro do
próprio container).

## Pré-requisitos

- `deploy.sh orchestrator` já rodado com a imagem que inclui `apps/mcp-server/dist`
  (ver `build(mcp): builda o mcp-server na imagem do orchestrator`).
- Acesso SSH ao host Proxmox (`root@192.168.0.10`).

## Registrar no Claude Code

Remover o registro antigo (local + túnel), se existir, e adicionar o remoto:

\`\`\`bash
claude mcp remove agent-platform -s user 2>/dev/null || true
claude mcp add agent-platform -s user -- \
  ssh -T root@192.168.0.10 pct exec 201 -- \
  docker exec -i -e ORCHESTRATOR_BASE_URL=http://localhost:3000 \
  orchestrator-api-1 node /app/apps/mcp-server/dist/index.js
\`\`\`

`RUNNER_AUTH_TOKEN` é herdado do env do container do orchestrator — não precisa
passar.

## Verificar

\`\`\`bash
claude mcp list
\`\`\`
Esperado: `agent-platform: ✔ Connected` (handshake). A primeira chamada de tool
(ex.: `list_runs`) bate na API real e retorna os runs — sem túnel de pé.

## Troubleshooting

- **stdout sujo / handshake falha:** algum estágio imprimiu lixo no stdout. O
  `ssh -T` (sem tty) já evita MOTD. Se persistir, testar a cadeia manual e
  inspecionar a primeira linha:
  `ssh -T root@192.168.0.10 pct exec 201 -- docker exec -i orchestrator-api-1 node /app/apps/mcp-server/dist/index.js < /dev/null`
  (deve sair sem imprimir nada no stdout além de erro de env, se houver).
- **Nome do container diferente:** o nome `orchestrator-api-1` vem de
  project (dir `orchestrator`) + service (`api`). Conferir com
  `pct exec 201 -- docker ps --format '{{.Names}}'`. Para robustez, usar:
  `... docker exec -i $(docker ps -qf name=orchestrator-api) node ...`
  (via `sh -c "..."`).
- **Token errado:** `pct exec 201 -- docker exec orchestrator-api-1 printenv RUNNER_AUTH_TOKEN`
  deve bater com o do runner.

## Fallback: modo local + túnel (dev)

Quando a fonte está no laptop (dev), dá pra rodar local apontando pro túnel:

\`\`\`bash
ssh -fN -L 3000:10.10.0.11:3000 root@192.168.0.10
claude mcp add agent-platform -s user \
  -e ORCHESTRATOR_BASE_URL=http://localhost:3000 \
  -e RUNNER_AUTH_TOKEN=<token> \
  -- node /caminho/agent-platform/apps/mcp-server/dist/index.js
\`\`\`
```

- [ ] **Step 2: Commit**

```bash
rtk git add docs/runbooks/mcp-proxmox.md
rtk git commit -m "docs(mcp): runbook do MCP no Proxmox (zero-túnel)"
```

---

### Task 3: Atualizar o README do mcp-server

**Files:**
- Modify: `apps/mcp-server/README.md`

- [ ] **Step 1: Ler o README atual para achar onde encaixar a seção**

Run: `rtk read apps/mcp-server/README.md`
Expected: ver as seções existentes (registro local Claude Code/Codex do MAC-46).

- [ ] **Step 2: Adicionar a seção de Proxmox**

Acrescentar (após a seção de registro local existente):

```markdown
## Rodar no Proxmox (zero-túnel)

Em produção o servidor roda dentro do container `orchestrator-api-1` (LXC 201),
sem túnel SSH. O cliente conecta por ssh→`pct exec`→`docker exec`. Comando de
registro e troubleshooting em [`docs/runbooks/mcp-proxmox.md`](../../docs/runbooks/mcp-proxmox.md).
```

- [ ] **Step 3: Commit**

```bash
rtk git add apps/mcp-server/README.md
rtk git commit -m "docs(mcp): aponta o README pro runbook do Proxmox"
```

---

### Task 4: Deploy + reconfiguração do cliente + E2E (operacional)

> Passos rodados pelo usuário (host Proxmox / laptop). O agente entrega os
> comandos e valida as saídas.

**Files:** nenhum (operacional).

- [ ] **Step 1: Push dos commits**

```bash
rtk git push
```

- [ ] **Step 2: Redeploy do orchestrator (host Proxmox)**

No host `192.168.0.10`:
```bash
cd ~/agent-platform && git pull && bash infra/deploy/deploy.sh orchestrator
```

- [ ] **Step 3: Confirmar o dist na imagem em prod (host Proxmox)**

```bash
pct exec 201 -- docker exec orchestrator-api-1 ls /app/apps/mcp-server/dist/index.js
```
Expected: imprime o caminho (arquivo existe no container em prod).

- [ ] **Step 4: Reconfigurar o cliente MCP (laptop)**

```bash
claude mcp remove agent-platform -s user 2>/dev/null || true
claude mcp add agent-platform -s user -- \
  ssh -T root@192.168.0.10 pct exec 201 -- \
  docker exec -i -e ORCHESTRATOR_BASE_URL=http://localhost:3000 \
  orchestrator-api-1 node /app/apps/mcp-server/dist/index.js
```

- [ ] **Step 5: Handshake (laptop)**

```bash
claude mcp list
```
Expected: `agent-platform: ✔ Connected`.

- [ ] **Step 6: E2E sem túnel (laptop)**

Garantir que NÃO há túnel de pé (`pkill -f '3000:10.10.0.11:3000'` se houver),
depois rodar a tool `list_runs` via Claude Code.
Expected: retorna os runs reais (ex.: MAC-49..MAC-62) — provando zero-túnel.

---

## Notas de execução

- Não há migration nem mudança no `deploy.sh`/compose — só Dockerfile + docs.
- A validação real (Task 4) depende de comandos no host/laptop que o usuário
  roda à mão; o agente confere as saídas coladas.
- Após o E2E verde, atualizar a memory (`agent-platform-state.md`) marcando o
  MCP-no-Proxmox como feito e o túnel como não mais necessário para o MCP.
