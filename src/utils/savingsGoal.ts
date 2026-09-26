import { accountDelta } from './balanceHistory'
import type { Account, Transaction } from '../types/models'

const DAY_MS = 24 * 60 * 60 * 1000
const AVG_MONTH_DAYS = 30.44
/** How far back the saving pace is measured — long enough to smooth one irregular month, short enough to reflect the current habit. */
const PACE_WINDOW_DAYS = 90
/** Below this much history there's no pace worth extrapolating from. */
const MIN_PACE_DAYS = 14

export interface GoalProgress {
  target: number
  remaining: number // what's still missing, never negative
  ratio: number // 0..1, share of the target already saved
  reached: boolean
  // Only with a goal date (null otherwise):
  monthsLeft: number | null // monthly contributions (on today's day of month, today's included) that still fit before the date — 0 once it has passed
  perMonth: number | null // what to put aside each of those months to make it
  overdue: boolean // the date has passed without the target reached
  // From the account's recent history (null when there's too little of it):
  pacePerMonth: number | null // average net inflow per month over the last few months
  eta: number | null // when the target is reached at that pace (null if the pace doesn't get there)
}

/** Whether `account` carries a goal at all — only a savings account can. */
export function hasGoal(account: Account): boolean {
  return account.type === 'savings' && !!account.goalAmount && account.goalAmount > 0
}

/** How many monthly dates on `now`'s day of month, `now` itself included, fall on or before `date`. */
function monthsUntil(now: number, date: number): number {
  const n = new Date(now)
  const d = new Date(date)
  const months = (d.getFullYear() - n.getFullYear()) * 12 + (d.getMonth() - n.getMonth()) + (d.getDate() >= n.getDate() ? 1 : 0)
  return Math.max(0, months)
}

/**
 * Where a savings account stands against its goal. `balance` is its current
 * native-currency balance; `transactions` are the ones touching it (any
 * order) — only used for the saving pace.
 */
export function goalProgress(account: Account, balance: number, transactions: Transaction[], now: number = Date.now()): GoalProgress | null {
  if (!hasGoal(account)) return null
  const target = account.goalAmount!
  const remaining = Math.max(0, target - balance)
  const reached = remaining === 0
  const ratio = Math.min(1, Math.max(0, balance / target))

  let monthsLeft: number | null = null
  let perMonth: number | null = null
  let overdue = false
  if (account.goalDate != null) {
    monthsLeft = monthsUntil(now, account.goalDate)
    overdue = !reached && account.goalDate < now
    perMonth = reached ? 0 : remaining / Math.max(1, monthsLeft)
  }

  // The account's history starts at its earliest operation when that's
  // older than the account row itself (an imported backup, demo data).
  const historyStart = transactions.reduce((min, t) => Math.min(min, t.date), account.createdAt)
  const windowStart = Math.max(now - PACE_WINDOW_DAYS * DAY_MS, historyStart)
  const windowDays = (now - windowStart) / DAY_MS
  let pacePerMonth: number | null = null
  let eta: number | null = null
  if (windowDays >= MIN_PACE_DAYS) {
    let net = 0
    for (const t of transactions) {
      if (t.date >= windowStart && t.date <= now) net += accountDelta(account.id, t)
    }
    pacePerMonth = (net / windowDays) * AVG_MONTH_DAYS
    if (!reached && pacePerMonth > 0) {
      const days = (remaining / pacePerMonth) * AVG_MONTH_DAYS
      if (days < 100 * 365) eta = now + days * DAY_MS
    }
  }

  return { target, remaining, ratio, reached, monthsLeft, perMonth, overdue, pacePerMonth, eta }
}
