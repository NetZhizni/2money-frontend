// Core domain types for the finance tracker.
// All money amounts are stored as plain numbers in the entity's own currency.
// A base-currency equivalent, when one is needed for display, is always
// computed on the fly (see composables/useBaseCurrency.ts) from the CURRENT
// rate — nothing here stores a historical exchange-rate snapshot.

import type { CurrencyDisplayStyle, NumberFormatStyle, DateFormatStyle } from '../utils/format'
import type { LocaleSetting } from '../i18n/locale'

export type AccountType = 'regular' | 'savings' | 'loan'

/** Loan accounts can represent money the user lent out, or money the user borrowed. */
export type LoanDirection = 'lent' | 'borrowed'

export interface Account {
  id: string
  ownerId: string // uid of the profile this account belongs to
  name: string
  type: AccountType
  currency: string // ISO 4217 code, e.g. "UAH", "USD", "EUR"
  icon: string // mdi icon name (key into ICONS map)
  color: string // categorical slot hex
  initialBalance: number
  loanDirection?: LoanDirection // only meaningful when type === 'loan'
  includeInTotal: boolean
  archived: boolean
  order: number
  createdAt: number
  note?: string
  // Per-account override of Settings → "Формат валюти" (see
  // utils/format.ts's CurrencyDisplayStyle/formatMoney) — unset/null means
  // "use the base Settings choice", same convention as `currency` above
  // meaning "no fixed currency" before it became mandatory. Wire this
  // through `formatMoney(amount, account.currency, { currencyDisplay:
  // account.currencyDisplay })` wherever an amount is shown in THIS
  // account's own currency (its balance, its history chart, ...) — not for
  // a base-currency rollup across several accounts, which always follows
  // the base Settings choice regardless of any one account's override.
  currencyDisplay?: CurrencyDisplayStyle | null
}

export type CategoryKind = 'expense' | 'income'

export interface Category {
  id: string
  ownerId: string
  name: string
  kind: CategoryKind
  icon: string
  color: string
  parentId: string | null // null = top-level category
  archived: boolean
  order: number
  createdAt: number
  isDefault?: boolean
  // A category's own currency — mandatory going forward (CategoryFormModal.vue
  // always saves one, defaulting to the base currency), only meaningful on a
  // top-level category (a subcategory always inherits its parent's, and is
  // never saved with one of its own). Still typed optional/nullable only to
  // tolerate rows saved before this was mandatory — resolve a possibly-unset
  // value with utils/currencies.ts's resolveCategoryCurrency() rather than
  // reading this field directly. When it differs from the account involved,
  // TransactionFormModal.vue shows a two-value calculator instead of a single
  // amount field (see Transaction.toAmount) — this also replaces the old
  // per-transaction manual base-currency override, since a category's
  // currency now always resolves to *something* (the base currency, unless
  // set otherwise).
  currency?: string | null
  // Per-category override of Settings → "Формат валюти", same convention and
  // wiring as Account.currencyDisplay above — unset/null means "use the base
  // Settings choice". Only meaningful (and only ever saved) on a top-level
  // category, exactly like `currency`: a subcategory always inherits its
  // parent's, so resolve it there instead of reading this field on a child.
  currencyDisplay?: CurrencyDisplayStyle | null
}

export type TransactionType = 'expense' | 'income' | 'transfer'

export interface Transaction {
  id: string
  ownerId: string // uid of the profile that initiated this transaction
  participantIds: string[] // [ownerId], or [ownerId, counterpartyId] for a cross-profile transfer
  type: TransactionType
  date: number // epoch ms, day-precision meaningful, time kept for ordering
  accountId: string // source account (for transfer: "from")
  toAccountId?: string // only for transfers
  categoryId?: string // only for expense/income
  subcategoryId?: string | null
  amount: number // in accountId's currency (for transfer: amount debited from source)
  // Secondary-currency amount, paired with `amount` by a dual calculator (see
  // AmountKeypad.vue's `dual` mode): for a transfer between different-currency
  // accounts, the amount credited to `toAccountId`; for an expense/income
  // against a category with its own fixed `currency` (different from
  // `accountId`'s), the amount in the category's currency.
  toAmount?: number
  currency: string
  note?: string
  templateId?: string // set if generated from a RecurringTemplate
  receiptId?: string | null // set when saved from a scanned receipt (see Receipt) — groups it with the receipt's other operations
  createdAt: number
  updatedAt: number
}

export type RecurringFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly'

export interface RecurringTemplate {
  id: string
  ownerId: string
  type: TransactionType
  accountId: string
  toAccountId?: string
  categoryId?: string
  subcategoryId?: string | null
  amount: number
  currency: string
  note?: string
  frequency: RecurringFrequency
  interval: number // every N days/weeks/months/years
  startDate: number
  endDate?: number | null
  nextDate: number // next date a transaction should be generated for
  active: boolean
  createdAt: number
}

export interface Budget {
  id: string
  ownerId: string
  categoryId: string
  amount: number
  currency: string
  period: 'monthly' // extensible later
  createdAt: number
}

/**
 * A grouping label for the operations saved from one scanned receipt (see
 * api/receipts.ts's ScanReceiptResult and ReceiptEditModal.vue's scanFile-режим), or
 * from manually merging existing operations (see stores/transactions.ts's
 * ReceiptGroupCard.vue "merge" flow) — created only once the user actually
 * keeps at least one operation, so a scanned-then-discarded photo never
 * leaves a row behind. `accountId`/`date` are the group's single source of
 * truth: every linked Transaction (`Transaction.receiptId === this.id`) is
 * expected to share them (enforced in the UI, not the backend — see
 * TransactionFormModal.vue's `lockedByReceipt` and ReceiptEditModal.vue's
 * cascade update), same "one account, one day" rule a scan-review session
 * already applied uniformly to every draft it saved.
 */
export interface Receipt {
  id: string
  ownerId: string
  merchant: string | null
  date: number | null // epoch ms — the receipt's own date, not when it was scanned/saved
  currency: string | null // informational only, same as ScanReceiptResult.currency
  accountId: string | null // the account every linked transaction was (or must be) paid from
  note?: string | null
  createdAt: number
  updatedAt: number
}

export interface ExchangeRateEntry {
  // key: `${dateKey}_${currency}`, dateKey = YYYY-MM-DD
  id: string
  dateKey: string
  currency: string
  rate: number // UAH per 1 unit of currency
  fetchedAt: number
}

export interface AppSettings {
  id: string // profile's uid — one settings doc per profile
  baseCurrency: string
  theme: 'system' | 'light' | 'dark'
  onboarded: boolean
  // The four below mirror what GET/PATCH /api/settings now also carries (see
  // the backend's app_settings table) — a cross-device backup of each
  // device's own localStorage-based preference (see utils/format.ts's
  // getNumberFormatSetting/getDateFormatSetting/getCurrencyDisplaySetting and
  // i18n/locale.ts's getLocaleSetting, which are what THIS device actually
  // renders with). Optional because this Dexie row, unlike baseCurrency/theme
  // above, never actually stores them — only stores/auth.ts's raw
  // GET /api/auth/me response carries them, straight into
  // seedFormatSettingsFromBackend/seedLocaleSettingFromBackend.
  language?: LocaleSetting
  numberFormat?: NumberFormatStyle
  dateFormat?: DateFormatStyle
  currencyDisplay?: CurrencyDisplayStyle
}

export type UserRole = 'owner' | 'member'

/**
 * One family member's account. `uid` is the backend's `users.id` (a UUIDv7,
 * not the Firebase Auth uid) — every `ownerId`/`participantIds` entry
 * throughout this file refers to this id, matched to Firebase Auth by email
 * at sign-in (see src/middleware/auth.js on the backend). Populated from
 * GET /api/auth/me (self, full) or GET /api/users (family directory,
 * minimal — role/email omitted there, see stores/profiles.ts).
 */
export interface Profile {
  uid: string
  email: string
  displayName: string
  photoURL: string | null
  color: string // categorical badge color, deterministic fallback when no photo
  role: UserRole
  isActive: boolean
  createdAt: number
}
