#!/bin/bash
# Configuração compartilhada entre todos os scripts de provisionamento.
# Edite antes de rodar qualquer script.

# -------------------------------------------------------------------
# Rede LAN existente (vmbr0 — 192.168.0.x)
# Infra:   .10-.19  |  Pessoal: .20-.29
# IoT Hubs: .50-.59 |  IoT Endpoints: .60-.99
# DHCP visitantes: .100+
# -------------------------------------------------------------------

# -------------------------------------------------------------------
# Rede agent-platform (vmbr1 — 10.10.0.x/24)
# Subnet isolada exclusiva para o agent-platform.
# Proxmox faz NAT entre vmbr1 e vmbr0 para acesso à internet.
# Acesso externo via Tailscale em cada VM.
# -------------------------------------------------------------------
BRIDGE="vmbr1"
BRIDGE_IP="10.10.0.1"          # IP do Proxmox host na bridge interna
SUBNET="10.10.0.0/24"
GATEWAY_IP="10.10.0.1"         # Proxmox host faz NAT
DNS="192.168.0.14"             # Pi-hole da LAN
STORAGE="local-lvm"
TEMPLATE_STORAGE="local"

# IPs fixos — grupo agent-platform (10.10.0.10-.19 = infra do agent)
IP_GATEWAY="10.10.0.10/24"         # agent-gateway      (LiteLLM + Caddy)
IP_ORCHESTRATOR="10.10.0.11/24"    # agent-orchestrator (API + LangGraph)
IP_RUNNERS="10.10.0.12/24"         # agent-runners      (execução de código)
IP_OBSERVABILITY="10.10.0.13/24"   # agent-observability (Grafana + Loki)

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
GATEWAY_CORES=1;        GATEWAY_MEMORY=1024;        GATEWAY_DISK=8
ORCHESTRATOR_CORES=2;   ORCHESTRATOR_MEMORY=2048;   ORCHESTRATOR_DISK=20
RUNNERS_CORES=2;        RUNNERS_MEMORY=4096;        RUNNERS_DISK=40
OBSERVABILITY_CORES=1;  OBSERVABILITY_MEMORY=2048;  OBSERVABILITY_DISK=16

# SSH key para cloud-init (runners VM)
SSH_KEY_PATH="$HOME/.ssh/id_ed25519.pub"
