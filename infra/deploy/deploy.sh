#!/bin/bash
# Deploy de um serviço para sua VM/LXC. Roda no host Proxmox.
# Uso: bash infra/deploy/deploy.sh <gateway|orchestrator|runners|observability>
#
# LXC  -> arquivos via `pct push`, comandos via `pct exec` (sem SSH).
# VM   -> arquivos via tar+ssh, comandos via ssh (runner@IP).
#
# Códigos de saída: 0 = ok | 1 = erro | 2 = bloqueado (faltam secrets no .env)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../proxmox/config.sh"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

SERVICE="${1:-}"
case "$SERVICE" in
  observability) KIND=lxc; ID=$CTID_OBSERVABILITY;  MODE=image; SUBDIR=observability ;;
  gateway)       KIND=lxc; ID=$CTID_GATEWAY;        MODE=image; SUBDIR=gateway ;;
  orchestrator)  KIND=lxc; ID=$CTID_ORCHESTRATOR;   MODE=build; SUBDIR=orchestrator ;;
  runners)       KIND=vm;  ID=$VMID_RUNNERS; IP="${IP_RUNNERS%/*}"; SSH_USER=runner; MODE=build; SUBDIR=runners ;;
  *) echo "uso: deploy.sh <gateway|orchestrator|runners|observability>"; exit 1 ;;
esac

# LXC: /opt (root via pct). VM: home do runner (sem sudo, runner é dono).
if [ "$KIND" = vm ]; then
  REMOTE_BASE="/home/$SSH_USER/agent-platform"
else
  REMOTE_BASE="/opt/agent-platform"
fi

# ---- camada de transporte (lxc via pct, vm via ssh) ----------------------
remote_exec() {
  if [ "$KIND" = lxc ]; then
    pct exec "$ID" -- bash -lc "$1"
  else
    ssh -o StrictHostKeyChecking=no "$SSH_USER@$IP" "$1"
  fi
}

remote_push_dir() { # $1 = dir local, $2 = dir remoto
  local src="$1" dst="$2"
  if [ "$KIND" = lxc ]; then
    local tmp; tmp="$(mktemp)"
    tar -C "$src" -czf "$tmp" .
    pct exec "$ID" -- mkdir -p "$dst"
    pct push "$ID" "$tmp" /tmp/deploy.tgz
    pct exec "$ID" -- tar -C "$dst" -xzf /tmp/deploy.tgz
    pct exec "$ID" -- rm -f /tmp/deploy.tgz
    rm -f "$tmp"
  else
    ssh -o StrictHostKeyChecking=no "$SSH_USER@$IP" "mkdir -p $dst"
    tar -C "$src" -czf - . | ssh -o StrictHostKeyChecking=no "$SSH_USER@$IP" "tar -C $dst -xzf -"
  fi
}

remote_file_exists() { # $1 = caminho remoto
  remote_exec "test -f '$1'" 2>/dev/null
}

prune_docker_build_cache() {
  echo "==> Docker disk usage antes do prune"
  remote_exec "docker system df || true"
  echo "==> Limpando Docker build cache"
  remote_exec "docker builder prune -af || true"
  echo "==> Docker disk usage depois do prune"
  remote_exec "docker system df || true"
}

# ---- .env: garante presença e bloqueia se ainda tiver placeholders -------
ensure_env() { # $1 = dir remoto do compose
  local dir="$1"
  if remote_file_exists "$dir/.env"; then
    echo "==> .env já existe em $dir (mantido)"
    # Auto-completa chaves novas do .env.example que faltem no .env atual.
    remote_exec "while IFS= read -r l; do case \"\$l\" in ''|\\#*) continue;; esac; k=\"\${l%%=*}\"; grep -q \"^\$k=\" '$dir/.env' || { printf '%s\\n' \"\$l\" >> '$dir/.env'; echo \"   + chave nova adicionada ao .env: \$k\"; }; done < '$dir/.env.example'"
  else
    echo "==> Criando .env a partir de .env.example"
    remote_exec "cp '$dir/.env.example' '$dir/.env'"
    if [ "$SERVICE" = observability ]; then
      # Observability não tem secret externo: gera senha do Grafana.
      local pass; pass="$(openssl rand -hex 16)"
      remote_exec "sed -i 's/^GRAFANA_PASSWORD=.*/GRAFANA_PASSWORD=$pass/' '$dir/.env'"
      echo "==> Grafana admin password gerada: $pass"
    fi
  fi

  # Gateway/orchestrator exigem secrets reais antes de subir.
  if [ "$SERVICE" = gateway ] || [ "$SERVICE" = orchestrator ]; then
    if remote_exec "grep -q 'change-me' '$dir/.env'" 2>/dev/null; then
      echo ""
      echo "  BLOQUEADO: $dir/.env ainda contém 'change-me'."
      echo "  Preencha os secrets reais e rode de novo:"
      echo "    LXC: pct exec $ID -- nano $dir/.env"
      echo ""
      exit 2
    fi
  fi
}

echo "================================================"
echo " Deploy: $SERVICE  ($KIND $ID, modo $MODE)"
echo "================================================"

if [ "$MODE" = image ]; then
  # Serviços só-imagem: empurra o dir do compose e sobe.
  DEST="$REMOTE_BASE/$SUBDIR"
  echo "==> Enviando infra/compose/$SUBDIR -> $DEST"
  remote_push_dir "$REPO_ROOT/infra/compose/$SUBDIR" "$DEST"

  # Gateway: OmniRoute precisa subir antes do gate, para fazer o OAuth e
  # obter a OMNIROUTE_API_KEY que o LiteLLM vai usar.
  if [ "$SERVICE" = gateway ]; then
    remote_exec "test -f '$DEST/.env' || cp '$DEST/.env.example' '$DEST/.env'"
    echo "==> Subindo OmniRoute (bridge OAuth)"
    remote_exec "cd '$DEST' && docker compose up -d omniroute"
    echo ""
    echo "  >> Configure o OmniRoute antes de seguir:"
    echo "     1. Abra http://${IP_GATEWAY%/*}:20128"
    echo "     2. Providers -> conecte Claude Max e ChatGPT via OAuth"
    echo "     3. Endpoints -> copie a API key"
    echo "     4. Ponha em OMNIROUTE_API_KEY no .env e rode de novo:"
    echo "        pct exec $ID -- nano $DEST/.env"
    echo ""
  fi

  ensure_env "$DEST"

  # Observability: os containers rodam como usuários não-root e precisam escrever
  # nos volumes bind-montados (senão crash-loop por permission denied).
  if [ "$SERVICE" = observability ]; then
    remote_exec "mkdir -p /opt/agent-platform/{grafana,prometheus,loki} \
      && chown -R 472:472 /opt/agent-platform/grafana \
      && chown -R 65534:65534 /opt/agent-platform/prometheus \
      && chown -R 10001:10001 /opt/agent-platform/loki"
  fi

  echo "==> docker compose up -d"
  remote_exec "cd '$DEST' && docker compose up -d"
else
  # Serviços de build: precisam do repo inteiro para o build context.
  DEST="$REMOTE_BASE/repo"
  COMPOSE_DIR="$DEST/infra/compose/$SUBDIR"
  echo "==> Enviando repositório -> $DEST (sem node_modules/.git/dist)"
  TMP_REPO="$(mktemp -d)"
  tar -C "$REPO_ROOT" \
    --exclude='./node_modules' --exclude='*/node_modules' \
    --exclude='./.git' --exclude='*/dist' --exclude='*.log' \
    -czf "$TMP_REPO/repo.tgz" .
  if [ "$KIND" = lxc ]; then
    remote_exec "mkdir -p '$DEST'"
    pct push "$ID" "$TMP_REPO/repo.tgz" /tmp/repo.tgz
    remote_exec "tar -C '$DEST' -xzf /tmp/repo.tgz && rm -f /tmp/repo.tgz"
  else
    ssh -o StrictHostKeyChecking=no "$SSH_USER@$IP" "mkdir -p $DEST"
    cat "$TMP_REPO/repo.tgz" | ssh -o StrictHostKeyChecking=no "$SSH_USER@$IP" "tar -C $DEST -xzf -"
  fi
  rm -rf "$TMP_REPO"

  ensure_env "$COMPOSE_DIR"

  # Build fresco (--no-cache): o cache de layer do Docker servia fonte VELHA mesmo
  # após o repo mudar (incidente MAC-57 — deploy não pegava o código novo). Mais
  # lento (refaz pnpm install), mas garante que toda alteração de fonte entra.
  # Deploy é manual/ocasional. Builda uma vez aqui; o migrate e o up reusam a imagem.
  echo "==> docker compose build --no-cache"
  remote_exec "cd '$COMPOSE_DIR' && docker compose build --no-cache"

  if [ "$SERVICE" = orchestrator ]; then
    echo "==> Subindo Postgres/Redis e aplicando migrations"
    remote_exec "cd '$COMPOSE_DIR' && docker compose up -d postgres redis"
    remote_exec "cd '$COMPOSE_DIR' && timeout 60 bash -c 'until docker compose exec -T postgres pg_isready; do sleep 2; done'"
    remote_exec "cd '$COMPOSE_DIR' && docker compose run --rm api node dist/db/migrate.js"
  fi

  echo "==> docker compose up -d"
  remote_exec "cd '$COMPOSE_DIR' && docker compose up -d"

  prune_docker_build_cache
fi

echo ""
echo "✓ $SERVICE deployado."
