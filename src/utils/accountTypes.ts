import type { AccountType, LoanDirection } from '../types/models'
import { t } from '../i18n'
import type { MessageKey } from '../i18n'

/**
 * Single source of truth for the "Regular / Savings / Loan" account
 * type switcher — used by the accounts tab list, the create/edit form, and
 * anywhere an account's type needs an icon/color default. Order here is the
 * canonical display order everywhere this type appears.
 */
export const ACCOUNT_TYPE_OPTIONS: Array<{ value: AccountType; labelKey: MessageKey; icon: string; color: string }> = [
  { value: 'regular', labelKey: 'accounts.type.regular', icon: 'mdiWalletOutline', color: '#2a78d6' },
  { value: 'savings', labelKey: 'accounts.type.savings', icon: 'mdiPiggyBankOutline', color: '#1baf7a' },
  { value: 'loan', labelKey: 'accounts.type.loan', icon: 'mdiHandshakeOutline', color: '#eda100' },
]

/** Default icon/color assigned to a new account when its type is picked. */
export const ACCOUNT_TYPE_DEFAULTS: Record<AccountType, { icon: string; color: string }> = Object.fromEntries(
  ACCOUNT_TYPE_OPTIONS.map((o) => [o.value, { icon: o.icon, color: o.color }]),
) as Record<AccountType, { icon: string; color: string }>

/**
 * Loan direction toggle shown on the account form ("I lent it" / "I borrowed
 * it"), plus the short parenthetical form ("lent" / "borrowed") used wherever
 * a loan account's direction is shown alongside its type.
 */
export const LOAN_DIRECTION_OPTIONS: Array<{ value: LoanDirection; labelKey: MessageKey; shortLabelKey: MessageKey }> = [
  { value: 'lent', labelKey: 'accounts.loanDirection.lent', shortLabelKey: 'accounts.loanDirection.lentShort' },
  { value: 'borrowed', labelKey: 'accounts.loanDirection.borrowed', shortLabelKey: 'accounts.loanDirection.borrowedShort' },
]

/**
 * Full display label for an account's type, e.g. "Loan (lent)" for a loan
 * account — used on the account card and the account detail modal.
 */
export function accountTypeLabel(type: AccountType, loanDirection?: LoanDirection): string {
  if (type === 'loan') {
    const direction = LOAN_DIRECTION_OPTIONS.find((o) => o.value === (loanDirection ?? 'lent'))!
    return `${t('accounts.type.loan')} (${t(direction.shortLabelKey)})`
  }
  return t(ACCOUNT_TYPE_OPTIONS.find((o) => o.value === type)!.labelKey)
}
