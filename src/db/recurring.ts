import { db } from './schema'
import { putAndQueue, withTabLock } from './sync'
import { newId } from '../utils/id'
import type { RecurringTemplate, RecurringFrequency, Transaction } from '../types/models'

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

/**
 * The occurrence `interval` periods after `date`, on the schedule `anchor`
 * sets (a template's startDate — see RecurringTemplate). Monthly and yearly
 * schedules keep the anchor's day of month (and, yearly, its month), clamped
 * to the last day of a shorter month: a payment on the 31st lands on Feb 28,
 * then back on Mar 31 — not on Mar 3, which is where plain `setMonth(+1)`
 * rolls Jan 31 over to, and where the schedule then stays for good.
 * Time of day is kept from `date`.
 */
export function advance(date: number, frequency: RecurringFrequency, interval: number, anchor: number = date): number {
  const d = new Date(date)
  switch (frequency) {
    case 'daily':
      d.setDate(d.getDate() + interval)
      break
    case 'weekly':
      d.setDate(d.getDate() + 7 * interval)
      break
    case 'monthly': {
      const day = new Date(anchor).getDate()
      d.setDate(1)
      d.setMonth(d.getMonth() + interval)
      d.setDate(Math.min(day, daysInMonth(d.getFullYear(), d.getMonth())))
      break
    }
    case 'yearly': {
      const a = new Date(anchor)
      d.setDate(1)
      d.setFullYear(d.getFullYear() + interval, a.getMonth())
      d.setDate(Math.min(a.getDate(), daysInMonth(d.getFullYear(), d.getMonth())))
      break
    }
  }
  return d.getTime()
}

/**
 * `date` put back on `anchor`'s schedule if it's one the old month-overflow
 * bug pushed off it (see advance): an anchor on the 29th–31st overflowed
 * into the first days of the next month (Jan 31 → Mar 3) and the schedule
 * kept that day from then on (Apr 3, May 3, ...); a Feb 29 anchor rolled to
 * Mar 1. Such a date stands for the previous month's occurrence, which is
 * what this returns. A date already on schedule (or any daily/weekly one)
 * comes back unchanged.
 */
export function alignToSchedule(date: number, frequency: RecurringFrequency, anchor: number): number {
  const d = new Date(date)
  const a = new Date(anchor)
  const anchorDay = a.getDate()
  if (frequency === 'monthly') {
    if (anchorDay <= 28 || d.getDate() > anchorDay - 28) return date
    d.setDate(1)
    d.setMonth(d.getMonth() - 1)
    d.setDate(Math.min(anchorDay, daysInMonth(d.getFullYear(), d.getMonth())))
    return d.getTime()
  }
  if (frequency === 'yearly') {
    if (a.getMonth() !== 1 || anchorDay !== 29 || d.getMonth() !== 2 || d.getDate() !== 1) return date
    d.setDate(daysInMonth(d.getFullYear(), 1))
    d.setMonth(1)
    return d.getTime()
  }
  return date
}

/** The template's next occurrence — its nextDate, put back on schedule if the old month-overflow bug moved it (see alignToSchedule). */
export function scheduledNext(template: RecurringTemplate): number {
  return alignToSchedule(template.nextDate, template.frequency, template.startDate)
}

/** Whether the schedule has run past its end date — as opposed to merely paused (see RecurringTemplate.active). */
export function isFinished(template: RecurringTemplate): boolean {
  return template.endDate != null && scheduledNext(template) > template.endDate
}

/**
 * Every occurrence of an active template from its next one up to `to`
 * (inclusive), skipping those before `from` — at most `limit` of them.
 * A paused or finished template has none.
 */
export function occurrencesBetween(template: RecurringTemplate, from: number, to: number, limit = 400): number[] {
  if (!template.active) return []
  const result: number[] = []
  let cursor = scheduledNext(template)
  for (let i = 0; i < 5000 && cursor <= to && result.length < limit; i++) {
    if (template.endDate != null && cursor > template.endDate) break
    if (cursor >= from) result.push(cursor)
    cursor = advance(cursor, template.frequency, template.interval, template.startDate)
  }
  return result
}

/** The first occurrence on or after `from` — where a resumed template picks up, skipping whatever fell due while it was paused. */
export function firstOccurrenceFrom(template: RecurringTemplate, from: number): number {
  let cursor = scheduledNext(template)
  for (let i = 0; i < 5000 && cursor < from; i++) {
    cursor = advance(cursor, template.frequency, template.interval, template.startDate)
  }
  return cursor
}

/** The template with `occurrence` dealt with — booked or skipped: nextDate moves one step past it, and a schedule that thereby ends goes inactive. */
export function passOccurrence(template: RecurringTemplate, occurrence: number): RecurringTemplate {
  const nextDate = advance(occurrence, template.frequency, template.interval, template.startDate)
  return { ...template, nextDate, active: template.endDate == null || nextDate <= template.endDate }
}

/** One occurrence of `template` as an operation, the way both auto-booking and "confirm" (see TransactionFormModal.vue's `occurrence`) record it. */
export function occurrenceTransaction(
  template: RecurringTemplate,
  date: number,
  ownerId: string,
  toOwnerId: string | undefined,
  now: number,
): Transaction {
  return {
    id: newId(),
    ownerId,
    participantIds: toOwnerId && toOwnerId !== ownerId ? [ownerId, toOwnerId] : [ownerId],
    type: template.type,
    date,
    accountId: template.accountId,
    toAccountId: template.toAccountId,
    categoryId: template.categoryId,
    subcategoryId: template.subcategoryId ?? null,
    amount: template.amount,
    toAmount: template.toAmount ?? undefined,
    currency: template.currency,
    note: template.note,
    templateId: template.id,
    tagIds: template.tagIds?.length ? [...template.tagIds] : undefined,
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * Runs on app start, given the current profile's already-loaded templates.
 * For every active template whose next occurrence has arrived, generates one
 * transaction PER missed occurrence (per user's decision: if the app wasn't
 * opened for a while, history stays honest rather than collapsing missed
 * periods into a single catch-up entry), then advances nextDate past "now".
 * A template set to `requireConfirm` is left alone: its due occurrences wait
 * on the Recurring page (see views/RecurringView.vue) for the user to book
 * or skip each one. Writes go straight to Dexie + the outbox (see
 * src/db/sync/outbox.ts) — the transactions/templates stores' liveQuery views
 * pick this up on their own.
 */
export async function generateDueRecurring(
  templates: RecurringTemplate[],
  ownerId: string,
  now: number = Date.now(),
): Promise<number> {
  const due = templates.filter((t) => t.active && !t.requireConfirm && scheduledNext(t) <= now)
  if (!due.length) return 0

  // A transfer into another family member's account involves them too — the
  // server derives participantIds itself, but this device's own "view as"
  // lists read the local copy before that round trip.
  const toAccountIds = [...new Set(due.map((t) => t.toAccountId).filter((id): id is string => !!id))]
  const toAccounts = toAccountIds.length ? await db.accounts.bulkGet(toAccountIds) : []
  const ownerOfAccount = new Map(toAccounts.filter((a) => !!a).map((a) => [a!.id, a!.ownerId]))

  const newTransactions: Transaction[] = []
  const updatedTemplates: RecurringTemplate[] = []

  for (const template of due) {
    const toOwnerId = template.toAccountId ? ownerOfAccount.get(template.toAccountId) : undefined
    let current = template
    let cursor = scheduledNext(template)
    let iterations = 0
    while (cursor <= now && (current.endDate == null || cursor <= current.endDate) && iterations < 1000) {
      newTransactions.push(occurrenceTransaction(template, cursor, ownerId, toOwnerId, now))
      current = passOccurrence(current, cursor)
      cursor = current.nextDate
      iterations++
    }
    updatedTemplates.push({ ...current, nextDate: cursor, active: current.endDate == null || cursor <= current.endDate })
  }

  await putAndQueue('transactions', ownerId, newTransactions)
  await putAndQueue('recurringTemplates', ownerId, updatedTemplates)

  return newTransactions.length
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
