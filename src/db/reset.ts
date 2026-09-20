import { db } from './schema'
import { enqueueDeleteMany } from './sync'
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
 * stores/categories.ts's own `removeAll` for that, a separate opt-in
 * action). Only rows this profile actually owns are removed (not
 * cross-profile transfers someone else sent us) — this is a reset of *my*
 * data, not theirs. Also what makes loading demo data a second time (after a
 * reset) safe rather than piling up duplicate budget rows for the same
 * category+month — see demoData.ts's own guard, which relies on this having
 * already run.
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

  await db.transactions.bulkDelete(ownTransactionIds)
  await db.accounts.bulkDelete(accountIds)
  await db.recurringTemplates.bulkDelete(templateIds)
  await db.receipts.bulkDelete(receiptIds)
  await db.budgets.bulkDelete(budgetIds)

  await enqueueDeleteMany('transactions', ownerId, ownTransactionIds)
  await enqueueDeleteMany('accounts', ownerId, accountIds)
  await enqueueDeleteMany('recurringTemplates', ownerId, templateIds)
  await enqueueDeleteMany('receipts', ownerId, receiptIds)
  await enqueueDeleteMany('budgets', ownerId, budgetIds)
}
