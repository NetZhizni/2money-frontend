import { locale } from './locale'
import { common } from './messages/common'
import { errors } from './messages/errors'
import { transactions } from './messages/transactions'
import { period } from './messages/period'
import { layout } from './messages/layout'
import { accounts } from './messages/accounts'
import { sync } from './messages/sync'
import { overview } from './messages/overview'
import { currenciesMessages } from './messages/currencies'
import { login } from './messages/login'
import { admin } from './messages/admin'
import { categoriesMessages } from './messages/categories'
import { receiptsMessages } from './messages/receipts'
import { seedMessages } from './messages/seed'
import { csvMessages } from './messages/csv'

export { locale, BCP47, detectLocale, getLocaleSetting, setLocaleSetting } from './locale'
export type { Locale, LocaleSetting } from './locale'

// Merged via direct spread (not Array#map/Object.assign) so TypeScript keeps each
// namespace's literal key union instead of collapsing it to a bare `string` index.
const MESSAGES = {
  uk: { ...common.uk, ...errors.uk, ...transactions.uk, ...period.uk, ...layout.uk, ...accounts.uk, ...sync.uk, ...overview.uk, ...currenciesMessages.uk, ...login.uk, ...admin.uk, ...categoriesMessages.uk, ...receiptsMessages.uk, ...seedMessages.uk, ...csvMessages.uk },
  en: { ...common.en, ...errors.en, ...transactions.en, ...period.en, ...layout.en, ...accounts.en, ...sync.en, ...overview.en, ...currenciesMessages.en, ...login.en, ...admin.en, ...categoriesMessages.en, ...receiptsMessages.en, ...seedMessages.en, ...csvMessages.en },
}

export type MessageKey = keyof typeof MESSAGES.uk

function interpolate(str: string, params?: Record<string, string | number>): string {
  if (!params) return str
  return str.replace(/\{(\w+)\}/g, (match, key) => (key in params ? String(params[key]) : match))
}

/** Looks up `key` in the current locale, falling back to English, then the raw key itself. */
export function t(key: MessageKey, params?: Record<string, string | number>): string {
  const value: string = MESSAGES[locale][key] ?? MESSAGES.en[key] ?? key
  return interpolate(value, params)
}
