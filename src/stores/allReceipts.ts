import { defineStore } from 'pinia'
import { ref } from 'vue'
import { liveQuery } from 'dexie'
import { db } from '../db/schema'
import { pullAllReceipts } from '../db/sync'
import type { Receipt } from '../types/models'

/**
 * Cross-profile view of every receipt — the Operations list groups a day's
 * transactions by `receiptId` regardless of whose profile is being viewed
 * (see views/OperationsDataView.vue), so it needs to resolve a receipt's
 * merchant/date the same way it resolves a transfer's counterparty account
 * via stores/allAccounts.ts. Own and foreign receipts live in the same Dexie
 * table (see src/db/sync.ts's pullAllReceipts) — this is just an unfiltered
 * view of it.
 */
export const useAllReceiptsStore = defineStore('allReceipts', () => {
  const all = ref<Receipt[]>([])
  const loaded = ref(false)
  let subscription: { unsubscribe: () => void } | null = null

  function load(): Promise<void> {
    stop()
    return new Promise((resolve) => {
      let first = true
      subscription = liveQuery(() => db.receipts.toArray()).subscribe({
        next: (rows) => {
          all.value = rows
          loaded.value = true
          if (first) {
            first = false
            resolve()
          }
        },
        error: (error) => console.error('[allReceipts] liveQuery failed', error),
      })
      void pullAllReceipts()
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

  function byId(id: string | null | undefined): Receipt | undefined {
    if (!id) return undefined
    return all.value.find((r) => r.id === id)
  }

  return { all, loaded, load, reset, byId }
})
