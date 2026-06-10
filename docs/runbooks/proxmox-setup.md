# Runbook — Provisionamento Proxmox

Guia completo para montar o ambiente do agent-platform do zero em um host Proxmox existente.

> **Já provisionado?** Veja [proxmox-estado-atual.md](./proxmox-estado-atual.md) para o
> estado vivo do ambiente, os gotchas (snapshot em dir storage, nvm no runner),
> troubleshooting e as pendências de deploy.

## Pré-requisitos

- Proxmox VE instalado e funcionando
- Acesso root ao host (shell ou via `pve` no browser)
- Repositório clonado no host:

```bash
apt-get install -y git
git clone https://github.com/raniellimontagna/agent-platform
cd agent-platform
```

Se o repositório for privado, use token HTTPS ou SSH key:

```bash
# HTTPS com token
git clone https://oauth2:<TOKEN>@github.com/raniellimontagna/agent-platform

# SSH (precisa de chave cadastrada no GitHub)
git clone git@github.com:raniellimontagna/agent-platform
```

---

## Passo 1 — Editar configuração

```bash
nano infra/proxmox/config.sh
```

Variáveis a ajustar:

| Variável | Padrão | Descrição |
|---|---|---|
| `BRIDGE` | `vmbr1` | Bridge interna (criar no passo 2) |
| `GATEWAY_IP` | `10.10.0.1` | IP do host Proxmox na nova bridge |
| `DNS` | `192.168.0.14` | Pi-hole ou DNS da sua LAN |
| `STORAGE_GATEWAY` | `local-lvm` | Storage do agent-gateway |
| `STORAGE_ORCHESTRATOR` | `local-lvm` | Storage do agent-orchestrator |
| `STORAGE_RUNNERS` | `backup-hd` | Storage do agent-runners (carga grande) |
| `STORAGE_OBSERVABILITY` | `backup-hd` | Storage da observability (logs) |
| `IP_GATEWAY` | `10.10.0.10/24` | IP do agent-gateway |
| `IP_ORCHESTRATOR` | `10.10.0.11/24` | IP do agent-orchestrator |
| `IP_RUNNERS` | `10.10.0.12/24` | IP do agent-runners |
| `IP_OBSERVABILITY` | `10.10.0.13/24` | IP do agent-observability |
| `CTID_GATEWAY` | `200` | ID do container no Proxmox |
| `SSH_KEY_PATH` | `~/.ssh/id_ed25519.pub` | Chave pública para cloud-init (runners) |

> **Storage:** o `local-lvm` (SSD) costuma ser thin e pequeno; cargas grandes
> (runners, logs) vão para um storage maior tipo `backup-hd`. Esse storage
> precisa ter os content types **Disk image** e **Container** habilitados em
> **Datacenter → Storage → [storage] → Edit → Content**, senão `pct`/`qm`
> recusam criar disco ali.

---

## Passo 2 — Criar bridge vmbr1

**Opção A — Via UI Proxmox (mais fácil):**

1. Proxmox → nó → **Network** → **Create** → **Linux Bridge**
2. Preencher:
   - **Name:** `vmbr1`
   - **IPv4/CIDR:** `10.10.0.1/24`
   - **Bridge ports:** deixar vazio (bridge interna)
3. Clicar **Create** → **Apply Configuration**

**Opção B — Via script:**

```bash
bash infra/proxmox/setup-network.sh
```

O script cria a bridge, habilita IP forwarding e configura NAT via `iptables` para que as VMs acessem a internet através do host.

---

## Passo 3 — Provisionar as VMs

```bash
# Todas de uma vez (com confirmação)
bash infra/proxmox/provision-all.sh

# Ou individualmente
bash infra/proxmox/provision-gateway.sh
bash infra/proxmox/provision-orchestrator.sh
bash infra/proxmox/provision-runners.sh
bash infra/proxmox/provision-observability.sh
```

O que cada script faz:
- Baixa template Debian 13 (LXC) ou imagem cloud Debian 12 (VM runners)
- Cria container/VM com hostname, IP, recursos definidos em `config.sh`
- Instala Docker
- Cria usuário operacional sem root para deploys
- Configura firewall básico (ufw)
- Cria snapshot `initial-clean`

---

## Passo 4 — Deploy dos serviços

Para cada VM, copiar o compose correspondente e subir:

```bash
# agent-gateway (10.10.0.10)
scp -r infra/compose/gateway/ deploy@10.10.0.10:/opt/agent-platform/
ssh deploy@10.10.0.10
cd /opt/agent-platform/gateway
cp .env.example .env
nano .env          # preencher chaves de API
docker compose up -d
```

Repetir para `orchestrator`, `runners` e `observability`.

---

## Passo 5 — Instalar Tailscale (acesso externo)

Em cada VM:

```bash
curl -fsSL https://tailscale.com/install.sh | sh
tailscale up
```

Após autenticar, as VMs ficam acessíveis via Tailscale de qualquer lugar sem expor portas.

---

## Passo 6 — Configurar DNS interno

No Pi-hole (`192.168.0.14`), adicionar em **Local DNS Records**:

| Domain | IP |
|---|---|
| `llm.agent.local` | `10.10.0.10` |
| `api.agent.local` | `10.10.0.11` |
| `grafana.agent.local` | `10.10.0.13` |

---

## Verificação final

```bash
# Do host Proxmox ou de uma VM na vmbr1
curl http://10.10.0.10:4000/health   # LiteLLM
curl http://10.10.0.11:3000/health   # Orchestrator API
curl http://10.10.0.13:3000          # Grafana

# Verificar NAT (internet a partir de uma VM)
ssh deploy@10.10.0.10 "curl -s https://icanhazip.com"
```

---

## Topologia final

```
Internet
    │
    ▼
TP-Link Router (192.168.0.1)
    │
    ▼
Proxmox Host (192.168.0.10 / vmbr0)
    │
    ├── vmbr0  192.168.0.x  ← LAN doméstica (serviços existentes)
    │          .11 Nextcloud, .12 Home Assistant, .13 Jellyfin ...
    │
    └── vmbr1  10.10.0.x   ← agent-platform (isolado, NAT via host)
               .10 agent-gateway       (CTID 200)
               .11 agent-orchestrator  (CTID 201)
               .12 agent-runners       (VMID 202)
               .13 agent-observability (CTID 203)
```
