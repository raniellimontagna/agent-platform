#!/bin/bash
# Provisiona todas as VMs/LXCs em sequência.
# Edite infra/proxmox/config.sh antes de rodar.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/config.sh"
require_bridge

echo "================================================"
echo " agent-platform — Provisionamento completo"
echo "================================================"
echo ""
TOTAL_DISK=$((GATEWAY_DISK + ORCHESTRATOR_DISK + RUNNERS_DISK + OBSERVABILITY_DISK))
echo "Isso criará:"
echo "  LXC $CTID_GATEWAY        — agent-gateway       (${GATEWAY_CORES} vCPU, ${GATEWAY_MEMORY}MB, ${GATEWAY_DISK}GB @ ${STORAGE_GATEWAY})"
echo "  LXC $CTID_ORCHESTRATOR   — agent-orchestrator  (${ORCHESTRATOR_CORES} vCPU, ${ORCHESTRATOR_MEMORY}MB, ${ORCHESTRATOR_DISK}GB @ ${STORAGE_ORCHESTRATOR})"
echo "  VM  $VMID_RUNNERS        — agent-runners       (${RUNNERS_CORES} vCPU, ${RUNNERS_MEMORY}MB, ${RUNNERS_DISK}GB @ ${STORAGE_RUNNERS})"
echo "  LXC $CTID_OBSERVABILITY  — agent-observability (${OBSERVABILITY_CORES} vCPU, ${OBSERVABILITY_MEMORY}MB, ${OBSERVABILITY_DISK}GB @ ${STORAGE_OBSERVABILITY})"
echo ""
echo "  Disco total: ${TOTAL_DISK}GB"
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
