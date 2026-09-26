import { describe, expect, it, vi } from 'vitest'

vi.mock('../../i18n', () => ({ t: (key: string) => key }))

import { accountTypeLabel } from '../accountTypes'

describe('accountTypeLabel', () => {
  it('labels a loan by its balance sign', () => {
    expect(accountTypeLabel('loan', 1500)).toBe('accounts.type.loan (accounts.loanBalance.owedToMe)')
    expect(accountTypeLabel('loan', -1500)).toBe('accounts.type.loan (accounts.loanBalance.iOwe)')
  })

  it('shows a settled loan without a suffix, float leftovers included', () => {
    expect(accountTypeLabel('loan', 0)).toBe('accounts.type.loan')
    expect(accountTypeLabel('loan')).toBe('accounts.type.loan')
    expect(accountTypeLabel('loan', 0.1 + 0.2 - 0.3)).toBe('accounts.type.loan')
  })

  it('ignores the balance for other account types', () => {
    expect(accountTypeLabel('regular', -500)).toBe('accounts.type.regular')
    expect(accountTypeLabel('savings', 500)).toBe('accounts.type.savings')
  })
})
