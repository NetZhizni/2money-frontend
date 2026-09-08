import { defineStore } from 'pinia'
import { computed } from 'vue'
import { db } from '../db/schema'
import { useSyncedCollection } from '../db/useSyncedCollection'
import { newId } from '../utils/id'
import { convertLatest } from '../db/exchangeRates'
import { accountDelta } from '../utils/balanceHistory'
import { useAuthStore } from './auth'
import { useViewAsStore } from './viewAs'
import { useSettingsStore } from './settings'
import { useTransactionsStore } from './transactions'
import { useTemplatesStore } from './templates'
import { assertWritable } from './guards'
import { t } from '../i18n'
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
  const viewAs = useViewAsStore()
  const collection = useSyncedCollection<Account>('accounts', async () => {
    // 'all' mode (viewAs.effectiveUid === null): every family member's accounts, unfiltered.
    const rows =
      viewAs.mode === 'all'
        ? await db.accounts.toArray()
        : viewAs.effectiveUid
          ? await db.accounts.where('ownerId').equals(viewAs.effectiveUid).toArray()
          : []
    return rows.sort((a, b) => a.order - b.order)
  })

  function load(): Promise<void> {
    if (!authStore.uid) return Promise.resolve()
    return collection.load()
  }

  const active = computed(() => collection.all.value.filter((a) => !a.archived))
  const archived = computed(() => collection.all.value.filter((a) => a.archived))

  async function add(input: NewAccountInput): Promise<Account> {
    assertWritable()
    const order = collection.all.value.length ? Math.max(...collection.all.value.map((a) => a.order)) + 1 : 0
    // Defense-in-depth — AccountFormModal.vue already always sends a currency
    // (defaulting to the base one), same as the backend's own fallback (see
    // upsertAccount.js).
    const currency = input.currency || useSettingsStore().baseCurrency
    const account: Account = { ...input, currency, id: newId(), ownerId: authStore.uid!, order, createdAt: Date.now() }
    await collection.put(account)
    return account
  }

  /** Whether this account has ANY operation against it (as source or destination) — see the server-side twin in AccountModel/upsertAccount.js, which enforces this for real. */
  async function hasTransactions(id: string): Promise<boolean> {
    const count = await db.transactions.where('accountId').equals(id).or('toAccountId').equals(id).count()
    return count > 0
  }

  async function update(id: string, patch: Partial<Account>): Promise<void> {
    assertWritable()
    const current = collection.all.value.find((a) => a.id === id)
    if (!current) return
    await collection.put({ ...current, ...patch })
  }

  async function setArchived(id: string, archivedValue: boolean): Promise<void> {
    await update(id, { archived: archivedValue })
  }

  /** Hard delete: also cascades to every transaction that touches this account. */
  async function remove(id: string): Promise<void> {
    assertWritable()
    const transactions = useTransactionsStore()
    await transactions.removeByAccount(id)
    await collection.removeLocal(id)
  }

  /**
   * Folds `sourceId` into `targetId` (both must share a currency — merging
   * across currencies would silently corrupt balance math) — for
   * consolidating accidental duplicate cards. `target.initialBalance`
   * absorbs `source.initialBalance` so its running balance ends up exactly
   * what the two used to add up to, and this profile's own
   * transactions/recurring templates pointing at source are repointed to
   * target. Only this profile's own rows are ever touched — a cross-profile
   * transfer some OTHER family member sent to this account isn't ours to
   * rewrite (the backend only accepts writes to records this profile owns),
   * which is exactly why source is deleted outright only once NOTHING in
   * the whole family still touches it (hasTransactions() is already
   * unfiltered by owner); otherwise it's archived instead, so it drops out
   * of pickers without leaving whoever's cross-profile transfer still
   * points at it dangling.
   */
  async function merge(sourceId: string, targetId: string): Promise<void> {
    assertWritable()
    if (sourceId === targetId) return
    const source = collection.all.value.find((a) => a.id === sourceId)
    const target = collection.all.value.find((a) => a.id === targetId)
    if (!source || !target) return
    if (source.currency !== target.currency) throw new Error(t('errors.mergeCurrencyMismatch'))

    const myUid = authStore.uid
    const transactions = useTransactionsStore()
    for (const tx of transactions.all.filter(
      (row) => row.ownerId === myUid && (row.accountId === sourceId || row.toAccountId === sourceId),
    )) {
      if (tx.accountId === sourceId) await transactions.update(tx.id, { accountId: targetId })
      if (tx.toAccountId === sourceId) await transactions.update(tx.id, { toAccountId: targetId })
    }
    const templates = useTemplatesStore()
    for (const rec of templates.all.filter((row) => row.accountId === sourceId || row.toAccountId === sourceId)) {
      if (rec.accountId === sourceId) await templates.update(rec.id, { accountId: targetId })
      if (rec.toAccountId === sourceId) await templates.update(rec.id, { toAccountId: targetId })
    }

    await update(targetId, { initialBalance: target.initialBalance + source.initialBalance })

    if (await hasTransactions(sourceId)) {
      await setArchived(sourceId, true)
    } else {
      await remove(sourceId)
    }
  }

  function balanceOf(account: Account): number {
    const transactions = useTransactionsStore()
    return computeAccountBalance(account, transactions.forAccount(account.id))
  }

  /**
   * Sum of all `includeInTotal` account balances converted to `targetCurrency`
   * (the app's base currency, or a display-currency override).
   * Archiving an account only hides it from active pickers (account selects
   * when creating a transaction) — it's still real money, so it keeps
   * counting toward the total for as long as `includeInTotal` is set. Per
   * spec, this rollup always uses the LATEST rate (never the manually-edited
   * per-operation rate, and never a historical rate) — `asOf` only limits
   * which transactions count, not which rate is used. Pivots correctly
   * through UAH regardless of what `targetCurrency` is.
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
    merge,
    hasTransactions,
    balanceOf,
    totalBalanceInBase,
  }
})
