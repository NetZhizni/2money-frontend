import { db as exchangeRatesDb } from './schema'
import { downloadFile } from '../utils/download'
import { useAccountsStore } from '../stores/accounts'
import { useCategoriesStore } from '../stores/categories'
import { useTransactionsStore } from '../stores/transactions'
import { useTemplatesStore } from '../stores/templates'
import { useBudgetsStore } from '../stores/budgets'
import { useSettingsStore } from '../stores/settings'
import { useAuthStore } from '../stores/auth'
import type { Account, Budget, Category, RecurringTemplate, Transaction } from '../types/models'

export interface BackupPayload {
  version: 1
  exportedAt: number
  accounts: Account[]
  categories: Category[]
  transactions: Transaction[]
  templates: RecurringTemplate[]
  budgets: Budget[]
  exchangeRates: unknown[]
  settings: { baseCurrency: string; theme: string }
}

/** Exports the signed-in profile's own data (already live-loaded in the Pinia stores). */
export async function exportData(): Promise<BackupPayload> {
  const accounts = useAccountsStore()
  const categories = useCategoriesStore()
  const transactions = useTransactionsStore()
  const templates = useTemplatesStore()
  const budgets = useBudgetsStore()
  const settings = useSettingsStore()

  return {
    version: 1,
    exportedAt: Date.now(),
    accounts: accounts.all,
    categories: categories.all,
    transactions: transactions.all,
    templates: templates.all,
    budgets: budgets.all,
    exchangeRates: await exchangeRatesDb.exchangeRates.toArray(),
    settings: { baseCurrency: settings.baseCurrency, theme: settings.theme },
  }
}

export function downloadBackup(payload: BackupPayload): void {
  const stamp = new Date(payload.exportedAt).toISOString().slice(0, 10)
  downloadFile(JSON.stringify(payload, null, 2), `fintrack-backup-${stamp}.json`, 'application/json')
}

/**
 * Imports into the CURRENTLY SIGNED-IN profile only. Every re-imported doc is
 * re-stamped with this profile's uid (never trusting `ownerId`/`participantIds`
 * baked into the file) — otherwise re-importing an old backup, or someone
 * else's export, would silently create docs owned by a stale/foreign uid.
 * Cross-profile transfers in the export lose their counterparty link on
 * import (the counterparty's own copy of that transfer is unaffected, since
 * it's the same shared document elsewhere — import only touches THIS
 * profile's own accounts/categories/transactions/templates/budgets).
 */
export async function importData(payload: BackupPayload): Promise<void> {
  if (!payload || payload.version !== 1) throw new Error('Непідтримуваний формат файлу резервної копії')

  const authStore = useAuthStore()
  const ownerId = authStore.uid
  if (!ownerId) throw new Error('Потрібно увійти в систему')

  const accounts = useAccountsStore()
  const categories = useCategoriesStore()
  const transactions = useTransactionsStore()
  const templates = useTemplatesStore()
  const budgets = useBudgetsStore()
  const settings = useSettingsStore()

  for (const a of accounts.all) await accounts.remove(a.id)
  for (const c of categories.all) await categories.remove(c.id)
  for (const t of transactions.all) await transactions.remove(t.id)
  for (const t of templates.all) await templates.remove(t.id)
  for (const b of budgets.all) await budgets.remove(b.id)

  for (const a of payload.accounts) {
    const { id: _id, ownerId: _o, createdAt: _c, order: _ord, ...rest } = a
    await accounts.add(rest)
  }
  for (const c of payload.categories) {
    const { id: _id, ownerId: _o, createdAt: _c, order: _ord, ...rest } = c
    await categories.add(rest)
  }
  for (const t of payload.transactions) {
    const { id: _id, ownerId: _o, participantIds: _p, createdAt: _c, updatedAt: _u, ...rest } = t
    await transactions.add(rest)
  }
  for (const t of payload.templates) {
    const { id: _id, ownerId: _o, createdAt: _c, ...rest } = t
    await templates.add(rest)
  }
  for (const b of payload.budgets) {
    const { id: _id, ownerId: _o, createdAt: _c, ...rest } = b
    await budgets.add(rest)
  }

  await settings.setBaseCurrency(payload.settings.baseCurrency)
  await settings.setTheme(payload.settings.theme as 'system' | 'light' | 'dark')
}
