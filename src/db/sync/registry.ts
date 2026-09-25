import type { SyncableEntity } from '../schema'

/**
 * The only shape the sync layer needs from a synced record: its id, and
 * whether the server has tombstoned it. Deletes are soft on the backend (see
 * its sync/engine.js), so a delta pull reports a removed row as a normal item
 * carrying `deletedAt` rather than simply omitting it — which is what lets a
 * client that's been offline learn about deletions at all.
 */
export type SyncRow = { id: string; deletedAt?: number | null }

/** Dexie table name -> REST resource path; they differ wherever the API uses kebab-case. */
export const RESOURCE_PATH: Record<SyncableEntity, string> = {
  accounts: 'accounts',
  categories: 'categories',
  tags: 'tags',
  transactions: 'transactions',
  recurringTemplates: 'recurring-templates',
  budgets: 'budgets',
  receipts: 'receipts',
}

/**
 * Every entity a full sync/resync covers. Pulled concurrently (see pull.ts's
 * pullMany), so this order carries no dependency meaning — a transaction can
 * land before the account it references, which is fine: the stores read
 * through Dexie and simply render nothing for an id that isn't there yet.
 */
export const SYNC_ENTITIES: SyncableEntity[] = ['accounts', 'categories', 'tags', 'transactions', 'recurringTemplates', 'budgets', 'receipts']

/** Rows of `entity` that go along with a deleted record: any whose `via` fields point at it — only the deleting profile's own with `ownOnly`. */
export interface DeleteCascade {
  entity: SyncableEntity
  via: string[]
  ownOnly: boolean
}

/**
 * What the server deletes along with a record (the backend's
 * sync/hooks/accounts.js afterRemove) — mirrored here so deleteAndQueue can
 * apply it to the local copy at once, offline included, in the same Dexie
 * transaction as the delete itself. Only the parent's delete is queued: the
 * server cascades on its own, atomically, so a refused delete leaves nothing
 * half-done there (and the outbox undoes the local half — see outbox.ts's
 * settle). Keep in step with the backend's hook.
 *
 * Operations are never taken along: an account (or category) that still has
 * any can't be deleted at all — see stores/accounts.ts's remove().
 */
export const DELETE_CASCADES: Partial<Record<SyncableEntity, DeleteCascade[]>> = {
  accounts: [
    // Everyone's: a template would only go on making operations nobody can file.
    { entity: 'recurringTemplates', via: ['accountId', 'toAccountId'], ownOnly: false },
  ],
}
