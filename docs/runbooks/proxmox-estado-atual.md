# Runbook — Estado atual do ambiente Proxmox

Snapshot operacional do que está provisionado no host Proxmox, mais os "gotchas"
descobertos na prática. Complementa o [proxmox-setup.md](./proxmox-setup.md) (que
descreve o passo a passo do zero). **Leia isto antes de mexer no ambiente de outra
máquina** — evita re-descobrir as armadilhas abaixo.

> Última atualização: 2026-06-16 (auto-merge opt-in, loop critic 3x,
> identidade de commits do agente e dashboards validados em prod).

---

## Estado provisionado

Bloco de IDs do agent-platform: **200–203** (separado dos serviços pessoais do host,
que ocupam 100–115 e 400 — **não tocar nesses**).

| ID  | Serviço             | Tipo | IP (vmbr1)   | Storage    | Recursos          | Estado                          |
|-----|---------------------|------|--------------|------------|-------------------|---------------------------------|
| 200 | agent-gateway       | LXC  | 10.10.0.10   | local-lvm  | 1 vCPU / 1GB / 8GB  | running + Docker, snapshot ✅   |
| 201 | agent-orchestrator  | LXC  | 10.10.0.11   | local-lvm  | 2 vCPU / 2GB / 20GB | running + Docker, snapshot ✅   |
| 202 | agent-runners       | VM   | 10.10.0.12   | backup-hd  | 2 vCPU / 4GB / 40GB | running + Docker/node/pnpm, vzdump ✅ |
| 203 | agent-observability | LXC  | 10.10.0.13   | backup-hd  | 1 vCPU / 2GB / 16GB | running + Docker, vzdump ✅     |

Sizing centralizado em `infra/proxmox/config.sh`.

### Rede

- Bridge interna **vmbr1** = `10.10.0.1/24` (host faz de gateway).
- **NAT** `10.10.0.0/24 → vmbr0` via iptables (regra persistida em `/etc/iptables/rules.v4`).
- `ip_forward=1` permanente em `/etc/sysctl.conf`.
- Validado: gateway e runner alcançam a internet pela NAT.
- Criado por `infra/proxmox/setup-network.sh` (idempotente — checa se a bridge já existe).

### Storage

- **local-lvm** (SSD, lvmthin): rápido, mas thin pool já em ~85% — zona de risco.
  Só serviços leves (gateway, orchestrator). Suporta snapshot nativo.
- **backup-hd** (HDD, dir): folgado (~540GB livres). Cargas grandes/efêmeras
  (runner, logs). Tem content `images,rootdir,backup` habilitado. **Não suporta
  snapshot live** (ver gotcha #1).

---

## Gotchas (armadilhas confirmadas na prática)

### 1. `backup-hd` é storage tipo `dir` → não tem snapshot live

LXC em dir storage **nunca** suporta `pct snapshot`; disco de VM em formato `raw` em
dir também não suporta `qm snapshot`. Por isso só 200/201 (local-lvm/lvmthin) têm o
snapshot `initial-clean`.

**Baseline de 202/203 é feita via `vzdump`**, não snapshot:

```bash
# VM (QEMU faz backup live, não precisa de snapshot de storage)
vzdump 202 --storage backup-hd --mode snapshot --compress zstd

# LXC em dir (snapshot mode falha → usar suspend, que faz pausa breve)
vzdump 203 --storage backup-hd --mode suspend --compress zstd
```

Restore: `qmrestore` (VM) / `pct restore` (LXC) a partir do arquivo em
`backup-hd:backup/...`.

### 1.5. Orchestrator (201): disco de 20GB aperta com a imagem do onnxruntime

O `@huggingface/transformers` (Vector Memory, MAC-45) puxa `onnxruntime-node`, que
empacota providers GPU (CUDA/TensorRT, ~GB) e binários de outras arquiteturas que
**não usamos** (embeddings rodam CPU/linux-x64). No primeiro deploy a imagem estourou
o disco do LXC 201 (`no space left on device` no export). Dois remédios:

```bash
# Liberar cache de build acumulado (costuma reclamar GBs):
pct exec 201 -- docker builder prune -af
# Crescer o disco do LXC se precisar de folga:
pct resize 201 rootfs +10G
```

O `Dockerfile` do orchestrator já corta os `.so` de CUDA/TensorRT + dirs win32/darwin/
arm64 no build (corta ~GB) — pega no próximo `deploy.sh orchestrator`. Postgres usa a
imagem `pgvector/pgvector:pg16` (mesmo PG16, volume compatível).

### 2. Runner (202): node/pnpm via nvm não estão no PATH de shell não-interativo

O runner instala Node via nvm (`~/.nvm`). `node`/`pnpm` só aparecem no PATH quando o
nvm é carregado. Shell **não-interativo** (ex.: orchestrator disparando build via SSH)
não source o `~/.bashrc` → dá `node: command not found`.

```bash
# Sempre carregar o nvm antes de usar node em comando remoto:
ssh runner@10.10.0.12 'source ~/.nvm/nvm.sh; node --version; pnpm --version'
```

Versões instaladas: Node v24 LTS + pnpm.

---

## Troubleshooting (problemas que já aconteceram)

### `provision-*.sh` aborta com "bridge 'vmbr1' não existe"

A bridge precisa existir **antes** de provisionar. Rode `setup-network.sh` primeiro
(o `require_bridge()` em `config.sh` aborta de propósito se faltar).

### `provision-runners.sh` falha no Docker com "Could not get lock /var/lib/apt/lists/lock"

O `sleep 60` do script às vezes não basta: o **cloud-init ainda está rodando apt**
quando o pós-provisionamento por SSH tenta `apt-get`. Resultado: VM fica pela metade
(Docker/node/tools/ufw e snapshot não rodam).

Correção — esperar o cloud-init terminar e então completar manualmente:

```bash
ssh runner@10.10.0.12 'cloud-init status --wait'   # bloqueia até 'done'
# então re-rodar o bloco de pós-provisionamento (docker + tools + ufw) via SSH
```

Não re-rode `provision-runners.sh` inteiro — não é idempotente (`qm create 202` falha
se a VM já existe).

### SSH key ausente quebra o runner

A VM runner usa cloud-init com `--ciuser runner` **sem senha**. Sem
`~/.ssh/id_ed25519.pub` no host, o cloud-init não injeta chave e o pós-provisionamento
por SSH não autentica. Gere antes:

```bash
ssh-keygen -t ed25519 -N '' -f ~/.ssh/id_ed25519
```

### Resíduo de provisionamento parcial

Se um provisionamento falhar no meio, pode sobrar um LXC/VM parcial. Confirme que é do
bloco do agent-platform (hostname `agent-*`, net em vmbr1) **antes** de remover:

```bash
pct config <ID>        # conferir hostname/rede
pct destroy <ID>       # LXC
qm destroy <ID>        # VM
```

---

## Status do deploy

> **Atualização 2026-06-16 (MAC-67 pós-deploy):** auto-merge opt-in validado em
> produção com issues descartáveis `MAC-84` e `MAC-85`. Fluxo confirmado:
> `ai-ready` + `auto-merge` cria run, pausa em aprovação humana, `approved`
> retoma via webhook Linear, abre PR, mergeia automaticamente na `main`, remove
> branch remota e move a issue para `Done`.
>
> **Loop critic:** `AGENT_MAX_REVIEW_ROUNDS=3` está ativo no orchestrator. O E2E
> `MAC-85` exercitou as 3 voltas de revisão e terminou com
> `APROVADO COM RESSALVAS`; a ressalva operacional não bloqueou o auto-merge.
>
> **Identidade de commits do agente:** runner em produção recebe
> `GIT_AUTHOR_NAME=Ranielli Montagna`,
> `GIT_AUTHOR_EMAIL=raniellimontagna@hotmail.com`,
> `GIT_COAUTHOR_NAME=Codex` e `GIT_COAUTHOR_EMAIL=noreply@openai.com`.
> Commit real validado: `ff9460f` em `MAC-85`, com autor/committer corretos e
> trailer `Co-authored-by: Codex <noreply@openai.com>`.
>
> **Observabilidade:** dashboards Grafana provisionados com painéis de
> auto-merge, vereditos do critic, ressalvas, sandbox e custo code+critic. API do
> Grafana confirmou os painéis carregados após deploy de `observability`.
> Alertas Prometheus ativos para health de orchestrator/runners/gateway/Grafana/Loki,
> disco (`warning >85%`, `critical >92%`) e regressão `REPROVADO` com PR
> pós-hardening. O LXC 201 chegou a ~80% por build cache Docker; `docker builder
> prune -af` reduziu o uso para ~24%. O `infra/deploy/deploy.sh` agora imprime
> `docker system df` e roda `docker builder prune -af` ao final de deploys de build
> (`orchestrator` e `runners`).
>
> Resposta manual se alerta de disco disparar:
> `pct exec 201 -- docker system df` / `ssh runner@10.10.0.12 docker system df`;
> se o consumo for `Build Cache`, rodar `docker builder prune -af`. Não apagar
> `/opt/agent-platform/postgres`, `/opt/agent-platform/redis` nem volumes de dados.

> **Atualização 2026-06-16:** runner MAC-28 usa Docker como sandbox executor em
> produção: cada comando de validação roda em container efêmero com o worktree
> montado, sem herdar secrets do worker. Config principal:
> `AGENT_SANDBOX_BACKEND=docker`, `AGENT_SANDBOX_IMAGE`,
> `AGENT_SANDBOX_NETWORK`, `AGENT_SANDBOX_CPUS`, `AGENT_SANDBOX_MEMORY` e
> `AGENT_SANDBOX_PIDS_LIMIT`.

> **Atualização 2026-06-15 (Fase 7 deployada):** as 4 VMs estão deployadas e o loop
> autônomo roda ponta a ponta em prod. Orchestrator com Postgres+pgvector (migrations
> 0000→0009), embeddings locais, registries de agente/tool, scheduler, artifact store
> e execução paralela de runs (`AGENT_MAX_CONCURRENCY`). Endpoints novos validados em
> prod: `/agents`, `/tools`, `/lessons?query=`, `/admin/concurrency`. A tabela abaixo
> documenta os bloqueios **originais** de cada serviço (referência histórica) — hoje
> todos resolvidos. Deploy de cada serviço via `infra/deploy/deploy.sh <svc>`.
>
> **Gotcha de migration (pgvector):** o drizzle migrator é transacional por lote —
> se uma migration falha, o lote inteiro dá rollback. A 0009 (índice único de issue
> ativa) falha se houver runs ativos duplicados (limpar com
> `UPDATE runs SET status='cancelled' WHERE status IN ('awaiting_approval','pending')`).
> Re-rodar migrate via container no ar (evita quebra de paste em comando longo):
> `pct exec 201 -- docker exec orchestrator-api-1 node dist/db/migrate.js`, depois
> `docker restart orchestrator-api-1` pra rodar os seeds (agents/tools) no boot.

Bloqueios originais antes do primeiro deploy dos composes em `infra/compose/<vm>/`:

| Serviço       | Bloqueio                                                                 |
|---------------|--------------------------------------------------------------------------|
| gateway       | Chaves LLM: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `VERBOO_API_KEY`       |
| orchestrator  | `LINEAR_API_KEY`, `GITHUB_TOKEN`, `LITELLM_API_KEY`, creds Postgres       |
| runners       | Histórico: dependia da implementação do `apps/worker-code`; hoje resolvido |
| observability | Só `GRAFANA_USER`/`GRAFANA_PASSWORD` — sobe sem secret externo            |

Passos interativos ainda pendentes (não automatizáveis sem o usuário):

- **Tailscale** em cada VM (`tailscale up` — login interativo).
- **DNS interno** no Pi-hole (`192.168.0.14`): `llm.agent.local → 10.10.0.10`,
  `api.agent.local → 10.10.0.11`. O `grafana.agent.local` aponta para o **host**
  (`192.168.0.10`), que faz DNAT da porta 3000 para `10.10.0.13` — assim o Grafana
  é acessível na LAN sem ssh. Ver [`grafana-lan-access.md`](./grafana-lan-access.md).

Sequência de deploy por VM: ver [proxmox-setup.md → Passo 4](./proxmox-setup.md).
