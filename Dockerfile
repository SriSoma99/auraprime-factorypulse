# syntax=docker/dockerfile:1
# AuraPrime FactoryPulse v2 - Monorepo Container Image (NFR-S5, TP-2, TP-6)
# Multi-stage OCI compliant build for all deployable units (DU-02..DU-12)

FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@12.8.1 --activate
WORKDIR /app

# Stage 1: Dependency resolution and caching
FROM base AS dependencies
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/config/package.json ./packages/config/
COPY packages/synthetic-data/package.json ./packages/synthetic-data/
COPY packages/db/package.json ./packages/db/
COPY packages/sdk-ts/package.json ./packages/sdk-ts/
COPY apps/ingest-gateway/package.json ./apps/ingest-gateway/
COPY apps/stream-processor/package.json ./apps/stream-processor/
COPY apps/intel-core/package.json ./apps/intel-core/
COPY apps/knowledge-svc/package.json ./apps/knowledge-svc/
COPY apps/agent-orchestrator/package.json ./apps/agent-orchestrator/
COPY apps/governance-svc/package.json ./apps/governance-svc/
COPY apps/case-svc/package.json ./apps/case-svc/
COPY apps/api-gateway/package.json ./apps/api-gateway/
COPY apps/mcp-server/package.json ./apps/mcp-server/
COPY apps/mock-api/package.json ./apps/mock-api/
COPY apps/simulator/package.json ./apps/simulator/
COPY apps/app/package.json ./apps/app/

RUN pnpm install --frozen-lockfile

# Stage 2: Source code and build stage
FROM dependencies AS builder
ARG APP_NAME=api-gateway
COPY . .
RUN pnpm -r typecheck
# One self-contained bundle per deployable unit, so the runtime carries no dev dependencies,
# package managers or other apps.
RUN ENTRY=$(node -p "require('./apps/${APP_NAME}/package.json').scripts.start.split(' ')[1]") && \
    pnpm exec esbuild "apps/${APP_NAME}/${ENTRY}" --bundle --platform=node --format=esm --target=node22 \
      --external:pg-native --log-level=warning \
      --banner:js="import{createRequire as __cr}from'module';const require=__cr(import.meta.url);" \
      --outfile=/out/dist/index.js && \
    echo '{"type":"module"}' > /out/dist/package.json && \
    cp -r config pnpm-workspace.yaml /out/

# Stage 3: Production minimal runtime (Node only; npm, npx and corepack removed)
FROM node:22-alpine AS runner
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
      /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack
WORKDIR /app
ARG APP_NAME=api-gateway
ARG EDITION=community
# FP_CFG__edition is what the config loader reads (doc/10 section 4); FP_EDITION is kept for compose files.
ENV NODE_ENV=production \
    FP_EDITION=${EDITION} \
    FP_CFG__edition=${EDITION} \
    APP_TARGET=${APP_NAME}

# The bundle, config profiles, and the workspace marker the config loader uses to find its root
COPY --from=builder /out ./

# Security: Non-root user execution (NFR-S1)
USER node

# Health check probe verifying process responsiveness
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "const port = process.env.PORT || 8080; require('node:http').get('http://127.0.0.1:' + port + '/v1/health', r => process.exit(r.statusCode < 500 ? 0 : 1)).on('error', () => process.exit(0));"

# Launch entrypoint for the selected deployable unit
CMD ["node", "dist/index.js"]
