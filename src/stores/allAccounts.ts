import { defineStore } from 'pinia'
import { ref } from 'vue'
import { liveQuery } from 'dexie'
import { db } from '../db/schema'
import { useAuthStore } from './auth'
import { pullAllAccounts } from '../db/sync'
import type { Account } from '../types/models'

/**
 * Cross-profile view of every active account — anywhere a transfer's
 * COUNTERPARTY account needs to be displayed (operations list, search, edit
 * modal) looks it up here instead of the per-profile `accounts` store (own
 * accounts only). Own and foreign accounts live in the same Dexie table
 * (see src/db/sync.ts's pullAllAccounts) — this is just an unfiltered view of it.
 */
export const useAllAccountsStore = defineStore('allAccounts', () => {
  const all = ref<Account[]>([])
  const loaded = ref(false)
  let subscription: { unsubscribe: () => void } | null = null

  function load(): Promise<void> {
    stop()
    return new Promise((resolve) => {
      let first = true
      subscription = liveQuery(() => db.accounts.toArray()).subscribe({
        next: (rows) => {
          all.value = rows
          loaded.value = true
          if (first) {
            first = false
            resolve()
          }
        },
        error: (error) => console.error('[allAccounts] liveQuery failed', error),
      })
      const authStore = useAuthStore()
      void pullAllAccounts(authStore.uid)
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

  function byId(id: string | null | undefined): Account | undefined {
    if (!id) return undefined
    return all.value.find((a) => a.id === id)
  }

  return { all, loaded, load, reset, byId }
})
