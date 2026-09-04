import { reactive, ref, watch } from 'vue'
import { useSettingsStore } from '../stores/settings'
import { convertLatest } from '../db/exchangeRates'

/**
 * Live "native amount → current base currency" conversion for anywhere that
 * needs to compare or sum amounts recorded in different currencies (Overview
 * totals, Categories' ring/headline totals, Operations' day-total and amount
 * filter). Replaces the old `Transaction.baseAmount` snapshot: there's no
 * stored rate anymore (see types/models.ts), so this always converts at
 * TODAY's rate, on read.
 *
 * `toBase()` is synchronous and reactive rather than async: it returns its
 * best guess immediately (identity if the currency hasn't been resolved yet)
 * and kicks off a background fetch that, once resolved, updates a per-call-site
 * rate cache — any `computed()` that called `toBase()` re-runs automatically
 * once that rate arrives, the same "eventually correct" pattern
 * db/exchangeRates.ts's own in-memory cache already relies on, just with a
 * reactive layer on top so Vue actually picks up the update.
 */
export function useBaseCurrency() {
  const settings = useSettingsStore()
  const code = ref(settings.baseCurrency)
  const rates = reactive<Record<string, number>>({})
  const pending = new Set<string>()

  watch(
    () => settings.baseCurrency,
    (next) => {
      code.value = next
      // A rate cached against the OLD base currency is meaningless once the
      // base itself changes — drop everything and let it re-resolve.
      for (const key of Object.keys(rates)) delete rates[key]
      pending.clear()
    },
  )

  function ensure(currency: string) {
    if (currency === code.value || currency in rates || pending.has(currency)) return
    pending.add(currency)
    convertLatest(1, currency, code.value)
      .then((rate) => {
        rates[currency] = rate
      })
      .finally(() => pending.delete(currency))
  }

  /** `amount` in `currency` → its equivalent in the current base currency, at today's rate. */
  function toBase(amount: number, currency: string): number {
    if (currency === code.value) return amount
    ensure(currency)
    return amount * (rates[currency] ?? 1)
  }

  return reactive({ code, toBase })
}
