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
RUN pnpm --filter "@agent-platform/orchestrator-api..." build

FROM base AS deploy
# Copia o workspace já buildado (mantém os symlinks dos workspace packages).
COPY --from=build /app /app
WORKDIR /app/apps/orchestrator-api
EXPOSE 3000
CMD ["node", "dist/index.js"]
