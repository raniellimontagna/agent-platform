#!/bin/bash
# MAC-11 — Provisionar agent-observability
# LXC Debian 13 + Docker + Grafana + Prometheus + Loki
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/config.sh"
require_bridge

CTID=$CTID_OBSERVABILITY
HOSTNAME="agent-observability"
IP=$IP_OBSERVABILITY
CORES=$OBSERVABILITY_CORES
MEMORY=$OBSERVABILITY_MEMORY
DISK=$OBSERVABILITY_DISK
STORAGE=$STORAGE_OBSERVABILITY

echo "==> Provisionando $HOSTNAME (CTID: $CTID)"

# Resolver template Debian 13 (volid completo: storage:vztmpl/pkg)
TEMPLATE=$(pveam list "$TEMPLATE_STORAGE" 2>/dev/null | awk '$1 ~ /debian-13-standard/ {print $1}' | tail -1)
if [ -z "$TEMPLATE" ]; then
  pveam update
  PKG=$(pveam available --section system | awk '$2 ~ /debian-13-standard/ {print $2}' | tail -1)
  pveam download "$TEMPLATE_STORAGE" "$PKG"
  TEMPLATE="$TEMPLATE_STORAGE:vztmpl/$PKG"
fi

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

echo "==> Instalando Docker..."
pct exec $CTID -- bash -c "apt-get update -qq && apt-get install -y curl ca-certificates"
pct exec $CTID -- bash -c "curl -fsSL https://get.docker.com | sh"
pct exec $CTID -- bash -c "systemctl enable docker"

pct exec $CTID -- bash -c "useradd -m -s /bin/bash deploy && usermod -aG docker deploy"

# Diretórios persistentes
pct exec $CTID -- bash -c "mkdir -p /opt/agent-platform/{grafana/data,grafana/provisioning,prometheus,loki,promtail}"
pct exec $CTID -- bash -c "chown -R deploy:deploy /opt/agent-platform"

# Firewall: acesso interno apenas
pct exec $CTID -- bash -c "apt-get install -y ufw -qq"
pct exec $CTID -- bash -c "ufw default deny incoming && ufw allow 22 && ufw allow 3000 && ufw allow 9090 && echo 'y' | ufw enable"

echo "==> Criando snapshot inicial..."
pct snapshot $CTID initial-clean --description "Clean install - before observability stack"

echo ""
echo "✓ $HOSTNAME provisionado"
echo "  IP: $IP"
echo "  CTID: $CTID"
echo "  Grafana: http://$IP:3000 (após deploy)"
echo ""
echo "Próximo passo: copiar infra/compose/observability/ e rodar 'docker compose up -d'"
