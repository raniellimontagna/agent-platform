#!/bin/bash
# MAC-9 — Provisionar agent-orchestrator
# LXC Debian 13 + Docker + Postgres + Redis + API
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/config.sh"

CTID=$CTID_ORCHESTRATOR
HOSTNAME="agent-orchestrator"
IP=$IP_ORCHESTRATOR
CORES=$ORCHESTRATOR_CORES
MEMORY=$ORCHESTRATOR_MEMORY
DISK=$ORCHESTRATOR_DISK
STORAGE=$STORAGE_ORCHESTRATOR

echo "==> Provisionando $HOSTNAME (CTID: $CTID)"

# Template Debian
if ! pveam list $TEMPLATE_STORAGE | grep -q "debian-13"; then
  pveam update
  TEMPLATE=$(pveam available --section system | grep "debian-13-standard" | tail -1 | awk '{print $2}')
  pveam download $TEMPLATE_STORAGE "$TEMPLATE"
else
  TEMPLATE=$(pveam list $TEMPLATE_STORAGE | grep "debian-13-standard" | tail -1 | awk '{print $2}')
fi

echo "==> Criando LXC..."
pct create $CTID "$TEMPLATE_STORAGE:vztmpl/$TEMPLATE" \
  --hostname "$HOSTNAME" \
  --cores $CORES \
  --memory $MEMORY \
  --rootfs "$STORAGE:$DISK" \
  --net0 "name=eth0,bridge=$BRIDGE,ip=$IP,gw=$GATEWAY_IP" \
  --nameserver "$DNS" \
  --unprivileged 1 \
  --features nesting=1 \
  --onboot 1

pct start $CTID
sleep 8

echo "==> Instalando Docker..."
pct exec $CTID -- bash -c "apt-get update -qq && apt-get install -y curl ca-certificates"
pct exec $CTID -- bash -c "curl -fsSL https://get.docker.com | sh"
pct exec $CTID -- bash -c "systemctl enable docker"

pct exec $CTID -- bash -c "useradd -m -s /bin/bash deploy && usermod -aG docker deploy"

# Diretórios persistentes
pct exec $CTID -- bash -c "mkdir -p /opt/agent-platform/{postgres,redis,orchestrator,logs}"
pct exec $CTID -- bash -c "chown -R deploy:deploy /opt/agent-platform"

# Firewall: apenas orchestrator e gateway podem acessar
pct exec $CTID -- bash -c "apt-get install -y ufw -qq"
pct exec $CTID -- bash -c "ufw default deny incoming && ufw allow 22 && ufw allow 3000 && echo 'y' | ufw enable"

echo "==> Criando snapshot inicial..."
pct snapshot $CTID initial-clean --description "Clean install - before services"

echo ""
echo "✓ $HOSTNAME provisionado"
echo "  IP: $IP"
echo "  CTID: $CTID"
echo ""
echo "Próximo passo: copiar infra/compose/orchestrator/ e rodar 'docker compose up -d'"
