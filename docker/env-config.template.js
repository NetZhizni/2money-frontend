// Template for /usr/share/nginx/html/env-config.js — rendered at container
// startup by render-env-config.sh (via `envsubst`), using whatever env vars
// the container was started with (e.g. `env_file: .env` in docker-compose).
// Read by src/runtimeConfig.ts through the <script> tag in index.html.
window.__APP_CONFIG__ = {
  VITE_FIREBASE_API_KEY: "${VITE_FIREBASE_API_KEY}",
  VITE_FIREBASE_AUTH_DOMAIN: "${VITE_FIREBASE_AUTH_DOMAIN}",
  VITE_FIREBASE_PROJECT_ID: "${VITE_FIREBASE_PROJECT_ID}",
  VITE_FIREBASE_STORAGE_BUCKET: "${VITE_FIREBASE_STORAGE_BUCKET}",
  VITE_FIREBASE_MESSAGING_SENDER_ID: "${VITE_FIREBASE_MESSAGING_SENDER_ID}",
  VITE_FIREBASE_APP_ID: "${VITE_FIREBASE_APP_ID}",
  VITE_API_URL: "${VITE_API_URL}",
};
