#!/bin/bash
# Configuração compartilhada entre todos os scripts de provisionamento.
# Edite antes de rodar qualquer script.

# Rede
BRIDGE="vmbr0"
GATEWAY_IP="192.168.1.1"
DNS="1.1.1.1"
STORAGE="local-lvm"
TEMPLATE_STORAGE="local"

# IPs fixos por VM
IP_GATEWAY="192.168.1.10/24"
IP_ORCHESTRATOR="192.168.1.11/24"
IP_RUNNERS="192.168.1.12/24"
IP_OBSERVABILITY="192.168.1.13/24"

# IDs dos containers/VMs no Proxmox
CTID_GATEWAY=100
CTID_ORCHESTRATOR=101
VMID_RUNNERS=102
CTID_OBSERVABILITY=103

# SSH key para cloud-init (runners VM)
SSH_KEY_PATH="$HOME/.ssh/id_ed25519.pub"
