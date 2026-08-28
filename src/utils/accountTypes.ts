import type { AccountType, LoanDirection } from '../types/models'

/**
 * Single source of truth for the "Звичайний / Зберігаючий / Позика" account
 * type switcher — used by the accounts tab list, the create/edit form, and
 * anywhere an account's type needs an icon/color default. Order here is the
 * canonical display order everywhere this type appears.
 */
export const ACCOUNT_TYPE_OPTIONS: Array<{ value: AccountType; label: string; icon: string; color: string }> = [
  { value: 'regular', label: 'Звичайний', icon: 'mdiWalletOutline', color: '#2a78d6' },
  { value: 'savings', label: 'Зберігаючий', icon: 'mdiPiggyBankOutline', color: '#1baf7a' },
  { value: 'loan', label: 'Позика', icon: 'mdiHandshakeOutline', color: '#eda100' },
]

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = Object.fromEntries(
  ACCOUNT_TYPE_OPTIONS.map((o) => [o.value, o.label]),
) as Record<AccountType, string>

/** Default icon/color assigned to a new account when its type is picked. */
export const ACCOUNT_TYPE_DEFAULTS: Record<AccountType, { icon: string; color: string }> = Object.fromEntries(
  ACCOUNT_TYPE_OPTIONS.map((o) => [o.value, { icon: o.icon, color: o.color }]),
) as Record<AccountType, { icon: string; color: string }>

/**
 * Loan direction toggle shown on the account form ("Я позичив" / "Я взяв
 * позику"), plus the short parenthetical form ("дав" / "взяв") used wherever
 * a loan account's direction is shown alongside its type.
 */
export const LOAN_DIRECTION_OPTIONS: Array<{ value: LoanDirection; label: string; shortLabel: string }> = [
  { value: 'lent', label: 'Я позичив (дав)', shortLabel: 'дав' },
  { value: 'borrowed', label: 'Я взяв позику', shortLabel: 'взяв' },
]

export const LOAN_DIRECTION_SHORT_LABELS: Record<LoanDirection, string> = Object.fromEntries(
  LOAN_DIRECTION_OPTIONS.map((o) => [o.value, o.shortLabel]),
) as Record<LoanDirection, string>

/**
 * Full display label for an account's type, e.g. "Позика (дав)" for a loan
 * account — used on the account card and the account detail modal.
 */
export function accountTypeLabel(type: AccountType, loanDirection?: LoanDirection): string {
  if (type === 'loan') {
    const short = LOAN_DIRECTION_SHORT_LABELS[loanDirection ?? 'lent']
    return `${ACCOUNT_TYPE_LABELS.loan} (${short})`
  }
  return ACCOUNT_TYPE_LABELS[type]
}
