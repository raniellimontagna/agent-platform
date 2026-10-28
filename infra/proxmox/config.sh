#!/bin/bash
# Configuração compartilhada entre todos os scripts de provisionamento.
# Edite antes de rodar qualquer script: os valores entre <> são marcadores e
# precisam virar os endereços da sua rede (o fim do arquivo confere isso).

# -------------------------------------------------------------------
# Rede LAN existente (vmbr0)
# -------------------------------------------------------------------

# -------------------------------------------------------------------
# Rede agent-platform (vmbr1, uma /24 privada)
# Subnet isolada exclusiva para o agent-platform.
# Proxmox faz NAT entre vmbr1 e vmbr0 para acesso à internet.
# Acesso externo via Tailscale em cada VM.
# -------------------------------------------------------------------
BRIDGE="vmbr1"
BRIDGE_IP="<bridge-ip>"        # IP do Proxmox host na bridge interna
SUBNET="<agent-subnet>/24"
GATEWAY_IP="$BRIDGE_IP"        # Proxmox host faz NAT
DNS="<lan-dns-ip>"             # DNS da LAN (Pi-hole)
TEMPLATE_STORAGE="local"

# -------------------------------------------------------------------
# Storage por VM — split para não lotar o local-lvm (thin pool já em 85%).
# local-lvm: rápido (SSD), pouco espaço → serviços leves com IOPS.
# backup-hd: folgado (HDD)  → cargas grandes/efêmeras (runners, logs).
# IMPORTANTE: backup-hd precisa ter content "Disk image" + "Container"
# habilitado em Datacenter → Storage antes de rodar.
# -------------------------------------------------------------------
STORAGE_GATEWAY="local-lvm"
STORAGE_ORCHESTRATOR="local-lvm"
STORAGE_RUNNERS="backup-hd"
STORAGE_OBSERVABILITY="backup-hd"

# IPs fixos — grupo agent-platform, todos dentro de $SUBNET
IP_GATEWAY="<agent-gateway-ip>/24"             # agent-gateway      (LiteLLM + Caddy)
IP_ORCHESTRATOR="<agent-orchestrator-ip>/24"   # agent-orchestrator (API + LangGraph)
IP_RUNNERS="<agent-runners-ip>/24"             # agent-runners      (execução de código)
IP_OBSERVABILITY="<agent-observability-ip>/24" # agent-observability (Grafana + Loki)

# IDs Proxmox — bloco 200-203 (separado dos serviços pessoais 101-115)
CTID_GATEWAY=200        # LXC — agent-gateway
CTID_ORCHESTRATOR=201   # LXC — agent-orchestrator
VMID_RUNNERS=202        # VM  — agent-runners (VM completa, não LXC)
CTID_OBSERVABILITY=203  # LXC — agent-observability

# -------------------------------------------------------------------
# Sizing — defaults enxutos para homelab. CORES=vCPU, MEMORY=MB, DISK=GB.
# Proxmox faz overcommit de CPU, então vCPU é folgado.
# Aumente se tiver espaço; runners é o que mais precisa (builds + docker).
# -------------------------------------------------------------------
GATEWAY_CORES=2;        GATEWAY_MEMORY=3072;        GATEWAY_DISK=16
ORCHESTRATOR_CORES=2;   ORCHESTRATOR_MEMORY=2048;   ORCHESTRATOR_DISK=20
RUNNERS_CORES=2;        RUNNERS_MEMORY=4096;        RUNNERS_DISK=40
OBSERVABILITY_CORES=1;  OBSERVABILITY_MEMORY=2048;  OBSERVABILITY_DISK=16

# SSH key para cloud-init (runners VM)
SSH_KEY_PATH="$HOME/.ssh/id_ed25519.pub"

# Aborta se algum endereço ainda está com o marcador <...>.
for var in BRIDGE_IP SUBNET DNS IP_GATEWAY IP_ORCHESTRATOR IP_RUNNERS IP_OBSERVABILITY; do
  if [[ "${!var}" == *"<"* ]]; then
    echo "ERRO: defina $var em infra/proxmox/config.sh antes de rodar."
    exit 1
  fi
done

# Aborta se a bridge ainda não foi criada (Passo 2 do runbook).
require_bridge() {
  if ! ip link show "$BRIDGE" >/dev/null 2>&1; then
    echo "ERRO: bridge '$BRIDGE' não existe."
    echo "Rode primeiro no host: bash infra/proxmox/setup-network.sh"
    exit 1
  fi
}
