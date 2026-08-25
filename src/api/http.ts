import axios from 'axios'
import { auth } from '../firebase'
import { markBackendReachable, markBackendUnreachable } from '../db/syncStatus'

/**
 * The one HTTP client talking to the Express/PostgreSQL backend. Every
 * synced entity's Dexie-backed store (src/db/sync.ts) goes through this —
 * there is no more direct Firestore access anywhere in the app.
 */
export const http = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api',
})

http.interceptors.request.use(async (config) => {
  const user = auth.currentUser
  if (user) {
    config.headers.Authorization = `Bearer ${await user.getIdToken()}`
  }
  return config
})

/**
 * A 401 usually means the cached ID token expired mid-session — force a
 * refresh and retry exactly once before giving up (surfacing the error lets
 * the caller fall back to the offline-cached Dexie data either way).
 *
 * Also doubles as the app's one source of truth for "is the backend online":
 * any response at all (even an error one — the server did answer) marks it
 * reachable; a request that fails with no response (network error/timeout)
 * marks it unreachable. See src/db/syncStatus.ts.
 */
http.interceptors.response.use(
  (response) => {
    markBackendReachable()
    return response
  },
  async (error) => {
    if (error.response) markBackendReachable()
    else markBackendUnreachable()

    const original = error.config
    const user = auth.currentUser
    if (error.response?.status === 401 && user && !original._retried) {
      original._retried = true
      original.headers.Authorization = `Bearer ${await user.getIdToken(true)}`
      return http(original)
    }
    return Promise.reject(error)
  },
)

export default http
