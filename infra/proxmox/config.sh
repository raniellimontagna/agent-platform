#!/bin/bash
# Configuração compartilhada entre todos os scripts de provisionamento.
# Edite antes de rodar qualquer script.

# Rede
BRIDGE="vmbr0"
GATEWAY_IP="<lan-gateway-ip>"
DNS="1.1.1.1"
STORAGE="local-lvm"
TEMPLATE_STORAGE="local"

# IPs fixos por VM
IP_GATEWAY="<lan-ip>/24"
IP_ORCHESTRATOR="<lan-ip>/24"
IP_RUNNERS="<lan-ip>/24"
IP_OBSERVABILITY="<lan-ip>/24"

# IDs dos containers/VMs no Proxmox
CTID_GATEWAY=100
CTID_ORCHESTRATOR=101
VMID_RUNNERS=102
CTID_OBSERVABILITY=103

# SSH key para cloud-init (runners VM)
SSH_KEY_PATH="$HOME/.ssh/id_ed25519.pub"
