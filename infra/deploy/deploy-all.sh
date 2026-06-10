#!/bin/bash
# Deploya todos os serviços. Os que precisam de secrets reais no .env são
# pulados (exit 2) com aviso, em vez de abortar tudo.
# Roda no host Proxmox.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Ordem: primeiro os que sobem sem secret externo.
SERVICES=(observability runners gateway orchestrator)
declare -A RESULT

for svc in "${SERVICES[@]}"; do
  echo ""
  bash "$SCRIPT_DIR/deploy.sh" "$svc"
  code=$?
  case $code in
    0) RESULT[$svc]="✓ ok" ;;
    2) RESULT[$svc]="⏳ bloqueado (faltam secrets no .env)" ;;
    *) RESULT[$svc]="✗ erro (exit $code)" ;;
  esac
done

echo ""
echo "================================================"
echo " Resumo do deploy"
echo "================================================"
for svc in "${SERVICES[@]}"; do
  printf "  %-15s %s\n" "$svc" "${RESULT[$svc]}"
done
