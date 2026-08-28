import { defineStore } from 'pinia'
import { ref } from 'vue'
import { liveQuery } from 'dexie'
import { db } from '../db/schema'
import { pullAllBudgets } from '../db/sync'
import type { Budget } from '../types/models'

/**
 * Cross-profile view of every family member's budgets — for a future
 * whole-family budget view (sum of every member's budget per category), not
 * just the signed-in user's own. Own and foreign budgets live in the same
 * Dexie table (see src/db/sync.ts's pullAllBudgets) — this is just an
 * unfiltered view of it, same pattern as stores/allAccounts.ts.
 */
export const useAllBudgetsStore = defineStore('allBudgets', () => {
  const all = ref<Budget[]>([])
  const loaded = ref(false)
  let subscription: { unsubscribe: () => void } | null = null

  function load(): Promise<void> {
    stop()
    return new Promise((resolve) => {
      let first = true
      subscription = liveQuery(() => db.budgets.toArray()).subscribe({
        next: (rows) => {
          all.value = rows
          loaded.value = true
          if (first) {
            first = false
            resolve()
          }
        },
        error: (error) => console.error('[allBudgets] liveQuery failed', error),
      })
      void pullAllBudgets()
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

  function forCategory(categoryId: string, ownerId: string): Budget | undefined {
    return all.value.find((b) => b.categoryId === categoryId && b.ownerId === ownerId)
  }

  return { all, loaded, load, reset, forCategory }
})
