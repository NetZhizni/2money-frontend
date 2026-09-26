import type { Account } from '../types/models'

export interface CreditStatus {
  limit: number
  used: number // credit drawn right now — how far the balance is below zero
  available: number // own money plus the undrawn limit (balance + limit), never below zero
  ratio: number // used / limit, clamped to [0, 1]
  overLimit: number // how far past the limit the balance has gone (0 while within it)
}

/** Whether `account` carries a credit limit at all — only a regular account can. */
export function hasCreditLimit(account: Account): boolean {
  return account.type === 'regular' && !!account.creditLimit && account.creditLimit > 0
}

// A balance summed from many operations picks up float noise (-0.30000000000000004)
// that would otherwise show up as "over the limit by 0.00".
const cents = (n: number) => Math.round(n * 100) / 100

/**
 * Where an account stands against its credit limit. `balance` is its current
 * native-currency balance — the account's own money, negative once credit is
 * drawn — so what can still be spent is that plus the limit.
 */
export function creditStatus(account: Account, balance: number): CreditStatus | null {
  if (!hasCreditLimit(account)) return null
  const limit = account.creditLimit!
  const used = cents(Math.max(0, -balance))
  const headroom = cents(balance + limit)
  return {
    limit,
    used,
    available: Math.max(0, headroom),
    ratio: Math.min(1, used / limit),
    overLimit: Math.max(0, -headroom),
  }
}
