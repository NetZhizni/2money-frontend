import { io, type Socket } from 'socket.io-client'
import { getFirebaseAuthOrNull } from '../firebase'
import { getPersistedServerUrl } from '../config/serverConfig'
import type { SyncableEntity } from '../db/schema'
import {
  pullAllAccounts,
  pullAllBudgets,
  pullAllCategories,
  pullAllReceipts,
  pullAllTags,
  pullAllTemplates,
  pullAllTransactions,
  pullUserDirectory,
} from '../db/sync'

const PULL_BY_ENTITY: Record<SyncableEntity, () => Promise<void>> = {
  accounts: pullAllAccounts,
  categories: pullAllCategories,
  tags: pullAllTags,
  transactions: pullAllTransactions,
  recurringTemplates: pullAllTemplates,
  budgets: pullAllBudgets,
  receipts: pullAllReceipts,
}

let socket: Socket | null = null

/**
 * Real-time push on top of src/db/sync.ts's poll-based pull (still running
 * every 1min regardless — see startAutoSync — as the fallback for whatever
 * this misses while disconnected). The backend's `sync:changed` event
 * (src/sockets/notify.js on the backend) carries only an entity name, never
 * the changed row itself: this app already has a battle-tested, cursor-based
 * delta-pull per entity, so reacting to the poke by calling that is simpler
 * and safer than trusting/merging a second copy of the row shape pushed over
 * the wire.
 *
 * `transports: ['websocket']` matches the backend's own setting — see
 * backend src/sockets/index.js's doc comment on why its Node cluster setup
 * can't support Engine.IO's default long-polling transport.
 *
 * `auth` as a callback (not a plain object) so every (re)connection attempt
 * — including automatic reconnects after a token expires — fetches a fresh
 * Firebase ID token, the same way src/api/http.ts's request interceptor does
 * for REST calls.
 */
export function connectSocket(): void {
  if (socket) return
  const serverUrl = getPersistedServerUrl()
  if (!serverUrl) return

  socket = io(serverUrl, {
    transports: ['websocket'],
    auth: async (cb) => {
      const user = getFirebaseAuthOrNull()?.currentUser
      cb({ token: user ? await user.getIdToken() : null })
    },
  })

  // Catches up on whatever changed while this device was offline/asleep —
  // cheap regardless (pullEntity's coalescing + `since` cursor mean an
  // up-to-date client just gets an empty response).
  socket.on('connect', () => {
    void pullAllAccounts()
    void pullAllCategories()
    void pullAllTags()
    void pullAllTransactions()
    void pullAllTemplates()
    void pullAllBudgets()
    void pullAllReceipts()
    void pullUserDirectory()
  })

  socket.on('sync:changed', ({ entity }: { entity: SyncableEntity }) => {
    void PULL_BY_ENTITY[entity]?.()
  })
}

/** Called on sign-out / server switch (see stores/auth.ts's reset) — nothing to reconnect to until the next connectSocket(). */
export function disconnectSocket(): void {
  socket?.disconnect()
  socket = null
}
