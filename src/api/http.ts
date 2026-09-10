import axios from 'axios'
import { getFirebaseAuthOrNull } from '../firebase'
import { markBackendReachable, markBackendUnreachable } from '../db/syncStatus'
import { apiBaseUrl, getPersistedServerUrl, hasConfiguredServer } from '../config/serverConfig'
import { env } from '../runtimeConfig'
// Circular with i18n/locale.ts (it imports `http` too, for its own
// best-effort PATCH /settings mirror) — safe here because both sides only
// touch the other's export from inside a function body called well after
// module init (the request interceptor below; `setLocaleSetting` there),
// never at top-level eval time.
import { locale } from '../i18n/locale'

/**
 * The one HTTP client talking to the Express/PostgreSQL backend. Every
 * synced entity's Dexie-backed store (src/db/sync.ts) goes through this —
 * there is no more direct Firestore access anywhere in the app.
 *
 * `baseURL` is read once here, at module-eval time — that's safe because
 * every place that actually changes which server is configured
 * (stores/server.ts's `connect`/`switchTo`) does so by persisting the new
 * URL and then `location.reload()`ing rather than hot-swapping this
 * instance live: a fresh page load re-evaluates this module and picks up
 * the new value. `env.VITE_API_URL` is only a dev-time convenience fallback
 * (relative `/api`, proxied by Vite — see vite.config.ts) for a device that
 * hasn't gone through ServerSetupView yet; a production build served with
 * no server configured never reaches this client at all (see App.vue).
 */
export const http = axios.create({
  baseURL: (() => {
    const serverUrl = getPersistedServerUrl()
    return serverUrl ? apiBaseUrl(serverUrl) : env.VITE_API_URL
  })(),
})

http.interceptors.request.use(async (config) => {
  // No server configured (local/offline mode, see stores/server.ts) — fail
  // fast instead of letting a relative /api request go out to whatever
  // origin happens to be serving this page. Falls into the same
  // "unreachable" handling as a real network error below (no `.response`),
  // so every existing best-effort `.catch()` call site (db/seed.ts,
  // stores/settings.ts, …) already handles this the same way it handles
  // being offline.
  if (!hasConfiguredServer()) {
    return Promise.reject(new Error('[http] no server configured (local mode)'))
  }

  const auth = getFirebaseAuthOrNull()
  const user = auth?.currentUser
  if (user) {
    config.headers.Authorization = `Bearer ${await user.getIdToken()}`
  }
  // Lets the backend localize what little user-facing text it generates
  // itself — right now just the Gemini receipt-scan prompt/errors (see
  // backend's util/gemini.js, services/internal/receipt/scanReceipt.js).
  // Always the already-resolved code ('system' resolved via detectLocale,
  // never the literal string 'system' — see i18n/locale.ts's `locale` ref).
  config.headers['X-App-Locale'] = locale.value
  return config
})

/**
 * A 401 usually means the cached ID token expired mid-session — force a
 * refresh and retry exactly once before giving up (surfacing the error lets
 * the caller fall back to the offline-cached Dexie data either way).
 *
 * Also doubles as the app's one source of truth for "is the backend online":
 * a 2xx, or a 4xx (the backend rejecting *this* request on purpose — bad
 * input, not found, auth — still means it's up and answering correctly)
 * marks it reachable. A 5xx (the backend answered but is itself erroring —
 * see backend/src/middleware/error.js) or no response at all (network
 * error/timeout, or the local-mode short-circuit above) marks it
 * unreachable: `navigator.onLine` alone can't tell you that, it only knows
 * about the device's own network interface, not whether *our* backend is
 * actually working. See src/db/syncStatus.ts.
 */
http.interceptors.response.use(
  (response) => {
    markBackendReachable()
    return response
  },
  async (error) => {
    if (error.response && error.response.status < 500) markBackendReachable()
    else markBackendUnreachable()

    const original = error.config
    const auth = getFirebaseAuthOrNull()
    const user = auth?.currentUser
    if (error.response?.status === 401 && user && original && !original._retried) {
      original._retried = true
      original.headers.Authorization = `Bearer ${await user.getIdToken(true)}`
      return http(original)
    }
    return Promise.reject(error)
  },
)

export default http
