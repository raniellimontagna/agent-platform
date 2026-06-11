#!/bin/bash
# Dispara o webhook ai-ready manualmente (sem Tailscale), assinando o payload
# com o LINEAR_WEBHOOK_SECRET — simula o que o Linear enviaria.
#
# Uso: bash infra/deploy/test-webhook.sh <WEBHOOK_SECRET> <ISSUE_UUID> [URL]
#   ISSUE_UUID = id (UUID) de uma issue real do Linear (o worker vai buscá-la).
set -euo pipefail

SECRET="${1:?uso: test-webhook.sh <secret> <issue-uuid> [url]}"
ISSUE_ID="${2:?informe o UUID da issue}"
URL="${3:-http://10.10.0.11:3000/webhooks/linear}"

BODY=$(printf '%s' "{\"type\":\"Issue\",\"action\":\"update\",\"data\":{\"id\":\"$ISSUE_ID\",\"identifier\":\"TEST\",\"title\":\"Teste fluxo ai-ready\",\"labels\":[{\"name\":\"ai-ready\"}]}}")

# HMAC-SHA256 hex do corpo cru (mesmo cálculo do verifySignature no webhook).
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | sed 's/^.*= //')

echo "==> POST $URL"
curl -s -X POST "$URL" \
  -H "content-type: application/json" \
  -H "linear-signature: $SIG" \
  --data-raw "$BODY"
echo ""
