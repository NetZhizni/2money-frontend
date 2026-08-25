// Default placeholder — no runtime overrides. Served as-is on static
// hosting (e.g. Firebase Hosting) and in `vite dev`/`vite build`, so the
// app falls back to the Vite build-time VITE_* values (see
// src/runtimeConfig.ts).
//
// In the Docker image this exact file is regenerated at container startup
// from docker/env-config.template.js with real values pulled from the
// container's env vars (see docker/render-env-config.sh) — don't rely on
// this placeholder's content when running via docker-compose.
window.__APP_CONFIG__ = {};
