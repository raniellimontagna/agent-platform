#!/bin/bash
# Cria vmbr1 (bridge interna para agent-platform) e configura NAT no Proxmox host.
# Rodar UMA VEZ no host Proxmox antes de provisionar as VMs.
# Requer reinicialização ou reload de rede ao final.
set -euo pipefail

BRIDGE="vmbr1"
BRIDGE_IP="10.10.0.1/24"
LAN_BRIDGE="vmbr0"           # Bridge da LAN existente
AGENT_SUBNET="10.10.0.0/24"

echo "==> Configurando $BRIDGE (agent-platform network)"

# Adicionar bridge ao /etc/network/interfaces se não existir
if grep -q "iface $BRIDGE" /etc/network/interfaces; then
  echo "==> $BRIDGE já existe em /etc/network/interfaces, pulando."
else
  cat >> /etc/network/interfaces << EOF

auto $BRIDGE
iface $BRIDGE inet static
    address $BRIDGE_IP
    bridge-ports none
    bridge-stp off
    bridge-fd 0
    post-up   echo 1 > /proc/sys/net/ipv4/ip_forward
    post-up   iptables -t nat -A POSTROUTING -s '$AGENT_SUBNET' -o $LAN_BRIDGE -j MASQUERADE
    post-down iptables -t nat -D POSTROUTING -s '$AGENT_SUBNET' -o $LAN_BRIDGE -j MASQUERADE
EOF
  echo "==> $BRIDGE adicionado ao /etc/network/interfaces"
fi

# Habilitar IP forwarding permanente
if ! grep -q "net.ipv4.ip_forward=1" /etc/sysctl.conf; then
  echo "net.ipv4.ip_forward=1" >> /etc/sysctl.conf
fi
sysctl -w net.ipv4.ip_forward=1

# Instalar iptables-persistent para regras sobreviverem ao reboot
apt-get install -y iptables-persistent -qq

# Aplicar NAT imediatamente sem reiniciar
ip link add name $BRIDGE type bridge 2>/dev/null || true
ip link set $BRIDGE up
ip addr add $BRIDGE_IP dev $BRIDGE 2>/dev/null || true
iptables -t nat -C POSTROUTING -s "$AGENT_SUBNET" -o $LAN_BRIDGE -j MASQUERADE 2>/dev/null || \
  iptables -t nat -A POSTROUTING -s "$AGENT_SUBNET" -o $LAN_BRIDGE -j MASQUERADE
iptables-save > /etc/iptables/rules.v4

echo ""
echo "✓ $BRIDGE configurado: $BRIDGE_IP"
echo "  NAT: $AGENT_SUBNET → $LAN_BRIDGE"
echo ""
echo "Topologia:"
echo "  Internet → vmbr0 (192.168.0.x LAN)"
echo "           → vmbr1 (10.10.0.x agent-platform) [NAT via Proxmox host]"
echo ""
echo "IPs agent-platform:"
echo "  10.10.0.10  agent-gateway      (CTID 200)"
echo "  10.10.0.11  agent-orchestrator (CTID 201)"
echo "  10.10.0.12  agent-runners      (VMID 202)"
echo "  10.10.0.13  agent-observability(CTID 203)"
echo ""
echo "Acesso externo: instalar Tailscale em cada VM após provisionamento."
