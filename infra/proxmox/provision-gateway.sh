#!/bin/bash
# MAC-8 — Provisionar agent-gateway
# LXC Debian 13 + Docker + Caddy + LiteLLM
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/config.sh"

CTID=$CTID_GATEWAY
HOSTNAME="agent-gateway"
IP=$IP_GATEWAY
CORES=$GATEWAY_CORES
MEMORY=$GATEWAY_MEMORY
DISK=$GATEWAY_DISK
STORAGE=$STORAGE_GATEWAY

echo "==> Provisionando $HOSTNAME (CTID: $CTID)"

# Baixar template Debian se não existir
if ! pveam list $TEMPLATE_STORAGE | grep -q "debian-13"; then
  echo "==> Baixando template Debian 13..."
  pveam update
  TEMPLATE=$(pveam available --section system | grep "debian-13-standard" | tail -1 | awk '{print $2}')
  pveam download $TEMPLATE_STORAGE "$TEMPLATE"
else
  TEMPLATE=$(pveam list $TEMPLATE_STORAGE | grep "debian-13-standard" | tail -1 | awk '{print $2}')
fi

# Criar LXC
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

# Instalar Docker
echo "==> Instalando Docker..."
pct exec $CTID -- bash -c "apt-get update -qq && apt-get install -y curl ca-certificates"
pct exec $CTID -- bash -c "curl -fsSL https://get.docker.com | sh"
pct exec $CTID -- bash -c "systemctl enable docker"

# Usuário operacional (sem root para deploys)
pct exec $CTID -- bash -c "useradd -m -s /bin/bash deploy && usermod -aG docker deploy"

# Diretórios persistentes
pct exec $CTID -- bash -c "mkdir -p /opt/agent-platform/{gateway,litellm,caddy/data,caddy/config}"

# Firewall básico
pct exec $CTID -- bash -c "apt-get install -y ufw -qq"
pct exec $CTID -- bash -c "ufw default deny incoming && ufw allow 22 && ufw allow 80 && ufw allow 443 && ufw allow 4000 && echo 'y' | ufw enable"

# Snapshot inicial limpo
echo "==> Criando snapshot inicial..."
pct snapshot $CTID initial-clean --description "Clean install - before services"

echo ""
echo "✓ $HOSTNAME provisionado"
echo "  IP: $IP"
echo "  CTID: $CTID"
echo ""
echo "Próximo passo: copiar infra/compose/gateway/ e rodar 'docker compose up -d'"
