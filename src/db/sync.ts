import { isAxiosError } from 'axios'
import http from '../api/http'
import { db, type SyncableEntity, type UserDirectoryEntry } from './schema'
import { backendOnline, markSynced } from './syncStatus'

const RESOURCE_PATH: Record<SyncableEntity, string> = {
  accounts: 'accounts',
  categories: 'categories',
  transactions: 'transactions',
  recurringTemplates: 'recurring-templates',
  budgets: 'budgets',
}

/** id + optional soft-delete marker — the shape every synced row has, whatever else it carries. */
type SyncRow = { id: string; deletedAt?: number | null }

/**
 * A server response the client can't do anything about by retrying: bad
 * payload, not-found, or an id that belongs to someone else (see the
 * `WHERE owner_id = EXCLUDED.owner_id` guard in the backend's upsert SQL).
 * Anything else (no response at all = offline, or 5xx) is left queued.
 */
function isTerminalFailure(error: unknown): boolean {
  if (!isAxiosError(error) || !error.response) return false
  const status = error.response.status
  return status !== 401 && status < 500
}

// enqueueUpsert/enqueueDelete each kick off their own `pushOutbox` right
// after queuing, and fullSync() calls it too — at startup (a bulk seed
// enqueue racing fullSync's own drain, e.g.) two calls for the same user can
// overlap, both read the same still-queued entry, and both push it. Coalesce
// concurrent drains per user so a second call just waits on the one already
// in flight instead of re-reading and re-pushing the same entries.
const pushInFlight = new Map<string, Promise<void>>()

/**
 * Drains the outbox in FIFO order, one entry at a time, only for records
 * queued under the currently signed-in user (see OutboxEntry.ownerId).
 * Stops at the first entry that fails for a retryable reason — later
 * entries stay queued behind it so ordering is preserved on the next drain.
 */
export async function pushOutbox(currentUserId: string | null): Promise<void> {
  if (!currentUserId || !navigator.onLine) return
  const existing = pushInFlight.get(currentUserId)
  if (existing) return existing

  const promise = (async () => {
    const entries = await db.outbox.where('ownerId').equals(currentUserId).sortBy('localId')

    for (const entry of entries) {
      const path = RESOURCE_PATH[entry.entity]
      try {
        if (entry.op === 'upsert') {
          await http.post(`/${path}`, entry.payload)
        } else {
          await http.delete(`/${path}/${entry.recordId}`)
        }
        await db.outbox.delete(entry.localId!)
      } catch (error) {
        if (isTerminalFailure(error)) {
          console.error(`[sync] dropping unrecoverable outbox entry ${entry.entity}/${entry.recordId}`, error)
          await db.outbox.delete(entry.localId!)
          continue
        }
        return // offline / server error — retry the rest of the queue later
      }
    }
  })()

  pushInFlight.set(currentUserId, promise)
  try {
    await promise
  } finally {
    pushInFlight.delete(currentUserId)
  }
}

/**
 * Pulls one entity's delta (or full active set, on first sync) and merges it
 * into Dexie. With `{ scope: 'all' }`, hits the same endpoint with
 * `?scope=all` — the whole family's records instead of just the signed-in
 * user's own — and tracks that under its own `"<entity>:all"` cursor, so the
 * own-records pull and the family-wide pull never fight over one bookmark.
 * Both shapes come back as `{ items, syncedAt }` from the backend (see
 * backend/src/sql/syncable.js's listOwned/listAll), active-only on first
 * load and including tombstones (`deletedAt`) once a cursor exists — so a
 * family member's deletion is picked up the same way a local one is, with no
 * separate "sweep records that vanished from a full snapshot" step needed.
 */
// Startup fires several independent pulls of the same entity within a short
// span of each other, not always in the same tick — fullSync() only reaches
// its own pull phase after awaiting pushOutbox(), while seedDefaultsIfEmpty
// and each allAccounts/allTemplates/allBudgets store's own load() pull
// unblocked, right away. So one of them can finish and clear an in-flight-only
// guard before the other even arrives, and both still end up hitting the
// network. Every call site has its own good reason to ask for a fresh pull
// right away rather than wait out the 1min interval, so instead of removing
// any of them, calls for the same cursorKey within PULL_COALESCE_MS of each
// other — whether truly concurrent or just close in time — share one
// request/transaction and its result instead of each firing its own GET.
// Pure reads with a server-tracked delta cursor, so briefly reusing the last
// answer costs nothing a caller would notice — unlike pushOutbox below, which
// must always re-check the outbox table since a new entry can be queued
// between calls.
const PULL_COALESCE_MS = 5_000
const pullCache = new Map<string, { promise: Promise<void>; settledAt: number | null }>()

function coalescedPull(key: string, run: () => Promise<void>): Promise<void> {
  const cached = pullCache.get(key)
  if (cached && (cached.settledAt === null || Date.now() - cached.settledAt < PULL_COALESCE_MS)) {
    return cached.promise
  }

  const entry: { promise: Promise<void>; settledAt: number | null } = { promise: null as unknown as Promise<void>, settledAt: null }
  entry.promise = run().finally(() => {
    entry.settledAt = Date.now()
  })
  pullCache.set(key, entry)
  return entry.promise
}

async function pullEntity(entity: SyncableEntity, opts?: { scope: 'all' }): Promise<void> {
  const cursorKey = opts?.scope ? (`${entity}:${opts.scope}` as const) : entity
  return coalescedPull(cursorKey, async () => {
    const path = RESOURCE_PATH[entity]
    const cursor = await db.syncCursors.get(cursorKey)
    const { data } = await http.get<{ items: SyncRow[]; syncedAt: number }>(`/${path}`, {
      params: { ...(opts?.scope ? { scope: opts.scope } : {}), ...(cursor?.since ? { since: cursor.since } : {}) },
    })

    const table = db[entity] as unknown as { put: (row: SyncRow) => Promise<unknown>; delete: (id: string) => Promise<void> }
    await db.transaction('rw', db[entity], db.syncCursors, async () => {
      for (const item of data.items) {
        if (item.deletedAt) await table.delete(item.id)
        else await table.put(item)
      }
      await db.syncCursors.put({ entity: cursorKey, since: data.syncedAt })
    })
  })
}

/**
 * Full financial transparency within the family, for every syncable entity:
 * every local "own" store already reads its slice by filtering the very
 * same Dexie table client-side (`db.accounts.where('ownerId').equals(uid)`,
 * etc. — see stores/accounts.ts, stores/categories.ts, stores/transactions.ts,
 * stores/templates.ts, stores/budgets.ts), so a single family-wide
 * `scope=all` pull per entity is a superset that covers both "my own" and
 * "everyone's" views — no separate own-scope pull needed on top. Also what
 * a future "view another family member's data" / whole-family-budget
 * feature needs: that data has to already be synced locally, not fetched
 * on demand only when such a view is opened.
 */
const SYNC_ENTITIES: SyncableEntity[] = ['accounts', 'categories', 'transactions', 'recurringTemplates', 'budgets']

/**
 * Pulls a batch of entities (each via `pullEntity`), tolerating individual
 * failures — returns one boolean per entity so the caller can decide what a
 * "fully synced" outcome means, same as each call site did inline before.
 */
async function pullMany(entities: SyncableEntity[], opts: { scope: 'all' } | undefined, logLabel: string): Promise<boolean[]> {
  return Promise.all(
    entities.map((entity) =>
      pullEntity(entity, opts)
        .then(() => true)
        .catch((error) => {
          console.error(`[sync] ${logLabel} pull ${entity}${opts ? '?scope=all' : ''} failed`, error)
          return false
        }),
    ),
  )
}

/**
 * Push pending local writes, then pull fresh data for every entity — the
 * whole family's, for every entity (see SYNC_ENTITIES). Safe to call
 * repeatedly/concurrently. Marks `syncStatus.lastSyncedAt` (used by the
 * "остання синхронізація" indicator) only once every pull actually
 * succeeded — a partial failure leaves the previous timestamp standing
 * rather than claiming a full sync that didn't happen.
 */
export async function fullSync(currentUserId: string | null): Promise<void> {
  if (!currentUserId || !navigator.onLine) return
  await pushOutbox(currentUserId)
  const results = await pullMany(SYNC_ENTITIES, { scope: 'all' }, 'sync')
  if (results.every(Boolean)) markSynced()
}

/**
 * "Hard resync": wipes every locally-cached synced table (this profile's own
 * accounts/categories/transactions/recurringTemplates/budgets, the shared
 * family directory, and the delta-sync cursors) and re-pulls all of it fresh
 * from the backend, as if this were a brand-new device. For when the local
 * Dexie cache is suspected to have drifted and the server should just win.
 *
 * Unlike resetAllData() in src/db/reset.ts, nothing is deleted *on* the
 * server — this only touches the local cache. Tries to push whatever's
 * queued first so a real edit isn't lost silently, but this is a
 * user-confirmed destructive action (see the ConfirmDialog in
 * SyncStatusBadge.vue): if some of *this user's* outbox entries still won't
 * push (stuck behind a permanent failure, e.g.), they're discarded rather
 * than aborting the whole resync — otherwise the exact entries the user is
 * trying to escape are also the ones that permanently block ever clearing
 * the local DB, leaving "Очікує синхронізації" stuck forever. Other family
 * members' queued entries on a shared device are left untouched.
 */
export async function resyncFromServer(currentUserId: string | null): Promise<void> {
  if (!currentUserId) throw new Error('Не автентифіковано')
  if (!backendOnline.value) throw new Error('Немає з’єднання із сервером')

  await pushOutbox(currentUserId)
  const stillPending = await db.outbox.where('ownerId').equals(currentUserId).count()
  if (stillPending > 0) {
    console.warn(`[sync] resync: discarding ${stillPending} outbox entr${stillPending === 1 ? 'y' : 'ies'} that failed to push`)
  }

  await db.transaction(
    'rw',
    [db.accounts, db.categories, db.transactions, db.recurringTemplates, db.budgets, db.syncCursors, db.users, db.outbox],
    async () => {
      await Promise.all([
        db.accounts.clear(),
        db.categories.clear(),
        db.transactions.clear(),
        db.recurringTemplates.clear(),
        db.budgets.clear(),
        db.syncCursors.clear(),
        db.users.clear(),
        db.outbox.where('ownerId').equals(currentUserId).delete(),
      ])
    },
  )

  // Everything was just wiped above — a pull whose *result* is still within
  // coalescedPull's freshness window from before the wipe must not be reused
  // here: that would skip the network call entirely and leave these tables
  // empty until the next unrelated sync tick refills them. Drop those cached
  // entries so every pull below is guaranteed to actually hit the network.
  pullCache.delete('users')
  for (const entity of SYNC_ENTITIES) pullCache.delete(`${entity}:all`)

  const userDirectoryOk = await pullUserDirectory()
    .then(() => true)
    .catch((error) => {
      console.error('[sync] resync pull users failed', error)
      return false
    })
  const results = await pullMany(SYNC_ENTITIES, { scope: 'all' }, 'resync')

  if (userDirectoryOk && results.every(Boolean)) markSynced()
  else throw new Error('Частину даних не вдалося завантажити із сервера. Спробуйте ще раз.')
}

/**
 * Refreshes the small, non-syncable-via-outbox family directory (see
 * stores/profiles.ts). GET /users always returns the full current directory
 * (no delta/cursor) — this mirrors it exactly (deleting any local row not in
 * the fresh response) instead of only ever upserting, so a deactivated
 * member, or a stale id left over from an earlier session, doesn't linger in
 * Dexie forever alongside the real, current rows (e.g. duplicate-looking
 * entries in the "Переглянути як" picker).
 */
export async function pullUserDirectory(): Promise<void> {
  if (!navigator.onLine) return
  return coalescedPull('users', async () => {
    const { data } = await http.get<UserDirectoryEntry[]>('/users')
    await db.transaction('rw', db.users, async () => {
      const freshIds = new Set(data.map((u) => u.id))
      const staleIds = (await db.users.toCollection().primaryKeys()).filter((id) => !freshIds.has(id as string))
      if (staleIds.length) await db.users.bulkDelete(staleIds)
      await db.users.bulkPut(data)
    })
  })
}

/**
 * Refreshes every family member's active accounts (own included — this app's
 * trust model is full financial transparency within the family) into
 * `accounts`, delta-synced under its own `accounts:all` cursor — cheap after
 * the first pull, not a full re-fetch every time. The per-profile
 * stores/accounts.ts store is just a client-side filter (`.where('ownerId')`)
 * over this same table, so this one family-wide pull is the only network
 * fetch `accounts` ever needs (see SYNC_ENTITIES/fullSync); exported
 * separately so a view/store can also trigger an immediate on-demand
 * refresh outside the 1min interval (stores/allAccounts.ts,
 * components/layout/UserSwitcherModal.vue).
 */
export async function pullAllAccounts(): Promise<void> {
  if (!navigator.onLine) return
  await pullEntity('accounts', { scope: 'all' })
}

/**
 * Refreshes every family member's active transactions (own included) into
 * `transactions` — same reasoning and mechanics as pullAllAccounts: the
 * per-profile stores/transactions.ts store filters this same table
 * client-side by `participantIds`, so this is the only network fetch
 * `transactions` ever needs. Also backs the "Переглянути як" popup's
 * combined-balance breakdown (components/layout/UserSwitcherModal.vue),
 * which needs the whole family's transactions regardless of participation.
 */
export async function pullAllTransactions(): Promise<void> {
  if (!navigator.onLine) return
  await pullEntity('transactions', { scope: 'all' })
}

/**
 * Refreshes the whole family's active categories into `categories` — unlike
 * the other `pullAll*` functions here, this isn't a superset for a
 * client-side owner filter: categories ARE the shared family resource (see
 * stores/categories.ts, which reads this same table entirely unfiltered), so
 * this is simply the only network fetch `categories` ever needs. Exported
 * separately (see startAutoSync) so db/seed.ts can pull the current shared
 * set on demand before deciding whether it still needs seeding.
 */
export async function pullAllCategories(): Promise<void> {
  if (!navigator.onLine) return
  await pullEntity('categories', { scope: 'all' })
}

/**
 * Refreshes every family member's active recurring templates (own included)
 * into `recurringTemplates` — same reasoning and mechanics as
 * pullAllAccounts/pullAllTransactions: the per-profile stores/templates.ts
 * store filters this same table client-side by `ownerId`, so this is the
 * only network fetch `recurringTemplates` ever needs. Also needed for a
 * future "view another family member's finances" view to show their
 * upcoming recurring payments, not just what's already been generated into
 * transactions.
 */
export async function pullAllTemplates(): Promise<void> {
  if (!navigator.onLine) return
  await pullEntity('recurringTemplates', { scope: 'all' })
}

/**
 * Refreshes every family member's active budgets (own included) into
 * `budgets` — same reasoning and mechanics as pullAllAccounts/
 * pullAllTransactions: the per-profile stores/budgets.ts store filters this
 * same table client-side by `ownerId`, so this is the only network fetch
 * `budgets` ever needs. Also what a future whole-family budget view needs
 * (summing every member's budget per category).
 */
export async function pullAllBudgets(): Promise<void> {
  if (!navigator.onLine) return
  await pullEntity('budgets', { scope: 'all' })
}

let intervalHandle: ReturnType<typeof setInterval> | null = null

/**
 * Starts background sync: immediately, on regaining connectivity, and every
 * 1min while online. Call once per login. `fullSync` alone already covers
 * every entity, whole-family (see SYNC_ENTITIES) — pullAllAccounts/
 * pullAllCategories/pullAllTransactions/pullAllTemplates/pullAllBudgets stay
 * exported separately only for views/stores that want an immediate
 * on-demand refresh outside this interval (see stores/allAccounts.ts,
 * db/seed.ts, components/layout/UserSwitcherModal.vue).
 */
export function startAutoSync(getUserId: () => string | null): () => void {
  const run = () => {
    void fullSync(getUserId())
    void pullUserDirectory()
  }
  window.addEventListener('online', run)
  intervalHandle = setInterval(run, 60_000)
  run()

  return () => {
    window.removeEventListener('online', run)
    if (intervalHandle) clearInterval(intervalHandle)
    intervalHandle = null
  }
}

/** Queues a create/update — always a full-record upsert (see OutboxEntry's doc comment) — and tries to push right away. */
export async function enqueueUpsert(entity: SyncableEntity, ownerId: string, record: SyncRow): Promise<void> {
  await db.outbox.add({ entity, op: 'upsert', recordId: record.id, payload: record, ownerId, createdAt: Date.now() })
  void pushOutbox(ownerId)
}

/** Queues a delete and tries to push right away. */
export async function enqueueDelete(entity: SyncableEntity, ownerId: string, id: string): Promise<void> {
  await db.outbox.add({ entity, op: 'delete', recordId: id, ownerId, createdAt: Date.now() })
  void pushOutbox(ownerId)
}

/** Bulk variant of enqueueUpsert — demo-data seeding and recurring-template generation queue many records at once. */
export async function enqueueUpsertMany(entity: SyncableEntity, ownerId: string, records: SyncRow[]): Promise<void> {
  const now = Date.now()
  await db.outbox.bulkAdd(
    records.map((record) => ({ entity, op: 'upsert' as const, recordId: record.id, payload: record, ownerId, createdAt: now })),
  )
  void pushOutbox(ownerId)
}

/** Bulk variant of enqueueDelete — used by the "reset all data" flow. */
export async function enqueueDeleteMany(entity: SyncableEntity, ownerId: string, ids: string[]): Promise<void> {
  const now = Date.now()
  await db.outbox.bulkAdd(ids.map((recordId) => ({ entity, op: 'delete' as const, recordId, ownerId, createdAt: now })))
  void pushOutbox(ownerId)
}
