import { db } from './schema'
import { putAndQueue, withTabLock } from './sync'
import { newId } from '../utils/id'
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
 * Writes go straight to Dexie + the outbox (see src/db/sync/outbox.ts) — the
 * transactions/templates stores' liveQuery views pick this up on their own.
 */
export async function generateDueRecurring(
  templates: RecurringTemplate[],
  ownerId: string,
  now: number = Date.now(),
): Promise<number> {
  const due = templates.filter((t) => t.active && t.nextDate <= now)

  let generatedCount = 0
  const newTransactions: Transaction[] = []
  const updatedTemplates: RecurringTemplate[] = []

  for (const template of due) {
    let cursor = template.nextDate
    let iterations = 0
    while (cursor <= now && (!template.endDate || cursor <= template.endDate) && iterations < 1000) {
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

  await putAndQueue('transactions', ownerId, newTransactions)
  await putAndQueue('recurringTemplates', ownerId, updatedTemplates)

  return generatedCount
}

/**
 * generateDueRecurring over `ownerId`'s templates as Dexie has them right
 * now, under a lock shared by every tab (see db/sync/lock.ts). Two tabs
 * opening together would otherwise both find the same occurrences due and
 * each generate them; this way the second one reads the nextDate the first
 * already moved on, and finds nothing left. Read inside the lock rather than
 * taken from a store's in-memory list, which can still predate the other
 * tab's write.
 *
 * Two DEVICES can still both generate the same occurrence — nothing here is
 * shared between them; each occurrence would need an id both derive alike.
 */
export function runDueRecurring(ownerId: string, now: number = Date.now()): Promise<number> {
  return withTabLock(`stork:recurring:${ownerId}`, async () => {
    const templates = await db.recurringTemplates.where('ownerId').equals(ownerId).toArray()
    return generateDueRecurring(templates, ownerId, now)
  })
}

export function computeInitialNextDate(startDate: number): number {
  return startDate
}
