# syntax=docker/dockerfile:1
# Build context = raiz do monorepo (ver infra/compose/runner/docker-compose.yml).

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
# Build do app + suas deps de workspace (llm) em ordem topológica.
RUN pnpm --filter "@agent-platform/worker-code..." build

FROM base AS deploy
# git + ca-certificates para clonar via HTTPS (validação do cert TLS do GitHub)
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*
# Copia o workspace já buildado (mantém os symlinks dos workspace packages).
COPY --from=build /app /app

WORKDIR /app/apps/worker-code
EXPOSE 8080
CMD ["node", "dist/index.js"]
