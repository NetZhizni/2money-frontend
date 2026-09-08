/**
 * Build-time fallback API URL, used only until a device has gone through
 * ServerSetupView (see src/config/serverConfig.ts, stores/server.ts) —
 * after that, src/api/http.ts's baseURL is derived from the user-picked
 * server URL persisted in localStorage instead.
 *
 * This used to also carry the Firebase web-app config (VITE_FIREBASE_*),
 * runtime-injected per-container via docker/render-env-config.sh so one
 * Docker image could be pointed at any Firebase project without a rebuild.
 * That whole mechanism is gone now: the Firebase config is no longer
 * build-time (or container-time) configuration at all — it comes from
 * whichever server the user types into the app itself
 * (GET /api/config/public, see backend/src/routers/config.js), so the same
 * static frontend build works with any compatible backend already, no
 * per-deployment image variant needed.
 */
export const env = {
  VITE_API_URL: (import.meta.env.VITE_API_URL as string | undefined) ?? '/api',
}
