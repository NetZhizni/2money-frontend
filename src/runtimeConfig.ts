/**
 * Runtime-configurable app settings, layered over Vite's build-time
 * `import.meta.env.VITE_*`.
 *
 * The Docker image (see docker/render-env-config.sh) regenerates
 * `/env-config.js` from the container's own env vars — populated via
 * `env_file: .env` in docker-compose — at container startup, and
 * index.html loads it before this module runs. That lets one ghcr.io image
 * be reused for any Firebase project / backend by anyone self-hosting it,
 * without rebuilding.
 *
 * When no such file was generated (static hosting, e.g. Firebase Hosting,
 * or plain `vite dev` / `vite build`), `window.__APP_CONFIG__` stays the
 * empty placeholder shipped in public/env-config.js, and every key falls
 * back to the value Vite baked in at build time instead.
 */
declare global {
  interface Window {
    __APP_CONFIG__?: Record<string, string | undefined>
  }
}

function readEnv(key: string): string | undefined {
  const runtimeValue = window.__APP_CONFIG__?.[key]
  return runtimeValue || (import.meta.env[key] as string | undefined)
}

export const env = {
  VITE_FIREBASE_API_KEY: readEnv('VITE_FIREBASE_API_KEY'),
  VITE_FIREBASE_AUTH_DOMAIN: readEnv('VITE_FIREBASE_AUTH_DOMAIN'),
  VITE_FIREBASE_PROJECT_ID: readEnv('VITE_FIREBASE_PROJECT_ID'),
  VITE_FIREBASE_STORAGE_BUCKET: readEnv('VITE_FIREBASE_STORAGE_BUCKET'),
  VITE_FIREBASE_MESSAGING_SENDER_ID: readEnv('VITE_FIREBASE_MESSAGING_SENDER_ID'),
  VITE_FIREBASE_APP_ID: readEnv('VITE_FIREBASE_APP_ID'),
  VITE_API_URL: readEnv('VITE_API_URL') ?? '/api',
}
