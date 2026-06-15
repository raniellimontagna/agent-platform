# syntax=docker/dockerfile:1
# Build context = raiz do monorepo (ver infra/compose/orchestrator/docker-compose.yml).

FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

FROM base AS build
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
# MAC-45: baixa o modelo de embedding na imagem (build tem rede; runtime no LXC não
# conseguia baixar → embed falhava). Fica em /app/.hf-cache, copiado pro deploy via
# `COPY --from=build /app /app`. Também valida que a CPU lib pós-strip roda inferência.
# Roda de dentro do app: o pnpm symlinka @huggingface/transformers no node_modules
# do workspace (não no root). cacheDir absoluto → /app/.hf-cache (copiado pro deploy).
RUN cd /app/apps/orchestrator-api && node -e "(async()=>{const t=await import('@huggingface/transformers');t.env.cacheDir='/app/.hf-cache';const p=await t.pipeline('feature-extraction','Xenova/all-MiniLM-L6-v2');const o=await p('warmup',{pooling:'mean',normalize:true});if(o.data.length!==384)process.exit(2);console.log('embedding model baked, dim',o.data.length);})().catch(e=>{console.error(e);process.exit(1)})"

FROM base AS deploy
# Copia o workspace já buildado (mantém os symlinks dos workspace packages).
COPY --from=build /app /app
WORKDIR /app/apps/orchestrator-api
EXPOSE 3000
CMD ["node", "dist/index.js"]
