# Runbook — Estado atual do ambiente Proxmox

Snapshot operacional do que está provisionado no host Proxmox, mais os "gotchas"
descobertos na prática. Complementa o [proxmox-setup.md](./proxmox-setup.md) (que
descreve o passo a passo do zero). **Leia isto antes de mexer no ambiente de outra
máquina** — evita re-descobrir as armadilhas abaixo.

> Última atualização: 2026-06-10 (provisionamento inicial concluído).

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

> **Atualização 2026-06-12:** as 4 VMs estão deployadas e o loop autônomo rodou
> ponta a ponta em produção (webhook real do Linear via Tailscale Funnel, codegen,
> validação + auto-correção, review, Draft PR, memória de lições). A tabela abaixo
> documenta os bloqueios **originais** de cada serviço (referência histórica) — hoje
> todos resolvidos. Deploy de cada serviço via `infra/deploy/deploy.sh <svc>`.

Bloqueios originais antes do primeiro deploy dos composes em `infra/compose/<vm>/`:

| Serviço       | Bloqueio                                                                 |
|---------------|--------------------------------------------------------------------------|
| gateway       | Chaves LLM: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `VERBOO_API_KEY`       |
| orchestrator  | `LINEAR_API_KEY`, `GITHUB_TOKEN`, `LITELLM_API_KEY`, creds Postgres       |
| runners       | **`apps/worker-code` não existe no repo** — não há app pra buildar/rodar  |
| observability | Só `GRAFANA_USER`/`GRAFANA_PASSWORD` — sobe sem secret externo            |

Passos interativos ainda pendentes (não automatizáveis sem o usuário):

- **Tailscale** em cada VM (`tailscale up` — login interativo).
- **DNS interno** no Pi-hole (`192.168.0.14`): `llm.agent.local → 10.10.0.10`,
  `api.agent.local → 10.10.0.11`. O `grafana.agent.local` aponta para o **host**
  (`192.168.0.10`), que faz DNAT da porta 3000 para `10.10.0.13` — assim o Grafana
  é acessível na LAN sem ssh. Ver [`grafana-lan-access.md`](./grafana-lan-access.md).

Sequência de deploy por VM: ver [proxmox-setup.md → Passo 4](./proxmox-setup.md).
