import type { Account, Transaction } from '../types/models'
import { endOfDay } from './format'

export interface BalancePoint {
  date: number
  balance: number
}

/** Signed native-currency delta this transaction applies to `accountId`; 0 if the transaction doesn't touch it. */
export function accountDelta(accountId: string, t: Transaction): number {
  let delta = 0
  if (t.type === 'income' && t.accountId === accountId) delta += t.amount
  else if (t.type === 'expense' && t.accountId === accountId) delta -= t.amount
  else if (t.type === 'transfer') {
    if (t.accountId === accountId) delta -= t.amount
    if (t.toAccountId === accountId) delta += t.toAmount ?? t.amount
  }
  return delta
}

/**
 * Samples an account's running balance at `opts.points` evenly-spaced dates
 * between `from` and `to` (inclusive), each snapped to end-of-day. Uses a
 * single forward pass over the (sorted) transactions rather than calling
 * `computeAccountBalance` once per sample — that would re-scan every
 * transaction per point, which gets expensive once a range spans many
 * samples. Transactions dated before `from` are folded into the running
 * total before the first sample, so the first point is a correct opening
 * balance rather than restarting from zero.
 */
export function buildBalanceHistory(
  account: Account,
  transactions: Transaction[],
  opts: { from: number; to: number; points: number },
): BalancePoint[] {
  const { from, to, points } = opts
  const sorted = [...transactions].sort((a, b) => a.date - b.date)

  const sampleDates: number[] = []
  for (let i = 0; i < points; i++) {
    const t = points === 1 ? to : from + Math.round((i * (to - from)) / (points - 1))
    sampleDates.push(endOfDay(t))
  }

  const result: BalancePoint[] = []
  let running = account.initialBalance
  let i = 0
  for (const date of sampleDates) {
    while (i < sorted.length && sorted[i].date <= date) {
      running += accountDelta(account.id, sorted[i])
      i++
    }
    result.push({ date, balance: running })
  }
  return result
}
