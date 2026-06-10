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

# Resolver template Debian 13 (volid completo: storage:vztmpl/pkg)
TEMPLATE=$(pveam list "$TEMPLATE_STORAGE" 2>/dev/null | awk '$1 ~ /debian-13-standard/ {print $1}' | tail -1)
if [ -z "$TEMPLATE" ]; then
  echo "==> Baixando template Debian 13..."
  pveam update
  PKG=$(pveam available --section system | awk '$2 ~ /debian-13-standard/ {print $2}' | tail -1)
  pveam download "$TEMPLATE_STORAGE" "$PKG"
  TEMPLATE="$TEMPLATE_STORAGE:vztmpl/$PKG"
fi

# Criar LXC
echo "==> Criando LXC..."
pct create $CTID "$TEMPLATE" \
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
