import { afterEach, beforeEach, describe, expect, test, vi, type Mock } from 'vitest'

vi.mock('../../../api/http', () => ({ default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }))
vi.mock('../../../config/serverConfig', () => ({ hasConfiguredServer: () => true }))
vi.mock('../../syncStatus', () => ({ backendOnline: { value: true }, markSynced: vi.fn() }))
vi.mock('../../../i18n', () => ({ t: (key: string) => key }))

import http from '../../../api/http'
import { db } from '../../schema'
import { markSynced } from '../../syncStatus'
import { AFTER_WRITE_SYNC_MS, fullSync, startAutoSync, USERS_REFRESH_MS } from '../orchestrator'
import { putAndQueue } from '../outbox'
import { clearPullCache } from '../pull'
import { SYNC_ENTITIES } from '../registry'

const api = http as unknown as { post: Mock }

/** Lets IndexedDB work (which runs on real setImmediate, never faked here) go on until `check` holds. */
async function until(check: () => boolean) {
  for (let i = 0; i < 1_000; i++) {
    if (check()) return
    await new Promise((resolve) => setImmediate(resolve))
  }
  throw new Error('condition never held')
}

beforeEach(async () => {
  vi.resetAllMocks()
  vi.stubGlobal('navigator', { onLine: true })
  await Promise.all(db.tables.map((table) => table.clear()))
  api.post.mockResolvedValue({ data: { syncedAt: 1, entities: Object.fromEntries(SYNC_ENTITIES.map((e) => [e, []])), next: {}, users: [] } })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('fullSync', () => {
  test('the idle timer asks for the family directory only every USERS_REFRESH_MS; any other sync always does', async () => {
    const asked = async (opts?: { usersIfDue: boolean }) => {
      clearPullCache() // each call here stands for a separate tick, not a burst to coalesce
      api.post.mockClear()
      await fullSync('u', opts)
      return (api.post.mock.calls[0][1] as { users: boolean }).users
    }

    expect(await asked()).toBe(true)
    expect(await asked({ usersIfDue: true })).toBe(false)
    expect(await asked()).toBe(true)

    const later = Date.now() + USERS_REFRESH_MS + 1
    vi.spyOn(Date, 'now').mockReturnValue(later)
    expect(await asked({ usersIfDue: true })).toBe(true)
  })
})

describe('startAutoSync', () => {
  let stop: (() => void) | undefined
  let onVisible: () => void
  const pulls = () => api.post.mock.calls.filter(([url]) => url === '/sync/pull').length
  const syncsDone = () => (markSynced as Mock).mock.calls.length

  beforeEach(() => {
    clearPullCache()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() })
    vi.stubGlobal('document', {
      visibilityState: 'visible',
      addEventListener: (type: string, listener: () => void) => {
        if (type === 'visibilitychange') onVisible = listener
      },
      removeEventListener: vi.fn(),
    })
    const pullAnswer = { syncedAt: 1, entities: Object.fromEntries(SYNC_ENTITIES.map((e) => [e, []])), next: {}, users: [] }
    api.post.mockImplementation(async (url: string, body: { items?: { id: string }[] }) =>
      url === '/sync/pull' ? { data: pullAnswer } : { data: { items: body.items!.map((item) => ({ id: item.id, ok: true })) } },
    )
  })

  afterEach(() => {
    stop?.()
    vi.useRealTimers()
  })

  async function startedAndIdle() {
    stop = startAutoSync(() => 'u')
    await until(() => syncsDone() === 1 && vi.getTimerCount() === 1)
    // Past the window in which a new pull would just reuse the last one.
    await vi.advanceTimersByTimeAsync(10_000)
  }

  test('a change made here is followed by a sync within AFTER_WRITE_SYNC_MS, not on the backed-off timer', async () => {
    await startedAndIdle() // next periodic sync is 30s after the first, so 20s away

    await putAndQueue('accounts', 'u', [{ id: 'a' }])
    await vi.advanceTimersByTimeAsync(AFTER_WRITE_SYNC_MS)
    await until(() => syncsDone() === 2)

    expect(pulls()).toBe(2)
  })

  test('coming back to the app replaces the pending sync instead of adding a second chain of them', async () => {
    await startedAndIdle()

    onVisible()
    await until(() => syncsDone() === 2)
    await new Promise((resolve) => setImmediate(resolve)) // let it schedule the next one

    expect(vi.getTimerCount()).toBe(1)
  })
})
