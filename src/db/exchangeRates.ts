import { db } from './schema'
import { dateKey } from '../utils/format'
import { fetchRateSnapshots, type ServerRateSnapshot } from '../api/rates'
import { hasConfiguredServer } from '../config/serverConfig'

/**
 * One day's rates, quoted against USD: units of each currency per 1 USD,
 * keyed by lowercase code the way the API sends them (see below). USD is
 * only the pivot every snapshot happens to be fetched in — crossRate() turns
 * any two of its entries into a direct rate, so the same snapshot serves
 * every base currency, and changing the profile's base currency never needs
 * a new fetch.
 */
export type RateSnapshot = Record<string, number>

// fawazahmed0/currency-api (github.com/fawazahmed0/exchange-api) — a free,
// no-key, no-rate-limit set of static JSON files, one per base currency per
// day, each quoting every other currency relative to that base. Served from
// jsDelivr, with the same files mirrored on Cloudflare Pages as the
// documented fallback for when jsDelivr is unreachable. It keeps a daily
// history, but only back to FIRST_AVAILABLE_DATE — anything older is clamped
// to it, the closest rate there is. Currency codes are lowercase on the wire.
const FIRST_AVAILABLE_DATE = '2024-03-02'
const PIVOT = 'usd'

function snapshotUrls(apiDate: string): string[] {
  const file = `v1/currencies/${PIVOT}.min.json`
  return [
    `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${apiDate}/${file}`,
    `https://${apiDate}.currency-api.pages.dev/${file}`,
  ]
}

/**
 * Currencies from utils/currencies.ts the API doesn't quote at all, mapped
 * to the one each is pegged to 1:1 — FOK (Faroese króna) to DKK, KID
 * (Kiribati dollar) to AUD — so an account in either still converts instead
 * of silently falling back to a rate of 1.
 */
const PEGGED_TO: Record<string, string> = { FOK: 'DKK', KID: 'AUD' }

function apiCode(currency: string): string {
  return (PEGGED_TO[currency] ?? currency).toLowerCase()
}

/**
 * Which day's snapshot answers for the moment `when`: its own day, clamped
 * to FIRST_AVAILABLE_DATE (the API's history start) and to today, since a
 * future-dated operation has nothing better to go on than today's rate.
 */
export function snapshotKey(when: number | Date): string {
  const dk = dateKey(when)
  const today = dateKey(Date.now())
  if (dk >= today) return today
  return dk < FIRST_AVAILABLE_DATE ? FIRST_AVAILABLE_DATE : dk
}

/** Units of `to` per 1 unit of `from` on the snapshot's day, or null if it doesn't quote either one. */
export function crossRate(snapshot: RateSnapshot, from: string, to: string): number | null {
  const fromCode = apiCode(from)
  const toCode = apiCode(to)
  if (fromCode === toCode) return 1 // e.g. FOK against DKK — pegged 1:1
  const perUsdFrom = snapshot[fromCode]
  const perUsdTo = snapshot[toCode]
  if (typeof perUsdFrom !== 'number' || !(perUsdFrom > 0) || typeof perUsdTo !== 'number' || !(perUsdTo > 0)) return null
  return perUsdTo / perUsdFrom
}

// A year of statistics can ask for a few hundred days at once — at most this
// many downloads run at the same time, the rest wait their turn.
const MAX_CONCURRENT_DOWNLOADS = 6
let activeDownloads = 0
const waitingDownloads: (() => void)[] = []

async function withDownloadSlot<T>(task: () => Promise<T>): Promise<T> {
  if (activeDownloads < MAX_CONCURRENT_DOWNLOADS) activeDownloads++
  else await new Promise<void>((resolve) => waitingDownloads.push(resolve)) // the finishing task hands its slot straight over
  try {
    return await task()
  } finally {
    const next = waitingDownloads.shift()
    if (next) next()
    else activeDownloads--
  }
}

/** A downloaded snapshot and the day it's for — null only for a `latest` the API didn't date. */
type Downloaded = { date: string | null; rates: RateSnapshot }

/**
 * Downloads the snapshot for `apiDate` (YYYY-MM-DD, or `latest`), trying each
 * mirror in turn, along with the day the API says it's for — for `latest`,
 * whichever day was last published, which may still be yesterday.
 */
async function downloadSnapshot(apiDate: string): Promise<Downloaded | null> {
  // `latest` is a moving alias that jsDelivr serves with a week-long browser
  // max-age — revalidate it so the HTTP cache can't hand back a days-old
  // "latest". A dated snapshot never changes, so it may come straight from
  // that cache.
  const init: RequestInit = apiDate === 'latest' ? { cache: 'no-cache' } : {}
  for (const url of snapshotUrls(apiDate)) {
    try {
      const res = await fetch(url, init)
      if (!res.ok) continue
      const data = await res.json()
      const rates = data?.[PIVOT]
      if (!rates || typeof rates !== 'object') continue
      const date = typeof data.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.date) ? data.date : null
      return { date: date ?? (apiDate === 'latest' ? null : apiDate), rates: rates as RateSnapshot }
    } catch {
      // Network error — try the next mirror.
    }
  }
  return null
}

// With a server configured, a day missing from IndexedDB is asked of the
// backend's shared cache first (backend/src/services/internal/rates/): it
// keeps the family's rate history even if the rates API goes away, and
// turns a period's worth of per-day downloads into a single request —
// lookups made in the same tick are sent together, SERVER_BATCH_SIZE days
// per request. Whatever the server doesn't return (or everything, when it
// can't be reached) is downloaded straight from the API, as with no server.
const SERVER_BATCH_SIZE = 200

interface QueuedLookup {
  key: string
  isToday: boolean
  resolve: (result: Downloaded | null) => void
}
let serverQueue: QueuedLookup[] | null = null

function fetchViaServer(key: string, isToday: boolean): Promise<Downloaded | null> {
  return new Promise((resolve) => {
    if (!serverQueue) {
      serverQueue = []
      setTimeout(flushServerQueue, 0)
    }
    serverQueue.push({ key, isToday, resolve })
  })
}

async function flushServerQueue(): Promise<void> {
  const queue = serverQueue ?? []
  serverQueue = null
  const dates = [...new Set(queue.filter((q) => !q.isToday).map((q) => q.key))]
  const batches: string[][] = []
  for (let i = 0; i < dates.length; i += SERVER_BATCH_SIZE) batches.push(dates.slice(i, i + SERVER_BATCH_SIZE))
  const wantsLatest = queue.some((q) => q.isToday)
  if (!batches.length) batches.push([]) // today's rates only

  const byDate = new Map<string, RateSnapshot>()
  const found: { latest: ServerRateSnapshot | null } = { latest: null }
  await Promise.all(
    batches.map(async (batch, i) => {
      try {
        const response = await fetchRateSnapshots(batch, wantsLatest && i === 0)
        for (const snapshot of response.snapshots ?? []) byDate.set(snapshot.date, snapshot.rates)
        if (response.latest) found.latest = response.latest
      } catch {
        // Unreachable, or an older backend without this endpoint — covered by the direct download.
      }
    }),
  )
  for (const q of queue) {
    const rates = q.isToday ? undefined : byDate.get(q.key)
    q.resolve(q.isToday ? found.latest : rates ? { date: q.key, rates } : null)
  }
}

/**
 * The backend first (see fetchViaServer), then the rates API directly —
 * also for today when the server's "latest" is more than a day old, which
 * is what it falls back to when it can't reach the API itself; if the
 * direct download fails too, that older day is still better than nothing.
 */
async function downloadFromNetwork(key: string, isToday: boolean): Promise<Downloaded | null> {
  const viaServer = hasConfiguredServer() ? await fetchViaServer(key, isToday) : null
  const staleToday = isToday && viaServer != null && (viaServer.date ?? '') < dateKey(Date.now() - 24 * 60 * 60 * 1000)
  if (viaServer && !staleToday) return viaServer
  const direct = await withDownloadSlot(() => downloadSnapshot(isToday ? 'latest' : key))
  return direct ?? viaServer
}

/**
 * IndexedDB first (a past day's snapshot never changes, so one stored there
 * is final), then the network (see downloadFromNetwork): today's via
 * `latest`, any other day via its own dated file. Whatever comes back is
 * stored under the day the API says it's for — so `latest` also fills in
 * yesterday's row while today's file isn't published yet, and that row is
 * what a later offline session falls back to (see resolveSnapshot).
 */
async function loadSnapshot(key: string): Promise<RateSnapshot | null> {
  try {
    const stored = await db.rateSnapshots.get(key)
    if (stored) return stored.rates
  } catch {
    // Unreadable cache — carry on to the network.
  }
  const isToday = key === dateKey(Date.now())
  const downloaded = await downloadFromNetwork(key, isToday)
  if (!downloaded) return null
  if (downloaded.date) {
    try {
      await db.rateSnapshots.put({ dateKey: downloaded.date, rates: downloaded.rates, fetchedAt: Date.now() })
    } catch {
      // Couldn't cache it (e.g. storage full) — the rates are still good for this session.
    }
  }
  return downloaded.rates
}

// Exact-day snapshots, memoized per session and shared by every caller. A
// day that couldn't be loaded is dropped again, so a later lookup retries
// (e.g. once back online) instead of being stuck without it.
const pendingSnapshots = new Map<string, Promise<RateSnapshot | null>>()
const loadedSnapshots = new Map<string, RateSnapshot>()

/** The snapshot for `key` (see snapshotKey) if this session already has it in memory — synchronous, never fetches. */
export function peekSnapshot(key: string): RateSnapshot | undefined {
  return loadedSnapshots.get(key)
}

/** The snapshot for exactly day `key` (see snapshotKey), or null if it can't be had right now. */
export function getSnapshot(key: string): Promise<RateSnapshot | null> {
  let pending = pendingSnapshots.get(key)
  if (!pending) {
    pending = loadSnapshot(key).then((rates) => {
      if (rates) loadedSnapshots.set(key, rates)
      else pendingSnapshots.delete(key)
      return rates
    })
    pendingSnapshots.set(key, pending)
  }
  return pending
}

/**
 * The snapshot for day `key`, or — offline, or for a day the API skipped —
 * the nearest one stored in IndexedDB (the closest earlier day, else the
 * closest later one). Null only when there's nothing at all to go on.
 */
export async function resolveSnapshot(key: string): Promise<RateSnapshot | null> {
  const exact = await getSnapshot(key)
  if (exact) return exact
  try {
    const nearest =
      (await db.rateSnapshots.where('dateKey').belowOrEqual(key).last()) ??
      (await db.rateSnapshots.where('dateKey').above(key).first())
    return nearest?.rates ?? null
  } catch {
    return null
  }
}

/**
 * Converts an amount between any two currencies at the rate of `when`'s day
 * (see snapshotKey) — today's by default. Falls back to 1:1 only when no
 * rate at all is available, so calculations never throw.
 */
export async function convertAmount(
  amount: number,
  from: string,
  to: string,
  when: number | Date = Date.now(),
): Promise<number> {
  if (from === to) return amount
  const snapshot = await resolveSnapshot(snapshotKey(when))
  const rate = snapshot ? crossRate(snapshot, from, to) : null
  return rate == null ? amount : amount * rate
}

/** Same as convertAmount, but always using today's latest rate (for "current value" rollups). */
export async function convertLatest(amount: number, from: string, to: string): Promise<number> {
  return convertAmount(amount, from, to, Date.now())
}
