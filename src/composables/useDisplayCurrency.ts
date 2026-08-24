import { computed, reactive, ref, watchEffect } from 'vue'
import { useSettingsStore } from '../stores/settings'
import { useDisplayCurrencyStore } from '../stores/displayCurrency'
import { convertLatest } from '../db/exchangeRates'
import { useLatestRun } from './useLatestRun'

/**
 * For views that aggregate amounts already stored in `settings.baseCurrency`
 * (e.g. summed `transaction.baseAmount`), this gives the currency code to
 * label them with plus a single scalar to multiply those already-summed
 * totals by — so a ring/chart/ranking doesn't need to re-fetch a rate per
 * data point, just: `convert(sum)` once at the point of display.
 *
 * Wrapped in `reactive()` (not a plain object of refs) so `.code` unwraps
 * cleanly both in templates AND in plain script code — a plain object
 * holding a ComputedRef only auto-unwraps at the top level in templates, not
 * through a nested `something.code` member access.
 */
export function useDisplayCurrency() {
  const settings = useSettingsStore()
  const display = useDisplayCurrencyStore()

  const code = computed(() => display.effective)
  const rate = ref(1)
  const guard = useLatestRun()

  watchEffect(async () => {
    const run = guard.start()
    const next = code.value === settings.baseCurrency ? 1 : await convertLatest(1, settings.baseCurrency, code.value)
    if (!guard.isCurrent(run)) return
    rate.value = next
  })

  function convert(amountInBaseCurrency: number): number {
    return amountInBaseCurrency * rate.value
  }

  return reactive({ code, rate, convert })
}
