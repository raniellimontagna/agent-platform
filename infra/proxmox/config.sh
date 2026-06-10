#!/bin/bash
# Configuração compartilhada entre todos os scripts de provisionamento.
# Edite antes de rodar qualquer script.

# Rede
BRIDGE="vmbr0"
GATEWAY_IP="<lan-gateway-ip>"    # Ajuste para seu gateway
DNS="1.1.1.1"
STORAGE="local-lvm"
TEMPLATE_STORAGE="local"

# -------------------------------------------------------------------
# IPs — range de infraestrutura: .2-.19
# Grupo agent-platform ocupa .14-.17 (últimas slots livres da infra)
# -------------------------------------------------------------------
IP_GATEWAY="<lan-ip>/24"        # agent-gateway      (LiteLLM)
IP_ORCHESTRATOR="<lan-ip>/24"   # agent-orchestrator (API + LangGraph)
IP_RUNNERS="<lan-ip>/24"        # agent-runners      (execução de código)
IP_OBSERVABILITY="<lan-ip>/24"  # agent-observability (Grafana + Prometheus + Loki)

# -------------------------------------------------------------------
# IDs Proxmox — bloco 200-203 (separado dos serviços pessoais 101-115)
# -------------------------------------------------------------------
CTID_GATEWAY=200        # LXC — agent-gateway
CTID_ORCHESTRATOR=201   # LXC — agent-orchestrator
VMID_RUNNERS=202        # VM  — agent-runners (VM completa, não LXC)
CTID_OBSERVABILITY=203  # LXC — agent-observability

# SSH key para cloud-init (runners VM)
SSH_KEY_PATH="$HOME/.ssh/id_ed25519.pub"
