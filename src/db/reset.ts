import { db } from './schema'
import { enqueueDeleteMany } from './sync'
import { useAccountsStore } from '../stores/accounts'
import { useTransactionsStore } from '../stores/transactions'
import { useTemplatesStore } from '../stores/templates'
import { useAuthStore } from '../stores/auth'

/**
 * Wipes every account, transaction, and recurring template owned by the
 * current profile. Categories and settings (base currency, theme) are left
 * untouched — they're configuration, not financial data, and demo data never
 * needed them cleared either. Only transactions this profile actually owns
 * are removed (not cross-profile transfers someone else sent us) — this is a
 * reset of *my* data, not theirs.
 */
export async function resetAllData(): Promise<void> {
  const accounts = useAccountsStore()
  const transactions = useTransactionsStore()
  const templates = useTemplatesStore()
  const authStore = useAuthStore()
  const ownerId = authStore.uid!

  const ownTransactionIds = transactions.all.filter((t) => t.ownerId === ownerId).map((t) => t.id)
  const accountIds = accounts.all.map((a) => a.id)
  const templateIds = templates.all.map((t) => t.id)

  await db.transactions.bulkDelete(ownTransactionIds)
  await db.accounts.bulkDelete(accountIds)
  await db.recurringTemplates.bulkDelete(templateIds)

  await enqueueDeleteMany('transactions', ownerId, ownTransactionIds)
  await enqueueDeleteMany('accounts', ownerId, accountIds)
  await enqueueDeleteMany('recurringTemplates', ownerId, templateIds)
}
