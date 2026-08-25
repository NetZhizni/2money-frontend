# syntax=docker/dockerfile:1

# ---- Build stage --------------------------------------------------------
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# No VITE_* build args here on purpose: those values are no longer baked
# into the bundle for the Docker image — they're injected at container
# startup instead (see render-env-config.sh below + src/runtimeConfig.ts),
# so this build is secret-free and the same image works for anyone
# self-hosting it with their own Firebase project / backend.
RUN npm run build

# ---- Runtime stage -------------------------------------------------------
FROM nginx:1.27-alpine AS runtime

# Default backend upstream for the /api reverse proxy (see
# nginx.conf.template) — override per-deployment with
# `environment: API_UPSTREAM=host:port` in docker-compose, no rebuild
# needed. Matches the service name/port used in vite.config.ts's dev proxy.
ENV API_UPSTREAM=backend:3100

COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

# Runtime env injection (VITE_FIREBASE_*, VITE_API_URL) — see
# docker/render-env-config.sh and src/runtimeConfig.ts. Placed outside
# /usr/share/nginx/html so the template itself is never served.
COPY docker/env-config.template.js /usr/share/nginx/env-config.template.js
COPY docker/render-env-config.sh /docker-entrypoint.d/50-render-env-config.sh
RUN chmod +x /docker-entrypoint.d/50-render-env-config.sh

EXPOSE 80
