import { isAxiosError } from 'axios'
import http from '../api/http'
import { db, type SyncableEntity } from './schema'
import type { Account, Transaction } from '../types/models'

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

/**
 * Drains the outbox in FIFO order, one entry at a time, only for records
 * queued under the currently signed-in user (see OutboxEntry.ownerId).
 * Stops at the first entry that fails for a retryable reason — later
 * entries stay queued behind it so ordering is preserved on the next drain.
 */
export async function pushOutbox(currentUserId: string | null): Promise<void> {
  if (!currentUserId || !navigator.onLine) return
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
}

/** Pulls one entity's delta (or full active set, on first sync) and merges it into Dexie. */
async function pullEntity(entity: SyncableEntity): Promise<void> {
  const path = RESOURCE_PATH[entity]
  const cursor = await db.syncCursors.get(entity)
  const { data } = await http.get<{ items: SyncRow[]; syncedAt: number }>(`/${path}`, {
    params: cursor?.since ? { since: cursor.since } : {},
  })

  const table = db[entity] as unknown as { put: (row: SyncRow) => Promise<unknown>; delete: (id: string) => Promise<void> }
  await db.transaction('rw', db[entity], db.syncCursors, async () => {
    for (const item of data.items) {
      if (item.deletedAt) await table.delete(item.id)
      else await table.put(item)
    }
    await db.syncCursors.put({ entity, since: data.syncedAt })
  })
}

const ALL_ENTITIES: SyncableEntity[] = ['accounts', 'categories', 'transactions', 'recurringTemplates', 'budgets']

/** Push pending local writes, then pull fresh data for every entity. Safe to call repeatedly/concurrently. */
export async function fullSync(currentUserId: string | null): Promise<void> {
  if (!currentUserId || !navigator.onLine) return
  await pushOutbox(currentUserId)
  await Promise.all(
    ALL_ENTITIES.map((entity) => pullEntity(entity).catch((error) => console.error(`[sync] pull ${entity} failed`, error))),
  )
}

/** Refreshes the small, non-syncable-via-outbox family directory (see stores/profiles.ts). */
export async function pullUserDirectory(): Promise<void> {
  if (!navigator.onLine) return
  const { data } = await http.get('/users')
  await db.users.bulkPut(data)
}

/**
 * Refreshes every OTHER family member's active accounts into the same
 * `accounts` table as the signed-in user's own (delta-synced separately by
 * pullEntity('accounts')) — cheap since it's a small, family-scale list, and
 * it means stores/allAccounts.ts is just "the whole table" with no separate
 * cache to keep in sync. This endpoint has no delta/tombstone story (always
 * the full active set), so a foreign account no longer in the response is
 * swept out of the local cache here instead.
 */
export async function pullAllAccounts(currentUserId: string | null): Promise<void> {
  if (!navigator.onLine) return
  const { data } = await http.get<Account[]>('/accounts', { params: { scope: 'all' } })
  const seenIds = new Set(data.map((a) => a.id))
  await db.transaction('rw', db.accounts, async () => {
    await db.accounts.bulkPut(data)
    const stale = await db.accounts
      .filter((a) => a.ownerId !== currentUserId && !seenIds.has(a.id))
      .primaryKeys()
    if (stale.length) await db.accounts.bulkDelete(stale)
  })
}

/**
 * Refreshes every family member's active transactions into the same
 * `transactions` table as the signed-in user's own (delta-synced separately
 * by pullEntity('transactions')) — same reasoning as pullAllAccounts: this
 * app's trust model is full financial transparency within the family (every
 * account is already visible to everyone via `accounts?scope=all`), so
 * TotalBalanceView's combined-balance breakdown needs the same for transactions.
 */
export async function pullAllTransactions(currentUserId: string | null): Promise<void> {
  if (!navigator.onLine) return
  const { data } = await http.get<Transaction[]>('/transactions', { params: { scope: 'all' } })
  const seenIds = new Set(data.map((t) => t.id))
  await db.transaction('rw', db.transactions, async () => {
    await db.transactions.bulkPut(data)
    const stale = await db.transactions
      .filter((t) => !t.participantIds.includes(currentUserId ?? '') && !seenIds.has(t.id))
      .primaryKeys()
    if (stale.length) await db.transactions.bulkDelete(stale)
  })
}

let intervalHandle: ReturnType<typeof setInterval> | null = null

/** Starts background sync: immediately, on regaining connectivity, and every 30s while online. Call once per login. */
export function startAutoSync(getUserId: () => string | null): () => void {
  const run = () => {
    void fullSync(getUserId())
    void pullUserDirectory()
    void pullAllAccounts(getUserId())
    void pullAllTransactions(getUserId())
  }
  window.addEventListener('online', run)
  intervalHandle = setInterval(run, 30_000)
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
