# syntax=docker/dockerfile:1
#
# Multi-stage build for the static sparkdown player. The build context is the
# MONOREPO ROOT (not this directory) so the npm workspace can be installed from
# the single root package-lock.json — see sparkdown-player-app.cloudbuild.yaml.

# ===== Stage 1: build the Vite app =====
FROM node:20-slim AS builder
WORKDIR /app

# Public, client-side config baked into the browser bundle at build time.
ARG VITE_SPARKDOWN_EDITOR_ORIGIN
ENV VITE_SPARKDOWN_EDITOR_ORIGIN=$VITE_SPARKDOWN_EDITOR_ORIGIN

# Copy the whole monorepo (.dockerignore prunes node_modules/, out/, dist/).
COPY . .

# Deterministic workspace install, then build just the player app.
RUN npm ci
RUN npm run build --workspace=sparkdown-player-app

# ===== Stage 2: serve the built /dist with nginx =====
FROM nginx:1.27-alpine AS runtime

# Cloud Run sends traffic to $PORT, so make Nginx listen on 8080.
ENV PORT=8080

# Replace default site with SPA-friendly config (fallback to /index.html).
COPY sparkdown-player-app/nginx.conf /etc/nginx/conf.d/default.conf

# The static build output.
COPY --from=builder /app/sparkdown-player-app/dist /usr/share/nginx/html

EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
