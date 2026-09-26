import { afterEach, beforeEach, describe, expect, test, vi, type Mock } from 'vitest'

// utils/format.ts (for dateKey) pulls these in at import time; neither works under Node.
vi.mock('../../api/http', () => ({ default: { patch: vi.fn() } }))
vi.mock('../../i18n/locale', async () => ({ locale: (await import('vue')).ref('uk'), BCP47: { uk: 'uk-UA' } }))
// Local mode unless a test says otherwise — see the "via the server" tests in db/__tests__/exchangeRates.test.ts.
const server = vi.hoisted(() => ({ configured: false, fetchRateSnapshots: vi.fn() }))
vi.mock('../../config/serverConfig', () => ({ hasConfiguredServer: () => server.configured }))
vi.mock('../../api/rates', () => ({ fetchRateSnapshots: server.fetchRateSnapshots }))

type RatesModule = typeof import('../exchangeRates')
type SchemaModule = typeof import('../schema')

let rates: RatesModule
let db: SchemaModule['db']
let fetchMock: Mock

const url = (date: string) => `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${date}/v1/currencies/usd.min.json`
const mirrorUrl = (date: string) => `https://${date}.currency-api.pages.dev/v1/currencies/usd.min.json`

/** A fetch stand-in serving `files[url]` as an API response, and a 404 for anything else. */
function serve(files: Record<string, { date?: string; usd: Record<string, number> }>) {
  fetchMock.mockImplementation(async (requested: string) => {
    const body = files[requested]
    return body ? { ok: true, json: async () => body } : { ok: false, json: async () => ({}) }
  })
}

const JAN_15 = new Date(2025, 0, 15, 18).getTime()

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 25, 12))
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  server.configured = false
  server.fetchRateSnapshots.mockReset()
  // Fresh module state every test — exchangeRates.ts keeps per-session caches at module level.
  vi.resetModules()
  rates = await import('../exchangeRates')
  db = (await import('../schema')).db
  await db.rateSnapshots.clear()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.stubGlobal('navigator', { onLine: true })
})

describe('snapshotKey', () => {
  test('a past day is its own key', () => {
    expect(rates.snapshotKey(JAN_15)).toBe('2025-01-15')
  })

  test('a day before the API’s history begins is clamped to its first day', () => {
    expect(rates.snapshotKey(new Date(2023, 5, 1))).toBe('2024-03-02')
  })

  test('today and the future are today', () => {
    expect(rates.snapshotKey(Date.now())).toBe('2026-09-25')
    expect(rates.snapshotKey(new Date(2027, 0, 1))).toBe('2026-09-25')
  })
})

describe('crossRate', () => {
  const snapshot = { usd: 1, uah: 42, eur: 0.9, dkk: 6.7, aud: 1.6 }

  test('derives any pair from the USD-quoted snapshot', () => {
    expect(rates.crossRate(snapshot, 'USD', 'UAH')).toBeCloseTo(42)
    expect(rates.crossRate(snapshot, 'EUR', 'UAH')).toBeCloseTo(46.667, 3)
    expect(rates.crossRate(snapshot, 'UAH', 'EUR')).toBeCloseTo(0.0214, 4)
  })

  test('a currency the API doesn’t quote converts through its 1:1 peg', () => {
    expect(rates.crossRate(snapshot, 'FOK', 'UAH')).toBeCloseTo(42 / 6.7)
    expect(rates.crossRate(snapshot, 'KID', 'AUD')).toBe(1)
  })

  test('null for a currency the snapshot doesn’t have', () => {
    expect(rates.crossRate(snapshot, 'XYZ', 'UAH')).toBeNull()
  })
})

describe('getSnapshot', () => {
  test('a past day downloads that day’s file once and stores it', async () => {
    serve({ [url('2025-01-15')]: { date: '2025-01-15', usd: { uah: 42 } } })

    expect(await rates.getSnapshot('2025-01-15')).toEqual({ uah: 42 })
    expect(await rates.getSnapshot('2025-01-15')).toEqual({ uah: 42 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(rates.peekSnapshot('2025-01-15')).toEqual({ uah: 42 })
    expect(await db.rateSnapshots.get('2025-01-15')).toMatchObject({ rates: { uah: 42 } })
  })

  test('a stored day is read back without the network', async () => {
    await db.rateSnapshots.put({ dateKey: '2025-01-15', rates: { uah: 42 }, fetchedAt: 0 })

    expect(await rates.getSnapshot('2025-01-15')).toEqual({ uah: 42 })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('today reads `latest`, revalidated, and stores it under the day the API says it’s for', async () => {
    serve({ [url('latest')]: { date: '2026-09-24', usd: { uah: 44 } } })

    expect(await rates.getSnapshot('2026-09-25')).toEqual({ uah: 44 })
    expect(fetchMock).toHaveBeenCalledWith(url('latest'), { cache: 'no-cache' })
    expect(await db.rateSnapshots.get('2026-09-24')).toMatchObject({ rates: { uah: 44 } })
    expect(await db.rateSnapshots.get('2026-09-25')).toBeUndefined()
  })

  test('falls back to the Cloudflare mirror when jsDelivr fails', async () => {
    serve({ [mirrorUrl('2025-01-15')]: { date: '2025-01-15', usd: { uah: 42 } } })

    expect(await rates.getSnapshot('2025-01-15')).toEqual({ uah: 42 })
    expect(fetchMock.mock.calls.map(([u]) => u)).toEqual([url('2025-01-15'), mirrorUrl('2025-01-15')])
  })

  test('a day that failed to load is retried by a later lookup', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    expect(await rates.getSnapshot('2025-01-15')).toBeNull()

    serve({ [url('2025-01-15')]: { date: '2025-01-15', usd: { uah: 42 } } })
    expect(await rates.getSnapshot('2025-01-15')).toEqual({ uah: 42 })
  })

  test('runs at most 6 downloads at once', async () => {
    const release: (() => void)[] = []
    fetchMock.mockImplementation(
      () => new Promise((resolve) => release.push(() => resolve({ ok: true, json: async () => ({ usd: { uah: 42 } }) }))),
    )
    const days = Array.from({ length: 10 }, (_, i) => `2025-01-${String(i + 1).padStart(2, '0')}`)

    const all = Promise.all(days.map((day) => rates.getSnapshot(day)))
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(6))
    release.shift()!()
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(7))
    while (release.length || fetchMock.mock.calls.length < 10) {
      release.shift()?.()
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
    expect(await all).toHaveLength(10)
    expect(fetchMock).toHaveBeenCalledTimes(10)
  })
})

describe('resolveSnapshot', () => {
  test('offline, falls back to the nearest earlier stored day', async () => {
    await db.rateSnapshots.bulkPut([
      { dateKey: '2025-01-10', rates: { uah: 41 }, fetchedAt: 0 },
      { dateKey: '2025-01-12', rates: { uah: 42 }, fetchedAt: 0 },
      { dateKey: '2025-01-20', rates: { uah: 43 }, fetchedAt: 0 },
    ])
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))

    expect(await rates.resolveSnapshot('2025-01-15')).toEqual({ uah: 42 })
  })

  test('...or the nearest later one when there’s nothing earlier', async () => {
    await db.rateSnapshots.put({ dateKey: '2025-01-20', rates: { uah: 43 }, fetchedAt: 0 })
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))

    expect(await rates.resolveSnapshot('2025-01-15')).toEqual({ uah: 43 })
  })
})

describe('convertAmount', () => {
  test('converts at the given day’s rate', async () => {
    serve({ [url('2025-01-15')]: { date: '2025-01-15', usd: { usd: 1, uah: 42, eur: 0.96 } } })

    expect(await rates.convertAmount(100, 'EUR', 'USD', JAN_15)).toBeCloseTo(104.17, 2)
    expect(await rates.convertAmount(100, 'USD', 'UAH', JAN_15)).toBeCloseTo(4200)
  })

  test('1:1 when no rate is available at all', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))

    expect(await rates.convertAmount(100, 'USD', 'UAH', JAN_15)).toBe(100)
  })
})

describe('via the server', () => {
  const snapshot = (date: string, uah: number) => ({ date, rates: { usd: 1, uah } })

  beforeEach(() => {
    server.configured = true
  })

  test('days looked up together go to the server in one request, and are stored', async () => {
    server.fetchRateSnapshots.mockResolvedValue({ snapshots: [snapshot('2025-01-15', 42), snapshot('2025-01-16', 43)], latest: null })

    const [a, b] = await Promise.all([rates.getSnapshot('2025-01-15'), rates.getSnapshot('2025-01-16')])

    expect(a).toEqual({ usd: 1, uah: 42 })
    expect(b).toEqual({ usd: 1, uah: 43 })
    expect(server.fetchRateSnapshots).toHaveBeenCalledTimes(1)
    expect(server.fetchRateSnapshots).toHaveBeenCalledWith(['2025-01-15', '2025-01-16'], false)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(await db.rateSnapshots.get('2025-01-16')).toMatchObject({ rates: { uah: 43 } })
  })

  test('today asks the server for `latest`, stored under the day it’s for', async () => {
    server.fetchRateSnapshots.mockResolvedValue({ snapshots: [], latest: snapshot('2026-09-24', 44) })

    expect(await rates.getSnapshot('2026-09-25')).toEqual({ usd: 1, uah: 44 })
    expect(server.fetchRateSnapshots).toHaveBeenCalledWith([], true)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(await db.rateSnapshots.get('2026-09-24')).toMatchObject({ rates: { uah: 44 } })
  })

  test('a day the server doesn’t return is downloaded straight from the API', async () => {
    server.fetchRateSnapshots.mockResolvedValue({ snapshots: [snapshot('2025-01-15', 42)], latest: null })
    serve({ [url('2025-01-16')]: { date: '2025-01-16', usd: { usd: 1, uah: 43 } } })

    const [a, b] = await Promise.all([rates.getSnapshot('2025-01-15'), rates.getSnapshot('2025-01-16')])

    expect(a).toEqual({ usd: 1, uah: 42 })
    expect(b).toEqual({ usd: 1, uah: 43 })
    expect(fetchMock.mock.calls.map(([u]) => u)).toEqual([url('2025-01-16')])
  })

  test('an unreachable server falls back to the API', async () => {
    server.fetchRateSnapshots.mockRejectedValue(new Error('Network Error'))
    serve({ [url('2025-01-15')]: { date: '2025-01-15', usd: { usd: 1, uah: 42 } } })

    expect(await rates.getSnapshot('2025-01-15')).toEqual({ usd: 1, uah: 42 })
  })

  test('a days-old `latest` from the server gives way to a fresh one from the API', async () => {
    server.fetchRateSnapshots.mockResolvedValue({ snapshots: [], latest: snapshot('2026-09-20', 41) })
    serve({ [url('latest')]: { date: '2026-09-25', usd: { usd: 1, uah: 44 } } })

    expect(await rates.getSnapshot('2026-09-25')).toEqual({ usd: 1, uah: 44 })
  })

  test('...but is still used when the API can’t be reached either', async () => {
    server.fetchRateSnapshots.mockResolvedValue({ snapshots: [], latest: snapshot('2026-09-20', 41) })
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))

    expect(await rates.getSnapshot('2026-09-25')).toEqual({ usd: 1, uah: 41 })
  })

  test('a big period is split into requests of at most 200 days', async () => {
    server.fetchRateSnapshots.mockImplementation(async (dates: string[]) => ({
      snapshots: dates.map((date) => snapshot(date, 42)),
      latest: null,
    }))
    const days = Array.from({ length: 250 }, (_, i) => new Date(2025, 0, 1 + i).getTime()).map((ms) => rates.snapshotKey(ms))

    const results = await Promise.all(days.map((day) => rates.getSnapshot(day)))

    expect(results.every((r) => r?.uah === 42)).toBe(true)
    expect(server.fetchRateSnapshots.mock.calls.map(([dates]) => dates.length)).toEqual([200, 50])
  })
})
