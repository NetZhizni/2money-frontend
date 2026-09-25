import Dexie, { type EntityTable } from 'dexie'
import type { Account, AppSettings, Budget, Category, ExchangeRateEntry, Receipt, RecurringTemplate, Tag, Transaction } from '../types/models'
import { monthKeyFromTimestamp } from '../utils/budget'

/** Minimal family-directory row — mirrors GET /api/users (id/displayName/photoUrl/color only, no email/role). */
export interface UserDirectoryEntry {
  id: string
  displayName: string
  photoUrl: string | null
  color: string
}

export type SyncableEntity = 'accounts' | 'categories' | 'tags' | 'transactions' | 'recurringTemplates' | 'budgets' | 'receipts'

/**
 * One queued local mutation, replayed against the API once online (see
 * src/db/sync/outbox.ts). Both create and update collapse into a single 'upsert' op
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
  /** When the change was made, on the server's clock (see db/sync/clock.ts) —
   * sent as `editedAt`, which is what the server settles two devices'
   * conflicting writes by (the later edit wins). */
  createdAt: number
  /** How many pushes the server answered for this entry with a server-side
   * error (5xx) — see outbox.ts's MAX_ATTEMPTS. */
  attempts?: number
  /** On a delete: the rows removed locally along with it (see
   * sync/registry.ts's DELETE_CASCADES), by entity — re-read from the server
   * if the delete itself is refused, so they come back with their parent. */
  cascade?: Partial<Record<SyncableEntity, string[]>>
}

/**
 * A local change the server never took, kept so the user can see what
 * happened to it (see components/layout/SyncStatusBadge.vue) instead of it
 * just vanishing:
 *   - 'rejected' — the server refused it for good (someone changed or
 *     deleted the record later, a rule like the currency lock, ...). The local
 *     copy has already been put back to the server's version.
 *   - 'failed'   — it kept failing on the server's side, or was still queued
 *     when a resync wiped the outbox. `payload` is what can be retried.
 */
export interface SyncIssue {
  id?: number
  ownerId: string
  kind: 'rejected' | 'failed'
  entity: SyncableEntity
  op: OutboxEntry['op']
  recordId: string
  payload?: Record<string, unknown>
  /** The server's reason code (see the backend's util/httpStatus.js reasonFor), or a client-side one ('failed', 'discarded'). */
  reason: string
  message?: string
  /** When the change itself was made — OutboxEntry.createdAt, so on the server's clock (see db/sync/clock.ts's toLocalTime). */
  editedAt: number
  /** When it was given up on. */
  at: number
}

/**
 * Per-entity delta-sync cursor (epoch ms of the last successful pull). Key is
 * usually just the entity name (own records), but a family-wide `?scope=all`
 * pull (see src/db/sync/pull.ts's pullEntity) tracks its own bookmark under
 * `"<entity>:all"` so the two never clobber each other's cursor.
 */
export interface SyncCursor {
  entity: SyncableEntity | `${SyncableEntity}:all`
  since: number
}

/**
 * Full local mirror of every entity, offline-first: all reads/writes in the
 * Pinia stores go through Dexie (never directly to the API — see
 * src/db/useSyncedCollection.ts), so the app works fully offline
 * on whatever was last synced, and every write queues into `outbox` for
 * replay. This replaces Firestore's persistentLocalCache + offline write
 * queue, which this app no longer has since Firestore is gone.
 */
export class AppDB extends Dexie {
  accounts!: EntityTable<Account, 'id'>
  categories!: EntityTable<Category, 'id'>
  tags!: EntityTable<Tag, 'id'>
  transactions!: EntityTable<Transaction, 'id'>
  recurringTemplates!: EntityTable<RecurringTemplate, 'id'>
  budgets!: EntityTable<Budget, 'id'>
  receipts!: EntityTable<Receipt, 'id'>
  settings!: EntityTable<AppSettings, 'id'>
  users!: EntityTable<UserDirectoryEntry, 'id'>
  outbox!: EntityTable<OutboxEntry, 'localId'>
  syncIssues!: EntityTable<SyncIssue, 'id'>
  syncCursors!: EntityTable<SyncCursor, 'entity'>
  exchangeRates!: EntityTable<ExchangeRateEntry, 'id'>

  constructor() {
    super('stork')

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

    // Adds `receipts` (see types/models.ts's Receipt) and an index on
    // transactions.receiptId so a receipt's other operations can be looked
    // up directly instead of scanning the whole table. Dexie only needs the
    // stores whose schema actually changed here — accounts/categories/etc.
    // carry forward unchanged from version(1).
    this.version(2).stores({
      transactions: 'id, *participantIds, accountId, toAccountId, date, updatedAt, receiptId',
      receipts: 'id, ownerId, updatedAt',
    })

    // Adds `tags` (see types/models.ts's Tag) and a multi-entry index on
    // transactions.tagIds, mirroring *participantIds above.
    this.version(3).stores({
      transactions: 'id, *participantIds, accountId, toAccountId, date, updatedAt, receiptId, *tagIds',
      tags: 'id, ownerId, updatedAt',
    })

    // Adds `month` (see types/models.ts's Budget) so a category can carry a
    // distinct budget per calendar month instead of one that silently
    // applied forever — and a compound index so a (categoryId, month) lookup
    // (stores/budgets.ts's forCategory) doesn't need a full table scan.
    // Existing rows predate the field; same backfill rule as the backend's
    // add-budget-month migration — anchor each to the month it was created
    // in, since that's the only month it's actually known to apply to.
    this.version(4)
      .stores({
        budgets: 'id, ownerId, categoryId, month, updatedAt, [categoryId+month]',
      })
      .upgrade((tx) =>
        tx
          .table('budgets')
          .toCollection()
          .modify((b: Budget) => {
            if (!b.month) b.month = monthKeyFromTimestamp(b.createdAt)
          }),
      )

    // Compound (dateKey, currency) index so the per-day rate lookup
    // (db/exchangeRates.ts) hits an index instead of scanning — that lookup
    // runs once per currency for every amount converted on screen.
    this.version(5).stores({
      exchangeRates: 'id, dateKey, currency, [dateKey+currency]',
    })

    // Changes the server never took — see SyncIssue.
    this.version(6).stores({
      syncIssues: '++id, ownerId, at',
    })
  }
}

export const db = new AppDB()
