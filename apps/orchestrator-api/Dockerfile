# syntax=docker/dockerfile:1

FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

FROM base AS build
# Copia manifests da raiz e do app para instalar deps com cache
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/orchestrator-api/package.json ./apps/orchestrator-api/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @agent-platform/orchestrator-api...
COPY tsconfig.base.json ./
COPY apps/orchestrator-api ./apps/orchestrator-api
RUN pnpm --filter @agent-platform/orchestrator-api build

FROM base AS deploy
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/orchestrator-api/package.json ./apps/orchestrator-api/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --filter @agent-platform/orchestrator-api...
COPY --from=build /app/apps/orchestrator-api/dist ./apps/orchestrator-api/dist
COPY --from=build /app/apps/orchestrator-api/drizzle ./apps/orchestrator-api/drizzle

WORKDIR /app/apps/orchestrator-api
EXPOSE 3000
CMD ["node", "dist/index.js"]
