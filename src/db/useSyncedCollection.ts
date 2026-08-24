import { liveQuery } from 'dexie'
import { ref, type Ref } from 'vue'
import type { SyncableEntity } from './schema'
import { db } from './schema'
import { enqueueDelete, enqueueUpsert } from './sync'
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

  function load(): Promise<void> {
    stop()
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
  }

  function reset() {
    stop()
    all.value = []
    loaded.value = false
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

  return { all, loaded, load, stop, reset, put, removeLocal }
}
