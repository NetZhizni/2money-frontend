import { describe, expect, test } from 'vitest'
import { creditStatus, hasCreditLimit } from '../creditLimit'
import type { Account } from '../../types/models'

const account = (overrides: Partial<Account> = {}): Account => ({
  id: 'c1',
  ownerId: 'u1',
  name: 'Картка',
  type: 'regular',
  currency: 'UAH',
  icon: 'mdiCreditCardOutline',
  color: '#000000',
  initialBalance: 0,
  includeInTotal: true,
  archived: false,
  order: 0,
  createdAt: 0,
  creditLimit: 20000,
  ...overrides,
})

describe('creditStatus', () => {
  test('only a regular account with a positive limit has one', () => {
    expect(hasCreditLimit(account())).toBe(true)
    expect(hasCreditLimit(account({ creditLimit: null }))).toBe(false)
    expect(hasCreditLimit(account({ creditLimit: 0 }))).toBe(false)
    expect(hasCreditLimit(account({ type: 'savings' }))).toBe(false)
    expect(creditStatus(account({ type: 'loan' }), -100)).toBeNull()
  })

  test('own money on top of an untouched limit is all available', () => {
    expect(creditStatus(account(), 3000)).toEqual({ limit: 20000, used: 0, available: 23000, ratio: 0, overLimit: 0 })
  })

  test('a negative balance is credit drawn against the limit', () => {
    expect(creditStatus(account(), -5000)).toEqual({ limit: 20000, used: 5000, available: 15000, ratio: 0.25, overLimit: 0 })
  })

  test('past the limit nothing is available and the excess is reported', () => {
    expect(creditStatus(account(), -20500)).toEqual({ limit: 20000, used: 20500, available: 0, ratio: 1, overLimit: 500 })
  })

  test('float noise in the balance does not register as over the limit', () => {
    const status = creditStatus(account({ creditLimit: 0.3 }), -0.1 - 0.2)!
    expect(status.overLimit).toBe(0)
    expect(status.available).toBe(0)
  })
})
