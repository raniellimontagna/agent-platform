# syntax=docker/dockerfile:1
# Build context = raiz do monorepo (ver infra/compose/runner/docker-compose.yml).

FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

FROM base AS build
# onnxruntime-node baixa providers CUDA/TensorRT no postinstall em linux/x64.
# O runner não usa GPU; pular esse download evita builds lentos/OOM.
ENV ONNXRUNTIME_NODE_INSTALL=skip
# Copia o workspace todo (.dockerignore tira node_modules/dist/.git).
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile
# Build do app + suas deps de workspace (llm) em ordem topológica.
RUN pnpm --filter "@agent-platform/worker-code..." build

FROM base AS deploy
# git + ca-certificates para clonar via HTTPS; docker.io fornece o client usado
# pelo sandbox executor contra o docker.sock montado na VM de runners.
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates docker.io \
    && rm -rf /var/lib/apt/lists/*
# Higgsfield CLI para geração de mídia via jobs/sandbox. A autenticação é OAuth
# e deve ser persistida por volume em HIGGSFIELD_HOME.
RUN npm install -g @higgsfield/cli@0.2.3
# Copia o workspace já buildado (mantém os symlinks dos workspace packages).
COPY --from=build /app /app
# Playwright precisa do browser e das libs do sistema dentro da imagem final.
RUN pnpm --dir /app/apps/worker-code exec playwright install --with-deps chromium

WORKDIR /app/apps/worker-code
EXPOSE 8080
CMD ["node", "dist/index.js"]
