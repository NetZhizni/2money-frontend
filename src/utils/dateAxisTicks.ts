/**
 * Picks where a time axis should put its labels so they land on calendar
 * dates people read at a glance — the 1st and 15th, month starts, New Year —
 * instead of ECharts' own auto-spaced picks, which on a phone-width chart come
 * out as a dense run of arbitrary days.
 */

export type DateTickUnit = 'day' | 'month' | 'year'

export interface DateAxisTicks {
  /**
   * End-of-day timestamps, ascending — the same instant `buildBalanceHistory`
   * samples each day at, so a label sits exactly on its own day's point.
   */
  values: number[]
  /** How the labels should read: 'day' → "15 Лип", 'month' → "Лип", 'year' → "2026". */
  unit: DateTickUnit
}

interface Candidate {
  unit: DateTickUnit
  /** Whether local calendar day `d` (the `index`-th day of the range) gets a label. */
  keep: (d: Date, index: number) => boolean
}

const monthDays = (days: number[]) => (d: Date) => days.includes(d.getDate())
const everyMonths = (n: number) => (d: Date) => d.getDate() === 1 && d.getMonth() % n === 0
const everyYears = (n: number) => (d: Date) => d.getDate() === 1 && d.getMonth() === 0 && d.getFullYear() % n === 0

// Finest first — `dateAxisTicks` takes the first one that fits under the cap.
// The 2/3-day steps count from the range's own first day rather than the
// day-of-month, so they never bunch up at a month boundary (31 → 1).
const CANDIDATES: Candidate[] = [
  { unit: 'day', keep: () => true },
  { unit: 'day', keep: (_, i) => i % 2 === 0 },
  { unit: 'day', keep: (_, i) => i % 3 === 0 },
  { unit: 'day', keep: monthDays([1, 8, 15, 22]) },
  { unit: 'day', keep: monthDays([1, 15]) },
  { unit: 'month', keep: everyMonths(1) },
  { unit: 'month', keep: everyMonths(2) },
  { unit: 'month', keep: everyMonths(3) },
  { unit: 'month', keep: everyMonths(6) },
  { unit: 'year', keep: everyYears(1) },
  { unit: 'year', keep: everyYears(2) },
  { unit: 'year', keep: everyYears(5) },
  { unit: 'year', keep: everyYears(10) },
]

/**
 * Collects `candidate`'s days from `from`'s day through `to`, giving up (null)
 * as soon as there are more than `max`. Each value is that day's end, so
 * `from`'s own day counts even when `from` is later than its midnight.
 */
function collect(candidate: Candidate, from: number, to: number, max: number): number[] | null {
  const values: number[] = []
  const day = new Date(from)
  day.setHours(23, 59, 59, 999)
  // setDate (not += 24h) so a DST switch can't drift the time off end-of-day.
  for (let i = 0; day.getTime() <= to; i++, day.setDate(day.getDate() + 1)) {
    if (!candidate.keep(day, i)) continue
    values.push(day.getTime())
    if (values.length > max) return null
  }
  return values
}

/** The finest calendar-aligned label set for [from, to] with at most `maxTicks` labels. */
export function dateAxisTicks(from: number, to: number, maxTicks = 7): DateAxisTicks {
  for (const candidate of CANDIDATES) {
    const values = collect(candidate, from, to, maxTicks)
    if (values) return { values, unit: candidate.unit }
  }
  // A span wider than even decade steps allow (70+ years) — still better
  // crowded than blank.
  const last = CANDIDATES[CANDIDATES.length - 1]
  return { values: collect(last, from, to, Infinity) ?? [], unit: last.unit }
}
