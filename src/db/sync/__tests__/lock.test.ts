import { beforeEach, describe, expect, test, vi } from 'vitest'

// Shared by every copy of the modules below — the second "tab" re-imports them.
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), delete: vi.fn() }))
vi.mock('../../../api/http', () => ({ default: api }))
vi.mock('../../../config/serverConfig', () => ({ hasConfiguredServer: () => true }))
vi.mock('../../syncStatus', () => ({ backendOnline: { value: true }, markSynced: vi.fn() }))
vi.mock('../../../i18n', () => ({ t: (key: string) => key }))

import { db } from '../../schema'
import { runDueRecurring } from '../../recurring'
import { withTabLock } from '../lock'
import * as firstTab from '../outbox'

type BulkBody = { items: { id: string }[] }

/** navigator.locks as far as withTabLock uses it: one holder per name, the rest wait their turn. */
function fakeLocks() {
  const tails = new Map<string, Promise<unknown>>()
  return {
    request(name: string, work: () => Promise<unknown>) {
      const result = (tails.get(name) ?? Promise.resolve()).then(() => work())
      tails.set(name, result.catch(() => {}))
      return result
    },
  }
}

/** Another tab: its own copy of every module (and so of every in-memory guard), over the same IndexedDB. */
async function openSecondTab() {
  vi.resetModules()
  const outbox = await import('../outbox')
  await (await import('../../schema')).db.open()
  return outbox
}

beforeEach(async () => {
  vi.resetAllMocks()
  vi.stubGlobal('navigator', { onLine: false, locks: fakeLocks() })
  await Promise.all(db.tables.map((table) => table.clear()))
})

describe('withTabLock', () => {
  test('without the Web Locks API, just runs', async () => {
    vi.stubGlobal('navigator', { onLine: true })
    expect(await withTabLock('x', async () => 42)).toBe(42)
  })
})

describe('two tabs', () => {
  test('draining the outbox at once send each queued change only once', async () => {
    const secondTab = await openSecondTab()
    await firstTab.putAndQueue('accounts', 'u', [{ id: 'a' }, { id: 'b' }])
    vi.stubGlobal('navigator', { onLine: true, locks: fakeLocks() })
    // A slow answer: time enough for the other tab to read the queue too, unless something stops it.
    api.post.mockImplementation(async (_url: string, body: BulkBody) => {
      await new Promise((resolve) => setTimeout(resolve, 50))
      return { data: { items: body.items.map((item) => ({ id: item.id, ok: true })) } }
    })

    await Promise.all([firstTab.pushOutbox('u'), secondTab.pushOutbox('u')])

    const sent = api.post.mock.calls.flatMap(([, body]) => (body as BulkBody).items.map((item) => item.id))
    expect(sent.sort()).toEqual(['a', 'b'])
    expect(await db.outbox.count()).toBe(0)
  })

  test('opening together generate each due recurring operation once', async () => {
    const DAY = 86_400_000
    const now = Date.now()
    await db.table('recurringTemplates').put({
      id: 'r',
      ownerId: 'u',
      type: 'expense',
      accountId: 'acc',
      categoryId: 'cat',
      amount: 50,
      currency: 'UAH',
      frequency: 'daily',
      interval: 1,
      startDate: now - 3 * DAY,
      nextDate: now - 2.5 * DAY,
      active: true,
      createdAt: now - 3 * DAY,
    })

    const [first, second] = await Promise.all([runDueRecurring('u', now), runDueRecurring('u', now)])

    expect([first, second].sort()).toEqual([0, 3])
    expect(await db.transactions.count()).toBe(3)
    expect((await db.recurringTemplates.get('r'))?.nextDate).toBeGreaterThan(now)
  })
})
