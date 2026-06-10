#!/bin/bash
# MAC-10 — Provisionar agent-runners
# VM COMPLETA Debian 12 (cloud-init) — não LXC, isolamento de kernel necessário
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/config.sh"

VMID=$VMID_RUNNERS
HOSTNAME="agent-runners"
IP=$IP_RUNNERS
CORES=$RUNNERS_CORES
MEMORY=$RUNNERS_MEMORY
DISK=$RUNNERS_DISK
STORAGE=$STORAGE_RUNNERS
CLOUD_IMAGE_URL="https://cloud.debian.org/images/cloud/bookworm/latest/debian-12-genericcloud-amd64.qcow2"
CLOUD_IMAGE="/tmp/debian-12-genericcloud-amd64.qcow2"

echo "==> Provisionando $HOSTNAME (VMID: $VMID) — VM completa"

# Baixar imagem cloud
if [ ! -f "$CLOUD_IMAGE" ]; then
  echo "==> Baixando imagem Debian 12 cloud..."
  wget -q --show-progress -O "$CLOUD_IMAGE" "$CLOUD_IMAGE_URL"
fi

# Criar VM base
echo "==> Criando VM..."
qm create $VMID \
  --name "$HOSTNAME" \
  --cores $CORES \
  --memory $MEMORY \
  --net0 "virtio,bridge=$BRIDGE" \
  --ostype l26 \
  --agent enabled=1 \
  --onboot 1

# Importar e anexar disco cloud em um passo (storage-agnostic, Proxmox 8+)
echo "==> Importando disco..."
qm set $VMID \
  --scsihw virtio-scsi-pci \
  --scsi0 "$STORAGE:0,import-from=$CLOUD_IMAGE" \
  --ide2 "$STORAGE:cloudinit" \
  --boot "order=scsi0" \
  --serial0 socket \
  --vga serial0

# Cloud-init: rede + SSH
qm set $VMID \
  --ipconfig0 "ip=$IP,gw=$GATEWAY_IP" \
  --nameserver "$DNS" \
  --ciuser "runner"

if [ -f "$SSH_KEY_PATH" ]; then
  qm set $VMID --sshkeys "$SSH_KEY_PATH"
fi

# Expandir disco
qm resize $VMID scsi0 "${DISK}G"

qm start $VMID
echo "==> VM iniciada. Aguardando cloud-init (60s)..."
sleep 60

# Pós-provisionamento via SSH (ajuste IP se necessário)
RUNNER_IP=$(echo $IP | cut -d'/' -f1)

echo "==> Configurando via SSH..."
ssh -o StrictHostKeyChecking=no runner@$RUNNER_IP << 'ENDSSH'
set -e

# Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker runner
sudo systemctl enable docker

# Ferramentas de desenvolvimento
sudo apt-get update -qq
sudo apt-get install -y git build-essential curl wget unzip jq

# Node.js LTS via nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
export NVM_DIR="$HOME/.nvm"
source "$NVM_DIR/nvm.sh"
nvm install --lts
nvm use --lts

# pnpm
npm install -g pnpm

# Diretórios do runner
sudo mkdir -p /srv/agent-runners/{worktrees,cache,artifacts}
sudo chown -R runner:runner /srv/agent-runners

# Firewall: só aceita do orchestrator
sudo apt-get install -y ufw -qq
sudo ufw default deny incoming
sudo ufw allow 22
sudo ufw allow from 10.10.0.11 to any port 8080
echo "y" | sudo ufw enable
ENDSSH

# Snapshot limpo
echo "==> Criando snapshot inicial..."
qm snapshot $VMID initial-clean --description "Clean install - before agent workloads"

echo ""
echo "✓ $HOSTNAME provisionado (VM completa)"
echo "  IP: $IP"
echo "  VMID: $VMID"
echo "  SSH: ssh runner@$RUNNER_IP"
echo ""
echo "IMPORTANTE: Esta VM não deve ter secrets de produção."
