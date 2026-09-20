import type { PeriodGranularity } from '../stores/period'

export interface BudgetProgress {
  pct: number // 0..100, rounded and clamped
  over: boolean
  spent: number
  amount: number
}

/** Progress of `spent` against a monthly budget limit, or null when there's no (valid) budget set. */
export function budgetProgress(spent: number, budgetAmount: number | undefined | null): BudgetProgress | null {
  if (!budgetAmount || budgetAmount <= 0) return null
  return {
    pct: Math.min(100, Math.round((spent / budgetAmount) * 100)),
    over: spent > budgetAmount,
    spent,
    amount: budgetAmount,
  }
}

// --- month keys ---
// Every Budget (see types/models.ts) is anchored to one calendar month via a
// 'YYYY-MM' string key — plain and lexicographically sortable, and cheap to
// use as a Dexie index/map key without re-parsing a Date every time. `month`
// here is always 0-indexed (Date#getMonth()/stores/period.ts's own `month`
// ref convention), not the 1-indexed number embedded in the string.

/** `(2026, 0)` -> `'2026-01'`. */
export function monthKey(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}`
}

/** epoch-ms -> its 'YYYY-MM', in local time (matches startOfMonth/endOfMonth's own local-time month boundaries — see utils/format.ts). */
export function monthKeyFromTimestamp(ms: number): string {
  const d = new Date(ms)
  return monthKey(d.getFullYear(), d.getMonth())
}

/** The current calendar month's key, in local time. */
export function currentMonthKey(): string {
  return monthKeyFromTimestamp(Date.now())
}

/** `'YYYY-MM'` -> `{ year, month }` (0-indexed month). */
export function parseMonthKey(key: string): { year: number; month: number } {
  const [year, month] = key.split('-').map(Number)
  return { year, month: month - 1 }
}

/** `('2026-01', -1)` -> `'2025-12'`; `('2026-01', 1)` -> `'2026-02'`. */
export function shiftMonthKey(key: string, delta: number): string {
  const { year, month } = parseMonthKey(key)
  const d = new Date(year, month + delta, 1)
  return monthKey(d.getFullYear(), d.getMonth())
}

export interface MonthSegment {
  monthKey: string
  /** How many of the range's days fall in this month. */
  days: number
  /** That month's own total day count (28-31) — the denominator for prorating a monthly budget down to `days` of it. */
  daysInMonth: number
}

/**
 * Splits an inclusive day range (as produced by e.g. startOfWeek/endOfWeek —
 * local-time midnight to local-time 23:59:59.999) into one entry per
 * calendar month it touches, so a budget page can prorate a monthly amount
 * by "how many of this period's days actually belong to this month". A
 * same-month range (a single day, or all of `month` granularity itself)
 * comes back as one segment; a week straddling a month boundary comes back
 * as two.
 */
export function monthSegments(startTs: number, endTs: number): MonthSegment[] {
  const segments: MonthSegment[] = []
  let cursor = new Date(startTs)
  cursor.setHours(0, 0, 0, 0)
  const end = new Date(endTs)
  end.setHours(0, 0, 0, 0)
  while (cursor.getTime() <= end.getTime()) {
    const y = cursor.getFullYear()
    const m = cursor.getMonth()
    const lastDayOfMonth = new Date(y, m + 1, 0)
    const segmentEnd = lastDayOfMonth.getTime() < end.getTime() ? lastDayOfMonth : end
    const days = Math.round((segmentEnd.getTime() - cursor.getTime()) / 86400000) + 1
    segments.push({ monthKey: monthKey(y, m), days, daysInMonth: lastDayOfMonth.getDate() })
    cursor = new Date(y, m + 1, 1)
  }
  return segments
}

export interface BudgetDisplayPeriod {
  granularity: PeriodGranularity
  /** Only consulted for `granularity === 'year'`. */
  year: number
  /** Only consulted for day/week/month granularities (anything but 'year'/'all'). */
  start: number
  end: number
}

/**
 * Recalculates a category's monthly budget SETTING (budgets are always
 * per-calendar-month — see the month-key section above) into whatever
 * period granularity a page is actually showing it at:
 *  - day/week/month: each touched month's own amount, prorated by how many
 *    of the period's days fall in that month over its total day count (a
 *    week straddling two months blends both, weighted by days in each) —
 *    for 'month' itself this is exactly the one month's full amount, no
 *    rounding drift (days === daysInMonth there).
 *  - year: the sum of whatever was actually set for each of that year's 12
 *    months (an unset month contributes nothing — never backfilled).
 *  - all: whatever `allTimeTotal` reports (every budget ever set).
 * `monthlyTotal`/`allTimeTotal` are callbacks rather than a plain lookup
 * because only the caller knows what "this category's amount in month X"
 * means for its own view (e.g. summed across every family member's own row
 * in "Всі" mode) — see BudgetDataView.vue/CategoriesDataView.vue.
 */
export function proratedBudgetAmount(
  period: BudgetDisplayPeriod,
  monthlyTotal: (month: string) => number,
  allTimeTotal: () => number,
): number {
  if (period.granularity === 'all') return allTimeTotal()
  if (period.granularity === 'year') {
    let sum = 0
    for (let m = 0; m < 12; m++) sum += monthlyTotal(monthKey(period.year, m))
    return sum
  }
  return monthSegments(period.start, period.end).reduce(
    (s, seg) => s + (monthlyTotal(seg.monthKey) * seg.days) / seg.daysInMonth,
    0,
  )
}

/**
 * Rounds to a "human-picked" step that grows with the amount (nearest 10
 * below 200, nearest 50 below 1000, nearest 100 below 5000, else nearest
 * 500) — used for a forecast suggestion (BudgetDataView.vue's
 * forecastByCategory) and demo-data budget seeding (db/demoData.ts), so
 * neither looks like a raw average someone would never actually type in.
 */
export function roundToNiceAmount(amount: number): number {
  const step = amount >= 5000 ? 500 : amount >= 1000 ? 100 : amount >= 200 ? 50 : 10
  return Math.max(step, Math.round(amount / step) * step)
}
