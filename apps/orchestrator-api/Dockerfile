# syntax=docker/dockerfile:1
# Build context = raiz do monorepo (ver infra/compose/orchestrator/docker-compose.yml).

FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

FROM base AS build
# onnxruntime-node baixa providers CUDA/TensorRT no postinstall em linux/x64.
# Embeddings rodam em CPU; pular esse download evita OOM no build do LXC.
ENV ONNXRUNTIME_NODE_INSTALL=skip
# Copia o workspace todo (.dockerignore tira node_modules/dist/.git).
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile
# Build do app + suas deps de workspace (llm, linear, graph) em ordem topológica.
# Inclui o mcp-server (facade stdio rodado via docker exec no Proxmox).
RUN pnpm --filter "@agent-platform/orchestrator-api..." \
         --filter "@agent-platform/mcp-server..." build
# onnxruntime-node (via @huggingface/transformers, MAC-45) empacota providers GPU
# (CUDA/TensorRT, ~GB) e binários de outras arquiteturas. Embeddings rodam em CPU
# x64 — remove o peso morto pra não inflar a imagem (chegou a estourar o disco do
# LXC no deploy). `|| true`: tolera ausência (a CPU lib libonnxruntime.so fica).
RUN find /app/node_modules -type f -name 'libonnxruntime_providers_cuda.so*' -delete 2>/dev/null || true \
 && find /app/node_modules -type f -name 'libonnxruntime_providers_tensorrt.so*' -delete 2>/dev/null || true \
 && find /app/node_modules -type d -path '*onnxruntime-node/bin/*' \( -name win32 -o -name darwin -o -name arm64 \) -exec rm -rf {} + 2>/dev/null || true

FROM base AS deploy
# Copia o workspace já buildado (mantém os symlinks dos workspace packages).
COPY --from=build /app /app
# MAC-45: modelo de embedding vendorizado no repo (o LXC não alcança o CDN do HF
# nem no build nem no runtime). Vai pra /app/.hf-cache = cacheDir do embed().
COPY apps/orchestrator-api/vendor/hf-cache /app/.hf-cache
WORKDIR /app/apps/orchestrator-api
EXPOSE 3000
CMD ["node", "dist/index.js"]
