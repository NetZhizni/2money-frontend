import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('../../../api/http', () => ({ default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }))
vi.mock('../../../config/serverConfig', () => ({ hasConfiguredServer: () => true }))

import { db } from '../../schema'
import { MAX_SAMPLE_RTT_MS, noteServerTime, serverNow, toLocalTime } from '../clock'
import { deleteAndQueue, putAndQueue } from '../outbox'

const DEVICE_NOW = 1_000_000

beforeEach(async () => {
  vi.stubGlobal('navigator', { onLine: false }) // queue only; nothing here is about pushing
  vi.spyOn(Date, 'now').mockReturnValue(DEVICE_NOW)
  noteServerTime(DEVICE_NOW, DEVICE_NOW, DEVICE_NOW) // start every test in step with the server
  await Promise.all(db.tables.map((table) => table.clear()))
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('noteServerTime', () => {
  test('puts the server’s reading halfway through the round trip', () => {
    // Sent at -400ms, answered now: the server read its clock at about -200ms.
    noteServerTime(DEVICE_NOW + 60_000, DEVICE_NOW - 400, DEVICE_NOW)
    expect(serverNow()).toBe(DEVICE_NOW + 60_200)
    expect(toLocalTime(serverNow())).toBe(DEVICE_NOW)
  })

  test('ignores a sample from a round trip too slow to place, and a missing reading', () => {
    noteServerTime(DEVICE_NOW + 60_000, DEVICE_NOW - MAX_SAMPLE_RTT_MS - 1, DEVICE_NOW)
    noteServerTime(undefined, DEVICE_NOW, DEVICE_NOW)
    expect(serverNow()).toBe(DEVICE_NOW)
  })
})

describe('two devices, one clock behind', () => {
  test('the device running behind stamps its changes on the server’s clock once it has measured it', async () => {
    // This phone's clock is three minutes slow. Another device saved the
    // record at server time T; the phone edits it a second later — but by its
    // own clock, that's 2:59 BEFORE T, and the server would refuse the edit as
    // stale (see the backend's "a device whose clock runs behind" test).
    const behind = 180_000
    noteServerTime(DEVICE_NOW + behind, DEVICE_NOW, DEVICE_NOW)

    await putAndQueue('accounts', 'u', [{ id: 'a' }])
    await deleteAndQueue('accounts', 'u', ['b'])

    const stamps = (await db.outbox.toArray()).map((entry) => entry.createdAt)
    expect(stamps).toEqual([DEVICE_NOW + behind, DEVICE_NOW + behind])
  })
})
