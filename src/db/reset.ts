import { deleteAndQueue } from './sync'
import { useAccountsStore } from '../stores/accounts'
import { useTransactionsStore } from '../stores/transactions'
import { useTemplatesStore } from '../stores/templates'
import { useReceiptsStore } from '../stores/receipts'
import { useBudgetsStore } from '../stores/budgets'
import { useAuthStore } from '../stores/auth'

/**
 * Wipes every account, transaction, recurring template, receipt ("чек"), and
 * budget owned by the current profile. Categories and settings (base
 * currency, theme) are left untouched — they're configuration, not financial
 * data, and demo data never needed them cleared either (see
 * stores/categories.ts's own `removeUnused` for that, a separate opt-in
 * action). Tags stay too, even the ones this profile created: like
 * categories they're shared by the whole family, so deleting them would strip
 * them from everyone else's operations as well. Only rows this profile
 * actually owns are removed (not cross-profile transfers someone else sent
 * us) — this is a reset of *my* data, not theirs. Transactions are queued
 * before accounts, so an account's delete reaches the server once nothing of
 * ours is left on it; one that such a transfer from someone else still
 * points at is refused as in use and comes back (see the backend's
 * sync/hooks/accounts.js beforeRemove). Also what makes loading
 * demo data a second time (after a reset) safe rather than piling up
 * duplicate budget rows for the same category+month — see demoData.ts's own
 * guard, which relies on this having already run.
 */
export async function resetAllData(): Promise<void> {
  const accounts = useAccountsStore()
  const transactions = useTransactionsStore()
  const templates = useTemplatesStore()
  const receipts = useReceiptsStore()
  const budgets = useBudgetsStore()
  const authStore = useAuthStore()
  const ownerId = authStore.uid!

  const ownTransactionIds = transactions.all.filter((t) => t.ownerId === ownerId).map((t) => t.id)
  const accountIds = accounts.all.map((a) => a.id)
  const templateIds = templates.all.map((t) => t.id)
  const receiptIds = receipts.all.filter((r) => r.ownerId === ownerId).map((r) => r.id)
  const budgetIds = budgets.all.filter((b) => b.ownerId === ownerId).map((b) => b.id)

  await deleteAndQueue('transactions', ownerId, ownTransactionIds)
  await deleteAndQueue('accounts', ownerId, accountIds)
  await deleteAndQueue('recurringTemplates', ownerId, templateIds)
  await deleteAndQueue('receipts', ownerId, receiptIds)
  await deleteAndQueue('budgets', ownerId, budgetIds)
}
