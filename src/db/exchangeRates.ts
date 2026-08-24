import { db } from './schema'
import { dateKey } from '../utils/format'

const NBU_BASE = 'https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange'
export const BASE_CURRENCY = 'UAH' // NBU rates are always "UAH per 1 unit of currency"

/** In-memory cache for the current session, keyed by `${dateKey}_${currency}`. */
const memCache = new Map<string, number>()

function toNbuDate(key: string): string {
  // dateKey is YYYY-MM-DD -> NBU wants YYYYMMDD
  return key.replace(/-/g, '')
}

async function fetchRateFromNbu(currency: string, dk: string): Promise<number | null> {
  if (currency === BASE_CURRENCY) return 1
  try {
    const url = `${NBU_BASE}?valcode=${encodeURIComponent(currency)}&date=${toNbuDate(dk)}&json`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()
    if (Array.isArray(data) && data[0]?.rate) return Number(data[0].rate)
    return null
  } catch {
    return null
  }
}

/**
 * Get the NBU rate (UAH per 1 unit of `currency`) for a given date, using the
 * IndexedDB cache first. Falls back to the most recent cached rate for that
 * currency if the network is unavailable and nothing is cached for the exact date.
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

  const fetched = await fetchRateFromNbu(currency, dk)
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

/** Latest available NBU rate for a currency (used for account-balance rollups, always NBU-only). */
export async function getLatestRate(currency: string): Promise<number> {
  return getRateForDate(currency, Date.now())
}

/** Pre-warms today's rates for a set of currencies (call once on app start). */
export async function preloadTodayRates(currencies: string[]): Promise<void> {
  await Promise.all(currencies.map((c) => getRateForDate(c, Date.now())))
}

/**
 * Converts an amount between ANY two currencies, pivoting through NBU's
 * UAH-denominated rates. This is the one place that should be used whenever
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
