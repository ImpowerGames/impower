# syntax=docker/dockerfile:1
#
# Multi-stage build for the impower-dev Fastify server. The build context is the
# MONOREPO ROOT (not this directory) so the npm workspace can be installed from
# the single root package-lock.json — see impower-dev.cloudbuild.yaml.

# ===== Stage 1: install the workspace and build the app =====
FROM node:20-slim AS builder
WORKDIR /app

# Public, client-side config baked into the browser bundle at build time. These
# are exposed to the browser (hence the BROWSER_ prefix) and are not secrets.
ARG VITE_SPARKDOWN_PLAYER_ORIGIN
ARG BROWSER_GOOGLE_API_KEY
ARG BROWSER_GOOGLE_OAUTH_CLIENT_ID
ENV VITE_SPARKDOWN_PLAYER_ORIGIN=$VITE_SPARKDOWN_PLAYER_ORIGIN \
    BROWSER_GOOGLE_API_KEY=$BROWSER_GOOGLE_API_KEY \
    BROWSER_GOOGLE_OAUTH_CLIENT_ID=$BROWSER_GOOGLE_OAUTH_CLIENT_ID

# Copy the whole monorepo (.dockerignore prunes node_modules/, out/, dist/).
COPY . .

# Deterministic workspace install, then build the impower-dev app. Its `prebuild`
# script compiles @impower/impower-ui first.
RUN npm ci
RUN npm run build --workspace=impower-dev

# Assemble a minimal production node_modules. build.ts bundles the entire server
# into out/api/index.js and leaves only a few packages external (fastify, several
# @fastify/* plugins, dotenv, googleapis). collect-runtime-deps.mjs derives that
# closure from the built artifact itself — pinned to impower-dev's own ranges —
# so the runtime image never drifts from what the bundle requires.
RUN mkdir -p /deploy && \
    node impower-dev/scripts/collect-runtime-deps.mjs \
      impower-dev/out/api/index.js impower-dev/package.json /deploy/package.json && \
    cd /deploy && npm install --omit=dev --no-audit --no-fund

# ===== Stage 2: slim runtime image =====
FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Cloud Run injects PORT (the server reads process.env.PORT, defaulting to 8080).

# package.json (type:module, so the ESM bundle loads) + its resolved deps.
COPY --from=builder /deploy/package.json ./package.json
COPY --from=builder /deploy/node_modules ./node_modules
# The compiled server + static assets. router.ts resolves out/public via cwd.
COPY --from=builder /app/impower-dev/out ./out

ENTRYPOINT ["node", "out/api/index.js"]
