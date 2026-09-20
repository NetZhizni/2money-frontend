import { liveQuery } from 'dexie'
import { ref, type Ref } from 'vue'
import type { SyncableEntity } from './schema'
import { db } from './schema'
import { enqueueDelete, enqueueDeleteMany, enqueueUpsert } from './sync'
import { useAuthStore } from '../stores/auth'

/**
 * The offline-first plumbing shared by every entity store (accounts,
 * categories, transactions, recurringTemplates, budgets): a Dexie
 * `liveQuery` view (the closest analog to Firestore's `onSnapshot`,
 * including reacting to writes from other tabs) plus `put`/`removeLocal`,
 * which write straight to Dexie and queue the same change into the outbox
 * for the API (see src/db/sync.ts). Each store wraps this with its own
 * `add`/`update`/domain-specific helpers — this only owns the mechanical part.
 */
export function useSyncedCollection<T extends { id: string }>(entity: SyncableEntity, queryFn: () => Promise<T[]> | T[]) {
  const all = ref<T[]>([]) as Ref<T[]>
  const loaded = ref(false)
  let subscription: { unsubscribe: () => void } | null = null

  // A record is "pending" (queued on this device, not yet confirmed by the
  // backend) exactly when it still has an entry in the outbox — there's no
  // separate synced/pending field on the record itself (see OutboxEntry's
  // doc comment: create and update both collapse into one idempotent
  // upsert), so this is derived live from the same queue src/db/sync.ts
  // drains, scoped to this entity.
  const pendingIds = ref<Set<string>>(new Set())
  let pendingSubscription: { unsubscribe: () => void } | null = null

  function isPending(id: string): boolean {
    return pendingIds.value.has(id)
  }

  function load(): Promise<void> {
    stop()
    pendingSubscription = liveQuery(() => db.outbox.where('entity').equals(entity).toArray()).subscribe({
      next: (entries) => {
        pendingIds.value = new Set(entries.map((e) => e.recordId))
      },
      error: (error) => console.error(`[${entity}] pending liveQuery failed`, error),
    })
    return new Promise((resolve) => {
      let first = true
      subscription = liveQuery(queryFn).subscribe({
        next: (rows) => {
          all.value = rows
          loaded.value = true
          if (first) {
            first = false
            resolve()
          }
        },
        error: (error) => console.error(`[${entity}] liveQuery failed`, error),
      })
    })
  }

  function stop() {
    subscription?.unsubscribe()
    subscription = null
    pendingSubscription?.unsubscribe()
    pendingSubscription = null
  }

  function reset() {
    stop()
    all.value = []
    loaded.value = false
    pendingIds.value = new Set()
  }

  /** Optimistic local write (create or update — Dexie `put` is an upsert) + queue for the API. */
  async function put(record: T): Promise<void> {
    const authStore = useAuthStore()
    await (db[entity] as unknown as { put: (r: T) => Promise<unknown> }).put(record)
    if (authStore.uid) await enqueueUpsert(entity, authStore.uid, record as unknown as { id: string })
  }

  /** Optimistic local delete + queue for the API. */
  async function removeLocal(id: string): Promise<void> {
    const authStore = useAuthStore()
    await (db[entity] as unknown as { delete: (id: string) => Promise<void> }).delete(id)
    if (authStore.uid) await enqueueDelete(entity, authStore.uid, id)
  }

  /**
   * Bulk variant of removeLocal — one Dexie `bulkDelete` + one batched outbox
   * write instead of N single-row deletes. Each single-row `delete()` re-runs
   * this collection's `liveQuery` (a full re-query + re-sort of the whole
   * table) and the Vue reactivity it drives, so deleting many records one at
   * a time turns an O(n) cascade (e.g. "clear all categories", which also
   * cascades into every transaction under them) into an O(n²) one. Use this
   * whenever more than a single record is being removed together.
   */
  async function removeManyLocal(ids: string[]): Promise<void> {
    if (ids.length === 0) return
    const authStore = useAuthStore()
    await (db[entity] as unknown as { bulkDelete: (ids: string[]) => Promise<void> }).bulkDelete(ids)
    if (authStore.uid) await enqueueDeleteMany(entity, authStore.uid, ids)
  }

  return { all, loaded, load, stop, reset, put, removeLocal, removeManyLocal, pendingIds, isPending }
}
