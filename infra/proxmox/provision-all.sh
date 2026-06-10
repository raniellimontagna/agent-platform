#!/bin/bash
# Provisiona todas as VMs/LXCs em sequência.
# Edite infra/proxmox/config.sh antes de rodar.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "================================================"
echo " agent-platform — Provisionamento completo"
echo "================================================"
echo ""
echo "Isso criará:"
echo "  LXC 100 — agent-gateway       (2 vCPU, 4GB, 40GB)"
echo "  LXC 101 — agent-orchestrator  (4 vCPU, 8GB, 100GB)"
echo "  VM  102 — agent-runners       (8 vCPU, 16GB, 200GB)"
echo "  LXC 103 — agent-observability (4 vCPU, 8GB, 150GB)"
echo ""
read -p "Continuar? [y/N] " -n 1 -r
echo ""
[[ ! $REPLY =~ ^[Yy]$ ]] && exit 1

bash "$SCRIPT_DIR/provision-gateway.sh"
bash "$SCRIPT_DIR/provision-orchestrator.sh"
bash "$SCRIPT_DIR/provision-runners.sh"
bash "$SCRIPT_DIR/provision-observability.sh"

echo ""
echo "================================================"
echo " Todas as VMs provisionadas."
echo ""
echo " Próximos passos:"
echo " 1. Copiar infra/compose/<vm>/ para cada VM"
echo " 2. Preencher os .env de cada VM"
echo " 3. Rodar 'docker compose up -d' em cada VM"
echo " 4. Configurar DNS interno (llm.agent.local, etc)"
echo " 5. Instalar e configurar Tailscale em todas as VMs"
echo "================================================"
