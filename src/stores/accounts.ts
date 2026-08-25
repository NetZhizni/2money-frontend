import { defineStore } from 'pinia'
import { computed } from 'vue'
import { db } from '../db/schema'
import { useSyncedCollection } from '../db/useSyncedCollection'
import { newId } from '../utils/id'
import { convertLatest } from '../db/exchangeRates'
import { accountDelta } from '../utils/balanceHistory'
import { useAuthStore } from './auth'
import { useTransactionsStore } from './transactions'
import type { Account, Transaction } from '../types/models'

export type NewAccountInput = Omit<Account, 'id' | 'createdAt' | 'order' | 'ownerId'>

/** Native-currency running balance for one account, from its transactions. */
export function computeAccountBalance(account: Account, transactions: Transaction[], asOf?: number): number {
  let balance = account.initialBalance
  for (const t of transactions) {
    if (asOf != null && t.date > asOf) continue
    balance += accountDelta(account.id, t)
  }
  return balance
}

export const useAccountsStore = defineStore('accounts', () => {
  const authStore = useAuthStore()
  const collection = useSyncedCollection<Account>('accounts', async () => {
    if (!authStore.uid) return []
    const rows = await db.accounts.where('ownerId').equals(authStore.uid).toArray()
    return rows.sort((a, b) => a.order - b.order)
  })

  function load(): Promise<void> {
    if (!authStore.uid) return Promise.resolve()
    return collection.load()
  }

  const active = computed(() => collection.all.value.filter((a) => !a.archived))
  const archived = computed(() => collection.all.value.filter((a) => a.archived))

  async function add(input: NewAccountInput): Promise<Account> {
    const order = collection.all.value.length ? Math.max(...collection.all.value.map((a) => a.order)) + 1 : 0
    const account: Account = { ...input, id: newId(), ownerId: authStore.uid!, order, createdAt: Date.now() }
    await collection.put(account)
    return account
  }

  async function update(id: string, patch: Partial<Account>): Promise<void> {
    const current = collection.all.value.find((a) => a.id === id)
    if (!current) return
    await collection.put({ ...current, ...patch })
  }

  async function setArchived(id: string, archivedValue: boolean): Promise<void> {
    await update(id, { archived: archivedValue })
  }

  /** Hard delete: also cascades to every transaction that touches this account. */
  async function remove(id: string): Promise<void> {
    const transactions = useTransactionsStore()
    await transactions.removeByAccount(id)
    await collection.removeLocal(id)
  }

  function balanceOf(account: Account): number {
    const transactions = useTransactionsStore()
    return computeAccountBalance(account, transactions.forAccount(account.id))
  }

  /**
   * Sum of all `includeInTotal` account balances converted to `targetCurrency`
   * (the app's base currency, or a display-currency override) via NBU.
   * Archiving an account only hides it from active pickers (account selects
   * when creating a transaction) — it's still real money, so it keeps
   * counting toward the total for as long as `includeInTotal` is set. Per
   * spec, this rollup always uses the LATEST NBU rate (never the
   * manually-edited per-operation rate, and never a historical rate) — `asOf`
   * only limits which transactions count, not which rate is used. Pivots
   * correctly through UAH regardless of what `targetCurrency` is.
   */
  async function totalBalanceInBase(targetCurrency: string, asOf?: number): Promise<number> {
    const transactions = useTransactionsStore()
    let total = 0
    for (const account of collection.all.value) {
      if (!account.includeInTotal) continue
      const native = computeAccountBalance(account, transactions.forAccount(account.id), asOf)
      total += await convertLatest(native, account.currency, targetCurrency)
    }
    return total
  }

  return {
    all: collection.all,
    loaded: collection.loaded,
    active,
    archived,
    load,
    reset: collection.reset,
    isPending: collection.isPending,
    add,
    update,
    setArchived,
    remove,
    balanceOf,
    totalBalanceInBase,
  }
})
