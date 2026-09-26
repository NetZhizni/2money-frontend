import { computed, reactive, ref } from 'vue'
import { useSettingsStore } from '../stores/settings'
import { crossRate, peekSnapshot, resolveSnapshot, snapshotKey, type RateSnapshot } from '../db/exchangeRates'

/** How long newly arrived rate snapshots wait to be applied together, while more are still loading — see useBaseCurrency. */
const FLUSH_DELAY_MS = 250

/**
 * Live "native amount → current base currency" conversion for anywhere that
 * needs to compare or sum amounts recorded in different currencies (Overview
 * totals, Categories' ring/headline totals, Operations' day-total and amount
 * filter). Converts at the rate of the day passed as `when` — an operation's
 * own date, so a past period's statistics keep the value they had then —
 * or at today's rate when `when` is left out (a balance's or a budget's
 * current value). There's no stored rate or converted amount on any record
 * (see types/models.ts): this is computed on read.
 *
 * Only the days actually asked for get loaded — in practice the displayed
 * period's operations that have no exact recorded figure in the base
 * currency (see utils/transactionAmounts.ts's signedAmountInCurrency). A
 * day's snapshot converts between any two currencies (see
 * db/exchangeRates.ts), so switching the base currency never waits on a
 * fetch once a day is loaded.
 *
 * `toBase()` is synchronous and reactive rather than async: it returns its
 * best guess immediately and kicks off a background load that, once
 * resolved, re-runs any `computed()` that called it. Until a day's rates are
 * in, that day converts at today's rate (close enough for the moment it
 * takes to arrive), and 1:1 only while today's are missing too. Arrivals
 * are applied in batches (see FLUSH_DELAY_MS), so a year's worth of days
 * loading one by one re-renders a handful of times rather than once per day.
 */
export function useBaseCurrency() {
  const settings = useSettingsStore()
  const code = computed(() => settings.baseCurrency)
  // Snapshots this instance has received, by snapshotKey — a plain Map, not
  // a reactive one (hundreds of them would make every lookup a proxy read);
  // `version` is what computeds actually track, bumped once per batch.
  const snapshots = new Map<string, RateSnapshot>()
  const requested = new Set<string>()
  const version = ref(0)
  let loading = 0
  let flushTimer: ReturnType<typeof setTimeout> | null = null

  function flush() {
    if (flushTimer) clearTimeout(flushTimer)
    flushTimer = null
    version.value++
  }

  function onLoaded() {
    loading--
    if (loading === 0) flush()
    else if (!flushTimer) flushTimer = setTimeout(flush, FLUSH_DELAY_MS)
  }

  /** The snapshot for `key` if it's here yet — otherwise starts loading it (once per instance) and returns undefined. */
  function snapshotFor(key: string): RateSnapshot | undefined {
    const known = snapshots.get(key) ?? peekSnapshot(key)
    if (known) {
      snapshots.set(key, known)
      return known
    }
    if (!requested.has(key)) {
      requested.add(key)
      loading++
      resolveSnapshot(key)
        .then((snapshot) => {
          if (snapshot) snapshots.set(key, snapshot)
        })
        .catch(() => {})
        .finally(onLoaded)
    }
    return undefined
  }

  /** `amount` in `currency` → its equivalent in the current base currency, at `when`'s day rate (today's if omitted). */
  function toBase(amount: number, currency: string, when?: number): number {
    const base = code.value
    if (currency === base) return amount
    void version.value // re-run the caller once newly loaded snapshots are applied
    const todayKey = snapshotKey(Date.now())
    const key = when == null ? todayKey : snapshotKey(when)
    const snapshot = snapshotFor(key) ?? (key === todayKey ? undefined : snapshotFor(todayKey))
    const rate = snapshot ? crossRate(snapshot, currency, base) : null
    return amount * (rate ?? 1)
  }

  return reactive({ code, toBase })
}
