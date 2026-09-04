import { isCrossProfileTransfer } from './transferAnalytics'
import type { Transaction } from '../types/models'

/**
 * A transaction's contribution expressed in its OWN category's currency —
 * used for Categories analytics (see CategoriesDataView.vue), which per-spec
 * shows amounts in the category's own currency rather than normalizing to the
 * base currency. Only meaningful for expense/income (a transfer has no category).
 *
 * When the account's currency matches `categoryCurrency`, `t.amount` already
 * IS that currency. When it doesn't, `t.toAmount` normally already holds the
 * category-currency side (the same dual-calculator value
 * TransactionFormModal.vue's `isCrossCurrencyCategory` collects) — except on
 * a transaction saved before this category had this currency (or before
 * per-category currencies existed at all), which has no such figure
 * recorded. `toBase` is the fallback for exactly that gap: converting the
 * native amount live is exact whenever `categoryCurrency` is the base
 * currency (the common case for a category that was never given an explicit
 * one — see resolveCategoryCurrency), and only an approximation on the rarer
 * legacy row against a category with some OTHER explicit currency.
 */
export function categoryCurrencyAmount(t: Transaction, categoryCurrency: string, toBase: (amount: number, currency: string) => number): number {
  if (categoryCurrency === t.currency) return Math.abs(t.amount)
  if (t.toAmount != null) return Math.abs(t.toAmount)
  return Math.abs(toBase(t.amount, t.currency))
}

/**
 * A transaction's signed amount in its OWN (`t.currency`) currency — the
 * native-currency counterpart of the old stored `baseAmount`, before any
 * base-currency conversion. `+` for income, `-` for expense, `0` for a
 * same-profile transfer (not a real expense/income), and for a cross-profile
 * transfer, signed from `viewerUid`'s perspective (negative if they sent it,
 * positive if they received it) — same convention `OverviewDataView.vue` and
 * `OperationsDataView.vue` already apply to `baseAmount`.
 */
export function nativeSignedAmount(t: Transaction, viewerUid: string | null): number {
  if (t.type === 'expense') return -t.amount
  if (t.type === 'income') return t.amount
  if (!isCrossProfileTransfer(t) || !viewerUid) return 0
  return t.amount * (t.ownerId === viewerUid ? -1 : 1)
}

/**
 * The "other side" of a two-currency operation: a cross-currency transfer's
 * destination account currency, or an expense/income's own category
 * currency — alongside the exact amount recorded for it (`toAmount`),
 * collected by TransactionFormModal.vue's isCrossCurrencyTransfer /
 * isCrossCurrencyCategory. `null` when there isn't one (same-currency
 * operation, or a legacy row saved before this was tracked — the
 * `toAmount == null` guard: never fabricated by reusing the primary amount
 * under a different currency's label, which would silently imply a false
 * 1:1 parity). `destinationCurrency`/`categoryCurrency` are resolvers the
 * caller already has (account/category lookups differ per view).
 */
export function otherCurrencyAmount(
  t: Transaction,
  destinationCurrency: (toAccountId: string | undefined) => string | undefined,
  categoryCurrency: (categoryId: string | undefined) => string | undefined,
): { amount: number; currency: string } | null {
  if (t.toAmount == null) return null
  if (t.type === 'transfer') {
    const dest = destinationCurrency(t.toAccountId)
    if (!dest || dest === t.currency) return null
    return { amount: t.toAmount, currency: dest }
  }
  const cat = categoryCurrency(t.categoryId)
  if (!cat || cat === t.currency) return null
  return { amount: t.toAmount, currency: cat }
}

/**
 * A transaction's already-signed native amount, converted to
 * `targetCurrency` — EXACT when `targetCurrency` matches either the
 * transaction's own currency or its "other side" (see otherCurrencyAmount
 * above: a category's currency, or a transfer's destination), and only a
 * live-rate `toBase` conversion when it matches neither. This is what
 * switching "Показувати суми в…" should do: prefer a figure someone actually
 * entered/recorded over one re-derived from today's rate, whenever one
 * exists in the currency now being shown.
 */
export function signedAmountInCurrency(
  signedAmount: number,
  currency: string,
  targetCurrency: string,
  other: { amount: number; currency: string } | null,
  toBase: (amount: number, currency: string) => number,
): number {
  if (currency === targetCurrency) return signedAmount
  if (other && other.currency === targetCurrency) return Math.sign(signedAmount) * Math.abs(other.amount)
  return toBase(signedAmount, currency)
}
