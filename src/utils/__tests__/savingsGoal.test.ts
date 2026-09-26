import { describe, expect, test, vi } from 'vitest'

// format.ts pulls in the i18n/locale setup, which needs a browser — and
// nothing it formats is under test here.
vi.mock('../format', () => ({ endOfDay: (ts: number) => ts }))

import { goalProgress, hasGoal } from '../savingsGoal'
import type { Account, Transaction } from '../../types/models'

const at = (year: number, month: number, day: number) => new Date(year, month - 1, day, 12).getTime()
const NOW = at(2026, 9, 25)

const account = (overrides: Partial<Account> = {}): Account => ({
  id: 's1',
  ownerId: 'u1',
  name: 'Відпустка',
  type: 'savings',
  currency: 'UAH',
  icon: 'mdiPiggyBank',
  color: '#000000',
  initialBalance: 0,
  includeInTotal: true,
  archived: false,
  order: 0,
  createdAt: at(2026, 1, 1),
  goalAmount: 12000,
  ...overrides,
})

const deposit = (date: number, amount: number): Transaction => ({
  id: `tx-${date}`,
  ownerId: 'u1',
  participantIds: ['u1'],
  type: 'transfer',
  date,
  accountId: 'card',
  toAccountId: 's1',
  amount,
  currency: 'UAH',
  createdAt: date,
  updatedAt: date,
})

describe('goalProgress', () => {
  test('only a savings account with a positive target has a goal', () => {
    expect(hasGoal(account())).toBe(true)
    expect(hasGoal(account({ type: 'regular' }))).toBe(false)
    expect(hasGoal(account({ goalAmount: null }))).toBe(false)
    expect(goalProgress(account({ goalAmount: 0 }), 100, [], NOW)).toBeNull()
  })

  test('splits what is left over the months up to the goal date, this one included', () => {
    const progress = goalProgress(account({ goalDate: at(2026, 12, 31) }), 3000, [], NOW)!
    expect(progress.remaining).toBe(9000)
    expect(progress.ratio).toBe(0.25)
    expect(progress.monthsLeft).toBe(4) // Sep, Oct, Nov, Dec
    expect(progress.perMonth).toBe(2250)
    expect(progress.overdue).toBe(false)
  })

  test('counts monthly contributions on today’s day of month that still fall before the goal date', () => {
    expect(goalProgress(account({ goalDate: at(2026, 11, 10) }), 0, [], NOW)!.monthsLeft).toBe(2) // Sep 25, Oct 25
  })

  test('a passed date is overdue and asks for everything left at once', () => {
    const progress = goalProgress(account({ goalDate: at(2026, 8, 1) }), 2000, [], NOW)!
    expect(progress.overdue).toBe(true)
    expect(progress.monthsLeft).toBe(0)
    expect(progress.perMonth).toBe(10000)
  })

  test('a reached goal is full, whatever the balance beyond it', () => {
    const progress = goalProgress(account({ goalDate: at(2026, 8, 1) }), 15000, [], NOW)!
    expect(progress.reached).toBe(true)
    expect(progress.ratio).toBe(1)
    expect(progress.remaining).toBe(0)
    expect(progress.overdue).toBe(false)
    expect(progress.eta).toBeNull()
  })

  test('projects when the goal is reached at the recent saving pace', () => {
    const txs = [deposit(at(2026, 7, 1), 1000), deposit(at(2026, 8, 1), 1000), deposit(at(2026, 9, 1), 1000)]
    const progress = goalProgress(account(), 6000, txs, NOW)!
    expect(progress.pacePerMonth).toBeCloseTo((3000 / 90) * 30.44)
    const monthsToGo = 6000 / progress.pacePerMonth!
    expect(progress.eta).toBeCloseTo(NOW + monthsToGo * 30.44 * 24 * 60 * 60 * 1000, -3)
  })

  test('history older than the account row itself (an import) still counts toward the pace', () => {
    const txs = [deposit(at(2026, 7, 1), 1000), deposit(at(2026, 8, 1), 1000), deposit(at(2026, 9, 1), 1000)]
    const imported = goalProgress(account({ createdAt: at(2026, 9, 25) }), 6000, txs, NOW)!
    const days = (NOW - at(2026, 7, 1)) / (24 * 60 * 60 * 1000) // from the first deposit, which counts
    expect(imported.pacePerMonth).toBeCloseTo((3000 / days) * 30.44)
    expect(imported.eta).not.toBeNull()
  })

  test('no projection without a positive pace or enough history', () => {
    expect(goalProgress(account(), 0, [], NOW)!.eta).toBeNull()
    const fresh = goalProgress(account({ createdAt: at(2026, 9, 20) }), 0, [deposit(at(2026, 9, 21), 500)], NOW)!
    expect(fresh.pacePerMonth).toBeNull()
  })
})
