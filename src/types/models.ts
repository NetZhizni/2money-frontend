// Core domain types for the finance tracker.
// All money amounts are stored as plain numbers in the entity's own currency,
// except where noted (e.g. Transaction.baseAmount is always in base currency).

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
  toAmount?: number // for transfers between different currencies: amount credited to destination
  currency: string
  exchangeRate: number // rate vs base currency at time of entry (base per 1 unit of `currency`)
  baseAmount: number // amount converted to base currency, using exchangeRate (signed: +income/-expense, transfers net 0 across the pair)
  note?: string
  templateId?: string // set if generated from a RecurringTemplate
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

export interface ExchangeRateEntry {
  // key: `${dateKey}_${currency}`, dateKey = YYYY-MM-DD
  id: string
  dateKey: string
  currency: string
  rate: number // UAH per 1 unit of currency (NBU convention)
  fetchedAt: number
}

export interface AppSettings {
  id: string // profile's uid — one settings doc per profile
  baseCurrency: string
  theme: 'system' | 'light' | 'dark'
  onboarded: boolean
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
