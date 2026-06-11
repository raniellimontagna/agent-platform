# syntax=docker/dockerfile:1

FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/worker-code/package.json ./apps/worker-code/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @agent-platform/worker-code...
COPY tsconfig.base.json ./
COPY apps/worker-code ./apps/worker-code
RUN pnpm --filter @agent-platform/worker-code build

FROM base AS deploy
# git + ca-certificates para clonar via HTTPS (validação do cert TLS do GitHub)
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/worker-code/package.json ./apps/worker-code/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --filter @agent-platform/worker-code...
COPY --from=build /app/apps/worker-code/dist ./apps/worker-code/dist

WORKDIR /app/apps/worker-code
EXPOSE 8080
CMD ["node", "dist/index.js"]
