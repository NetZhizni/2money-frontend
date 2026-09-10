import { db } from './schema'
import { dateKey } from '../utils/format'
import { useSettingsStore } from '../stores/settings'

/**
 * The currency every rate below is expressed in ("<base> per 1 unit of
 * currency") and the one open.er-api.com itself is queried against — the
 * signed-in profile's own base currency (settings.baseCurrency), read live
 * on every call rather than captured once, so a base-currency change in
 * Settings takes effect on the very next lookup. Falls back to UAH (this
 * app's original hardcoded pivot) when no profile is signed in yet, e.g. a
 * rate requested before login.
 */
const FALLBACK_BASE_CURRENCY = 'UAH'

function getBaseCurrency(): string {
  return useSettingsStore().baseCurrency || FALLBACK_BASE_CURRENCY
}

/** In-memory cache for the current session, keyed by `${dateKey}_${base}_${currency}`. */
const memCache = new Map<string, number>()

function openErApiUrl(base: string): string {
  return `https://open.er-api.com/v6/latest/${encodeURIComponent(base)}`
}

// A free, no-key service covering the ~160 currencies in utils/currencies.ts,
// queried against whichever currency is currently this profile's base (see
// getBaseCurrency above) — open.er-api.com quotes every other currency
// relative to whatever base its URL names. It's a single daily snapshot with
// no per-date history — there's no way to ask "what was the rate on date X",
// only "what is it right now" — so every lookup below effectively uses
// today's rate, regardless of which date it's requested for. Fetched once
// per session per base currency (one Map entry each) and shared by every
// currency that needs it; a base-currency change simply starts a fresh fetch
// under its own entry instead of reusing the old base's.
const openErApiRatesByBase = new Map<string, Promise<Record<string, number>>>()

function fetchOpenErApiRates(base: string): Promise<Record<string, number>> {
  let pending = openErApiRatesByBase.get(base)
  if (!pending) {
    pending = fetch(openErApiUrl(base))
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => (data?.result === 'success' ? (data.rates as Record<string, number>) : {}))
      .catch(() => ({}))
    openErApiRatesByBase.set(base, pending)
  }
  return pending
}

async function fetchRate(currency: string, base: string): Promise<number | null> {
  const rates = await fetchOpenErApiRates(base)
  const perBase = rates[currency] // open.er-api gives "units of `currency` per 1 <base>"
  return perBase ? 1 / perBase : null // ...we want the inverse: "<base> per 1 unit"
}

/**
 * Get the rate (base currency per 1 unit of `currency`, see getBaseCurrency
 * above) for a given date, using the IndexedDB cache first. Falls back to
 * the most recent cached rate for that currency+base pair if the network is
 * unavailable and nothing is cached for the exact date.
 *
 * `when` only picks the cache slot — the source has no real history (see
 * above), so the value stored under a given date is whatever the live rate
 * happened to be the first time that date was requested.
 */
export async function getRateForDate(currency: string, when: number | Date = Date.now()): Promise<number> {
  const base = getBaseCurrency()
  if (currency === base) return 1
  const dk = dateKey(when)
  const cacheKey = `${dk}_${base}_${currency}`

  if (memCache.has(cacheKey)) return memCache.get(cacheKey)!

  const cached = await db.exchangeRates
    .where({ dateKey: dk, currency })
    .and((entry) => entry.base === base)
    .first()
  if (cached) {
    memCache.set(cacheKey, cached.rate)
    return cached.rate
  }

  const fetched = await fetchRate(currency, base)
  if (fetched != null) {
    await db.exchangeRates.put({
      id: cacheKey,
      dateKey: dk,
      currency,
      base,
      rate: fetched,
      fetchedAt: Date.now(),
    })
    memCache.set(cacheKey, fetched)
    return fetched
  }

  // Offline / API failure fallback: most recent cached rate we have for this currency+base pair.
  const latest = await db.exchangeRates
    .where('currency')
    .equals(currency)
    .and((entry) => entry.base === base)
    .sortBy('dateKey')
  if (latest.length) {
    const rate = latest[latest.length - 1].rate
    memCache.set(cacheKey, rate)
    return rate
  }

  return 1 // last-resort fallback so calculations never throw
}

/** Latest available rate for a currency (used for account-balance rollups). */
export async function getLatestRate(currency: string): Promise<number> {
  return getRateForDate(currency, Date.now())
}

/** Pre-warms today's rates for a set of currencies (call once on app start). */
export async function preloadTodayRates(currencies: string[]): Promise<void> {
  await Promise.all(currencies.map((c) => getRateForDate(c, Date.now())))
}

/**
 * Converts an amount between ANY two currencies, pivoting through
 * base-currency-denominated rates (see getBaseCurrency above — the ratio
 * below cancels the pivot out regardless of which currency it actually is,
 * so this works correctly no matter what the profile's base currency is set
 * to). This is the one place that should be used whenever converting "to the
 * app's base/display currency" — using a raw getRateForDate(currency) result
 * directly as if it were "rate to base" is only correct when `to` happens to
 * equal the current base currency.
 */
export async function convertAmount(
  amount: number,
  from: string,
  to: string,
  when: number | Date = Date.now(),
): Promise<number> {
  if (from === to) return amount
  const [fromRate, toRate] = await Promise.all([getRateForDate(from, when), getRateForDate(to, when)])
  if (!toRate) return amount
  return (amount * fromRate) / toRate
}

/** Same as convertAmount, but always using today's latest rate (for "current value" rollups). */
export async function convertLatest(amount: number, from: string, to: string): Promise<number> {
  return convertAmount(amount, from, to, Date.now())
}
