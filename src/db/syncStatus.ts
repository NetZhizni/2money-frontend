import { liveQuery } from 'dexie'
import { ref } from 'vue'
import { db } from './schema'

/**
 * Whether the backend actually answered our last request — set from
 * src/api/http.ts's response interceptor. A 4xx/5xx still counts as
 * "reachable" (the server did respond); only a network error/timeout flips
 * this false. This is a stronger signal than `navigator.onLine`, which only
 * reflects the device's own network interface and says nothing about
 * whether our backend is actually up.
 */
export const backendOnline = ref(navigator.onLine)

export function markBackendReachable() {
  backendOnline.value = true
}

export function markBackendUnreachable() {
  backendOnline.value = false
}

// The network interface going away is an immediate, reliable "offline" signal
// (unlike its `online` counterpart, which only means the interface is back,
// not that the backend answers again — the next request's interceptor call
// is what flips backendOnline true).
window.addEventListener('offline', markBackendUnreachable)

const LAST_SYNCED_KEY = '2money:lastSyncedAt'

function readStoredLastSyncedAt(): number | null {
  const raw = localStorage.getItem(LAST_SYNCED_KEY)
  const n = raw ? Number(raw) : NaN
  return Number.isFinite(n) ? n : null
}

/** Epoch ms of the last fully-successful fullSync() (push + pull of every entity). Persisted across reloads/devices-local. */
export const lastSyncedAt = ref<number | null>(readStoredLastSyncedAt())

/** Called by src/db/sync.ts's fullSync() once every entity has pulled cleanly. */
export function markSynced() {
  const now = Date.now()
  lastSyncedAt.value = now
  localStorage.setItem(LAST_SYNCED_KEY, String(now))
}

/**
 * Live count of every queued-but-not-yet-pushed local write across all
 * entities — the same `outbox` table src/db/sync.ts drains. Powers the
 * global "N записів очікують синхронізації" indicator; per-record pending
 * state is exposed separately by src/db/useSyncedCollection.ts.
 */
export const pendingCount = ref(0)
liveQuery(() => db.outbox.count()).subscribe({
  next: (count) => {
    pendingCount.value = count
  },
  error: (error) => console.error('[syncStatus] outbox count failed', error),
})
