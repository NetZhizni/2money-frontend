import Dexie, { type EntityTable } from 'dexie'
import type { Account, AppSettings, Budget, Category, ExchangeRateEntry, RecurringTemplate, Transaction } from '../types/models'

/** Minimal family-directory row — mirrors GET /api/users (id/displayName/photoUrl/color only, no email/role). */
export interface UserDirectoryEntry {
  id: string
  displayName: string
  photoUrl: string | null
  color: string
}

export type SyncableEntity = 'accounts' | 'categories' | 'transactions' | 'recurringTemplates' | 'budgets'

/**
 * One queued local mutation, replayed against the API once online (see
 * src/db/sync.ts). Both create and update collapse into a single 'upsert' op
 * — every syncable entity's POST endpoint is an idempotent full-record
 * upsert keyed by the client-generated id (UUIDv7), so there's no need to
 * distinguish "this id is new" from "this id already synced once".
 */
export interface OutboxEntry {
  localId?: number
  entity: SyncableEntity
  op: 'upsert' | 'delete'
  recordId: string
  payload?: Record<string, unknown>
  /** Whoever was signed in when this was queued — a replay only ever runs
   * under that same session's token, so a device shared between two family
   * members can't accidentally attribute one person's offline edit to
   * whoever happens to be signed in when the queue next drains. */
  ownerId: string
  createdAt: number
}

/**
 * Per-entity delta-sync cursor (epoch ms of the last successful pull). Key is
 * usually just the entity name (own records), but a family-wide `?scope=all`
 * pull (see src/db/sync.ts's pullEntity) tracks its own bookmark under
 * `"<entity>:all"` so the two never clobber each other's cursor.
 */
export interface SyncCursor {
  entity: SyncableEntity | `${SyncableEntity}:all`
  since: number
}

/**
 * Full local mirror of every entity, offline-first: all reads/writes in the
 * Pinia stores go through Dexie (never directly to the API — see
 * src/db/sync.ts's createSyncedCollection), so the app works fully offline
 * on whatever was last synced, and every write queues into `outbox` for
 * replay. This replaces Firestore's persistentLocalCache + offline write
 * queue, which this app no longer has since Firestore is gone.
 */
export class AppDB extends Dexie {
  accounts!: EntityTable<Account, 'id'>
  categories!: EntityTable<Category, 'id'>
  transactions!: EntityTable<Transaction, 'id'>
  recurringTemplates!: EntityTable<RecurringTemplate, 'id'>
  budgets!: EntityTable<Budget, 'id'>
  settings!: EntityTable<AppSettings, 'id'>
  users!: EntityTable<UserDirectoryEntry, 'id'>
  outbox!: EntityTable<OutboxEntry, 'localId'>
  syncCursors!: EntityTable<SyncCursor, 'entity'>
  exchangeRates!: EntityTable<ExchangeRateEntry, 'id'>

  constructor() {
    super('2money')

    this.version(1).stores({
      accounts: 'id, ownerId, updatedAt, archived',
      categories: 'id, ownerId, parentId, updatedAt',
      transactions: 'id, *participantIds, accountId, toAccountId, date, updatedAt',
      recurringTemplates: 'id, ownerId, updatedAt, nextDate',
      budgets: 'id, ownerId, categoryId, updatedAt',
      settings: 'id',
      users: 'id',
      outbox: '++localId, entity, ownerId, createdAt',
      syncCursors: 'entity',
      exchangeRates: 'id, dateKey, currency',
    })
  }
}

export const db = new AppDB()
