# syntax=docker/dockerfile:1

# ---- Build stage --------------------------------------------------------
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# No VITE_* build args here: the app no longer has any per-deployment
# secret or config baked in at build time at all. The Firebase project and
# backend a device talks to are chosen at runtime, in the app itself (see
# src/config/serverConfig.ts, views/ServerSetupView.vue) — so this single,
# secret-free image works for anyone self-hosting it, pointed at whatever
# backend they type in, no rebuild and no per-deployment env vars needed.
RUN npm run build

# ---- Runtime stage -------------------------------------------------------
FROM nginx:1.27-alpine AS runtime

# Default backend upstream for the /api reverse proxy (see
# nginx.conf.template) — override per-deployment with
# `environment: API_UPSTREAM=host:port` in docker-compose, no rebuild
# needed. Matches the service name/port used in vite.config.ts's dev proxy.
# Only relevant when a user points ServerSetupView at THIS frontend's own
# origin (the common single-domain deployment) — /api is then reverse-
# proxied to this upstream; pointing at a fully separate backend origin
# doesn't touch this at all.
ENV API_UPSTREAM=backend:3100

COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
