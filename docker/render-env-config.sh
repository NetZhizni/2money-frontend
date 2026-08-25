#!/bin/sh
# Regenerates /usr/share/nginx/html/env-config.js from the container's own
# env vars at startup (see docker/env-config.template.js,
# src/runtimeConfig.ts). Runs automatically: the base nginx image executes
# every script under /docker-entrypoint.d/ before nginx starts.
#
# This is what lets one ghcr.io image be pointed at any Firebase project /
# backend by anyone self-hosting it — via `env_file: .env` in
# docker-compose — with no rebuild.
set -eu

template=/usr/share/nginx/env-config.template.js
output=/usr/share/nginx/html/env-config.js

if [ -f "$template" ]; then
  envsubst \
    '${VITE_FIREBASE_API_KEY} ${VITE_FIREBASE_AUTH_DOMAIN} ${VITE_FIREBASE_PROJECT_ID} ${VITE_FIREBASE_STORAGE_BUCKET} ${VITE_FIREBASE_MESSAGING_SENDER_ID} ${VITE_FIREBASE_APP_ID} ${VITE_API_URL}' \
    < "$template" > "$output"
fi
