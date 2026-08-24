/**
 * Guards an async recomputation against out-of-order completion: when a
 * reactive source changes again before the previous async run (e.g. an
 * exchange-rate fetch) has resolved, the earlier run's result must never
 * overwrite state with stale data just because it happened to finish last.
 * This is what caused totals to flash a wrong value and then "self-correct"
 * whenever another profile's data arrived mid-computation (shared
 * accounts/transactions listeners firing again while a conversion was still
 * in flight) — see TopHeader, OperationsView, useDisplayCurrency,
 * TotalBalanceView.
 *
 * Usage:
 *   const guard = useLatestRun()
 *   watchEffect(async () => {
 *     const run = guard.start()
 *     const value = await computeSomethingAsync()
 *     if (!guard.isCurrent(run)) return // a newer run started meanwhile — discard
 *     result.value = value
 *   })
 */
export function useLatestRun() {
  let run = 0
  function start(): number {
    return ++run
  }
  function isCurrent(token: number): boolean {
    return token === run
  }
  return { start, isCurrent }
}
