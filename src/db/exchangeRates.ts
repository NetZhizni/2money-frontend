import { db } from './schema'
import { dateKey } from '../utils/format'

export const BASE_CURRENCY = 'UAH' // rates are always "UAH per 1 unit of currency"

/** In-memory cache for the current session, keyed by `${dateKey}_${currency}`. */
const memCache = new Map<string, number>()

const OPEN_ER_API_URL = 'https://open.er-api.com/v6/latest/UAH'

// A free, no-key service with UAH as its base, covering the ~160 currencies
// in utils/currencies.ts. It's a single daily snapshot with no per-date
// history — there's no way to ask "what was the rate on date X", only "what
// is it right now" — so every lookup below effectively uses today's rate,
// regardless of which date it's requested for. Fetched once per session and
// shared by every currency that needs it.
let openErApiRates: Promise<Record<string, number>> | null = null

function fetchOpenErApiRates(): Promise<Record<string, number>> {
  if (!openErApiRates) {
    openErApiRates = fetch(OPEN_ER_API_URL)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => (data?.result === 'success' ? (data.rates as Record<string, number>) : {}))
      .catch(() => ({}))
  }
  return openErApiRates
}

async function fetchRate(currency: string): Promise<number | null> {
  const rates = await fetchOpenErApiRates()
  const perUah = rates[currency] // open.er-api gives "units of `currency` per 1 UAH"
  return perUah ? 1 / perUah : null // ...we want the inverse: "UAH per 1 unit"
}

/**
 * Get the rate (UAH per 1 unit of `currency`) for a given date, using the
 * IndexedDB cache first. Falls back to the most recent cached rate for that
 * currency if the network is unavailable and nothing is cached for the exact date.
 *
 * `when` only picks the cache slot — the source has no real history (see
 * above), so the value stored under a given date is whatever the live rate
 * happened to be the first time that date was requested.
 */
export async function getRateForDate(currency: string, when: number | Date = Date.now()): Promise<number> {
  if (currency === BASE_CURRENCY) return 1
  const dk = dateKey(when)
  const cacheKey = `${dk}_${currency}`

  if (memCache.has(cacheKey)) return memCache.get(cacheKey)!

  const cached = await db.exchangeRates.where({ dateKey: dk, currency }).first()
  if (cached) {
    memCache.set(cacheKey, cached.rate)
    return cached.rate
  }

  const fetched = await fetchRate(currency)
  if (fetched != null) {
    await db.exchangeRates.put({
      id: cacheKey,
      dateKey: dk,
      currency,
      rate: fetched,
      fetchedAt: Date.now(),
    })
    memCache.set(cacheKey, fetched)
    return fetched
  }

  // Offline / API failure fallback: most recent cached rate we have for this currency.
  const latest = await db.exchangeRates.where('currency').equals(currency).sortBy('dateKey')
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
 * Converts an amount between ANY two currencies, pivoting through UAH-
 * denominated rates. This is the one place that should be used whenever
 * converting "to the app's base/display currency" — using a raw
 * getRateForDate(currency) result directly as if it were "rate to base" is
 * only correct when the base currency happens to be UAH.
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
