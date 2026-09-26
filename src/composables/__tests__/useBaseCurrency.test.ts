import { afterEach, beforeEach, expect, test, vi, type Mock } from 'vitest'
import { reactive, watchEffect } from 'vue'

const settings = vi.hoisted(() => ({ store: undefined as unknown as { baseCurrency: string } }))
vi.mock('../../stores/settings', () => ({ useSettingsStore: () => settings.store }))
// utils/format.ts (for dateKey) pulls these in at import time; neither works under Node.
vi.mock('../../api/http', () => ({ default: { patch: vi.fn() } }))
vi.mock('../../i18n/locale', async () => ({ locale: (await import('vue')).ref('uk'), BCP47: { uk: 'uk-UA' } }))
// Local mode unless a test says otherwise — see the "via the server" tests in db/__tests__/exchangeRates.test.ts.
const server = vi.hoisted(() => ({ configured: false, fetchRateSnapshots: vi.fn() }))
vi.mock('../../config/serverConfig', () => ({ hasConfiguredServer: () => server.configured }))
vi.mock('../../api/rates', () => ({ fetchRateSnapshots: server.fetchRateSnapshots }))

let useBaseCurrency: typeof import('../useBaseCurrency').useBaseCurrency
let fetchMock: Mock

const url = (date: string) => `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${date}/v1/currencies/usd.min.json`
const FILES: Record<string, { date: string; usd: Record<string, number> }> = {
  [url('latest')]: { date: '2026-09-25', usd: { usd: 1, uah: 40, eur: 0.8 } },
  [url('2025-01-15')]: { date: '2025-01-15', usd: { usd: 1, uah: 42, eur: 0.9 } },
}
const JAN_15 = new Date(2025, 0, 15, 18).getTime()

/** Lets pending fetches, IndexedDB and the batching timer all settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 300))

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 25, 12))
  settings.store = reactive({ baseCurrency: 'UAH' })
  fetchMock = vi.fn(async (requested: string) => {
    const body = FILES[requested]
    return body ? { ok: true, json: async () => body } : { ok: false, json: async () => ({}) }
  })
  vi.stubGlobal('fetch', fetchMock)
  vi.resetModules()
  ;({ useBaseCurrency } = await import('../useBaseCurrency'))
  const { db } = await import('../../db/schema')
  await db.rateSnapshots.clear()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.stubGlobal('navigator', { onLine: true })
})

test('the base currency converts to itself without a lookup', () => {
  const base = useBaseCurrency()
  expect(base.toBase(250, 'UAH', JAN_15)).toBe(250)
  expect(fetchMock).not.toHaveBeenCalled()
})

test('converts at the operation day’s rate once it’s loaded', async () => {
  const base = useBaseCurrency()
  base.toBase(100, 'USD', JAN_15)
  await settle()

  expect(base.toBase(100, 'USD', JAN_15)).toBeCloseTo(4200)
  expect(base.toBase(100, 'USD')).toBeCloseTo(4000) // no date — today's
})

test('uses today’s rate as a stand-in while the day’s own is loading', async () => {
  const base = useBaseCurrency()
  base.toBase(1, 'USD')
  await settle()

  expect(base.toBase(100, 'USD', JAN_15)).toBeCloseTo(4000)
  await settle()
  expect(base.toBase(100, 'USD', JAN_15)).toBeCloseTo(4200)
})

test('switching the base currency needs no new fetches', async () => {
  const base = useBaseCurrency()
  base.toBase(1, 'USD', JAN_15)
  await settle()
  const fetches = fetchMock.mock.calls.length

  settings.store.baseCurrency = 'EUR'
  expect(base.code).toBe('EUR')
  expect(base.toBase(100, 'USD', JAN_15)).toBeCloseTo(90)
  expect(base.toBase(4200, 'UAH', JAN_15)).toBeCloseTo(90)
  expect(fetchMock.mock.calls.length).toBe(fetches)
})

test('many days arriving together re-run a watcher once, not once per day', async () => {
  const days = Array.from({ length: 12 }, (_, i) => new Date(2025, i, 10).getTime())
  fetchMock.mockImplementation(async () => ({ ok: true, json: async () => ({ usd: { usd: 1, uah: 42 } }) }))
  const base = useBaseCurrency()
  let runs = 0
  const stop = watchEffect(
    () => {
      runs++
      days.forEach((day) => base.toBase(100, 'USD', day))
    },
    { flush: 'sync' },
  )
  await settle()
  stop()

  expect(fetchMock).toHaveBeenCalledTimes(13) // 12 days + today's stand-in
  expect(runs).toBe(2)
})
