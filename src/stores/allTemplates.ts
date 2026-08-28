import { defineStore } from 'pinia'
import { ref } from 'vue'
import { liveQuery } from 'dexie'
import { db } from '../db/schema'
import { pullAllTemplates } from '../db/sync'
import type { RecurringTemplate } from '../types/models'

/**
 * Cross-profile view of every family member's recurring templates — for a
 * future "view another family member's finances" screen, which should show
 * their upcoming recurring payments too, not just their already-generated
 * transactions. Own and foreign templates live in the same Dexie table (see
 * src/db/sync.ts's pullAllTemplates) — this is just an unfiltered view of
 * it, same pattern as stores/allAccounts.ts.
 */
export const useAllTemplatesStore = defineStore('allTemplates', () => {
  const all = ref<RecurringTemplate[]>([])
  const loaded = ref(false)
  let subscription: { unsubscribe: () => void } | null = null

  function load(): Promise<void> {
    stop()
    return new Promise((resolve) => {
      let first = true
      subscription = liveQuery(() => db.recurringTemplates.toArray()).subscribe({
        next: (rows) => {
          all.value = rows
          loaded.value = true
          if (first) {
            first = false
            resolve()
          }
        },
        error: (error) => console.error('[allTemplates] liveQuery failed', error),
      })
      void pullAllTemplates()
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

  function byId(id: string | null | undefined): RecurringTemplate | undefined {
    if (!id) return undefined
    return all.value.find((t) => t.id === id)
  }

  return { all, loaded, load, reset, byId }
})
