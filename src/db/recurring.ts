import { db } from './schema'
import { enqueueUpsertMany } from './sync'
import { newId } from '../utils/id'
import { convertAmount, BASE_CURRENCY } from './exchangeRates'
import type { RecurringTemplate, RecurringFrequency, Transaction } from '../types/models'

export function advance(date: number, frequency: RecurringFrequency, interval: number): number {
  const d = new Date(date)
  switch (frequency) {
    case 'daily':
      d.setDate(d.getDate() + interval)
      break
    case 'weekly':
      d.setDate(d.getDate() + 7 * interval)
      break
    case 'monthly':
      d.setMonth(d.getMonth() + interval)
      break
    case 'yearly':
      d.setFullYear(d.getFullYear() + interval)
      break
  }
  return d.getTime()
}

/**
 * Runs on app start, given the current profile's already-loaded templates.
 * For every active template whose `nextDate` has arrived, generates one
 * transaction PER missed occurrence (per user's decision: if the app wasn't
 * opened for a while, history stays honest rather than collapsing missed
 * periods into a single catch-up entry), then advances nextDate past "now".
 * Writes go straight to Dexie + the outbox (see src/db/sync.ts) — the
 * transactions/templates stores' liveQuery views pick this up on their own.
 */
export async function generateDueRecurring(
  templates: RecurringTemplate[],
  ownerId: string,
  now: number = Date.now(),
  baseCurrency: string = BASE_CURRENCY,
): Promise<number> {
  const due = templates.filter((t) => t.active && t.nextDate <= now)

  let generatedCount = 0
  const newTransactions: Transaction[] = []
  const updatedTemplates: RecurringTemplate[] = []

  for (const template of due) {
    let cursor = template.nextDate
    let iterations = 0
    while (cursor <= now && (!template.endDate || cursor <= template.endDate) && iterations < 1000) {
      const rate = await convertAmount(1, template.currency, baseCurrency, cursor)
      const signedBase =
        template.type === 'expense' ? -template.amount * rate : template.type === 'income' ? template.amount * rate : 0

      newTransactions.push({
        id: newId(),
        ownerId,
        participantIds: [ownerId],
        type: template.type,
        date: cursor,
        accountId: template.accountId,
        toAccountId: template.toAccountId,
        categoryId: template.categoryId,
        subcategoryId: template.subcategoryId ?? null,
        amount: template.amount,
        currency: template.currency,
        exchangeRate: rate,
        baseAmount: signedBase,
        note: template.note,
        templateId: template.id,
        createdAt: now,
        updatedAt: now,
      })
      generatedCount++
      cursor = advance(cursor, template.frequency, template.interval)
      iterations++
    }

    const stillActive = !template.endDate || cursor <= template.endDate
    updatedTemplates.push({ ...template, nextDate: cursor, active: stillActive })
  }

  if (newTransactions.length) {
    await db.transactions.bulkPut(newTransactions)
    await enqueueUpsertMany('transactions', ownerId, newTransactions)
  }
  if (updatedTemplates.length) {
    await db.recurringTemplates.bulkPut(updatedTemplates)
    await enqueueUpsertMany('recurringTemplates', ownerId, updatedTemplates)
  }

  return generatedCount
}

export function computeInitialNextDate(startDate: number): number {
  return startDate
}

export { BASE_CURRENCY }
