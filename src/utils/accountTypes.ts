import type { AccountType } from '../types/models'
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
 * Full display label for an account's type — used on the account card and
 * the account detail modal. A loan account has no stored direction: its
 * current balance's sign says who owes whom ("Loan (owed to me)" above zero,
 * "Loan (I owe)" below it, plain "Loan" once settled). Rounded to cents
 * first so float leftovers of a fully repaid loan still read as settled.
 */
export function accountTypeLabel(type: AccountType, balance = 0): string {
  if (type === 'loan') {
    const cents = Math.round(balance * 100)
    if (cents > 0) return `${t('accounts.type.loan')} (${t('accounts.loanBalance.owedToMe')})`
    if (cents < 0) return `${t('accounts.type.loan')} (${t('accounts.loanBalance.iOwe')})`
    return t('accounts.type.loan')
  }
  return t(ACCOUNT_TYPE_OPTIONS.find((o) => o.value === type)!.labelKey)
}
