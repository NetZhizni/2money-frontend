import { beforeEach, describe, expect, test, vi, type Mock } from 'vitest'

vi.mock('../../../api/http', () => ({ default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }))
vi.mock('../../../config/serverConfig', () => ({ hasConfiguredServer: () => true }))

import http from '../../../api/http'
import { db } from '../../schema'
import { pushOutbox, putAndQueue } from '../outbox'
import { clearPullCache, pullEntity, pullMany } from '../pull'

// What happens around a device that was away longer than the server keeps
// tombstones (see the backend's jobs/purgeDeleted.js and sync/engine.js
// cursorExpired / refuseVanished).

const api = http as unknown as { get: Mock; post: Mock; delete: Mock }
const USER = 'user-1'
const OLD_CURSOR = 1_000
const tx = (id: string, note = 'server') => ({ id, note, currency: 'UAH' })

type PullBody = { cursors: Record<string, number | null>; after: Record<string, string> }

async function queuedOffline(work: () => Promise<void>) {
  vi.stubGlobal('navigator', { onLine: false })
  await work()
  vi.stubGlobal('navigator', { onLine: true })
}

beforeEach(async () => {
  vi.resetAllMocks()
  clearPullCache()
  await Promise.all(db.tables.map((table) => table.clear()))
  await db.syncCursors.put({ entity: 'transactions:all', since: OLD_CURSOR })
})

describe('a full list in answer to an expired cursor', () => {
  test('drops what the device still holds that the list doesn’t have — but not what it has a write queued for', async () => {
    await db.transactions.bulkPut([tx('kept'), tx('purged-elsewhere')] as never[])
    await queuedOffline(() => putAndQueue('transactions', USER, [tx('queued-here', 'local')]))
    api.post.mockResolvedValueOnce({
      data: { syncedAt: 5_000, serverNow: 5_000, entities: { transactions: [tx('kept'), tx('new-elsewhere')] }, next: {}, full: ['transactions'] },
    })

    const { ok } = await pullMany(['transactions'], { scope: 'all' }, 'test')

    expect(ok).toEqual([true])
    expect((await db.transactions.toCollection().primaryKeys()).sort()).toEqual(['kept', 'new-elsewhere', 'queued-here'])
    expect(await db.syncCursors.get('transactions:all')).toEqual({ entity: 'transactions:all', since: 5_000 })
  })

  test('only prunes once every page is in', async () => {
    await db.transactions.bulkPut([tx('a'), tx('b'), tx('gone')] as never[])
    api.post
      .mockResolvedValueOnce({ data: { syncedAt: 5_000, serverNow: 5_000, entities: { transactions: [tx('a')] }, next: { transactions: 'a' }, full: ['transactions'] } })
      .mockResolvedValueOnce({ data: { syncedAt: 6_000, serverNow: 6_000, entities: { transactions: [tx('b')] }, next: {}, full: ['transactions'] } })

    await pullMany(['transactions'], { scope: 'all' }, 'test')

    expect((await db.transactions.toCollection().primaryKeys()).sort()).toEqual(['a', 'b'])
    const [, second] = api.post.mock.calls[1] as [string, PullBody]
    expect(second.cursors).toEqual({ transactions: OLD_CURSOR }) // every page asks from the same old cursor
  })

  test('pages that disagree (a purge started mid-pull) prune nothing and keep the old cursor', async () => {
    await db.transactions.bulkPut([tx('a'), tx('b'), tx('gone')] as never[])
    api.post
      .mockResolvedValueOnce({ data: { syncedAt: 5_000, serverNow: 5_000, entities: { transactions: [tx('a')] }, next: { transactions: 'a' } } })
      .mockResolvedValueOnce({ data: { syncedAt: 6_000, serverNow: 6_000, entities: { transactions: [tx('b')] }, next: {}, full: ['transactions'] } })

    await pullMany(['transactions'], { scope: 'all' }, 'test')

    expect((await db.transactions.toCollection().primaryKeys()).sort()).toEqual(['a', 'b', 'gone'])
    expect(await db.syncCursors.get('transactions:all')).toEqual({ entity: 'transactions:all', since: OLD_CURSOR })
  })

  test('a plain delta never prunes', async () => {
    await db.transactions.bulkPut([tx('untouched')] as never[])
    api.post.mockResolvedValueOnce({ data: { syncedAt: 5_000, serverNow: 5_000, entities: { transactions: [tx('new')] }, next: {} } })

    await pullMany(['transactions'], { scope: 'all' }, 'test')

    expect((await db.transactions.toCollection().primaryKeys()).sort()).toEqual(['new', 'untouched'])
  })

  test('the single-entity pull prunes the same way', async () => {
    await db.transactions.bulkPut([tx('kept'), tx('gone')] as never[])
    api.get.mockResolvedValueOnce({ data: { items: [tx('kept')], syncedAt: 5_000, serverNow: 5_000, next: null, full: true } })

    await pullEntity('transactions', { scope: 'all' })

    expect(await db.transactions.toCollection().primaryKeys()).toEqual(['kept'])
  })
})

describe('mustExist', () => {
  type BulkBody = { items: Record<string, unknown>[] }

  test('an edit of a record the device already had goes out flagged; a new record doesn’t', async () => {
    await db.transactions.put(tx('existing') as never)
    await queuedOffline(() => putAndQueue('transactions', USER, [tx('existing', 'edited'), tx('brand-new', 'created')]))
    api.post.mockResolvedValueOnce({ data: { items: [{ id: 'existing', ok: true }, { id: 'brand-new', ok: true }] } })

    await pushOutbox(USER)

    const [, body] = api.post.mock.calls[0] as [string, BulkBody]
    expect(body.items.map((item) => [item.id, item.mustExist ?? false])).toEqual([
      ['existing', true],
      ['brand-new', false],
    ])
  })

  test('an edit of a record whose creation is still queued goes out flagged, alongside it', async () => {
    await queuedOffline(() => putAndQueue('transactions', USER, [tx('fresh', 'v1')]))
    await queuedOffline(() => putAndQueue('transactions', USER, [tx('fresh', 'v2')]))
    api.post.mockResolvedValueOnce({ data: { items: [{ id: 'fresh', ok: true }] } })

    await pushOutbox(USER)

    const [, body] = api.post.mock.calls[0] as [string, BulkBody]
    // The server settles a create + edit of one record as a creation — see engine.js upsertMany.
    expect(body.items.map((item) => item.mustExist ?? false)).toEqual([false, true])
  })

  test('an entry queued before the flag existed goes out unflagged', async () => {
    await db.outbox.add({ entity: 'transactions', op: 'upsert', recordId: 'legacy', payload: tx('legacy'), ownerId: USER, createdAt: 1 })
    api.post.mockResolvedValueOnce({ data: { items: [{ id: 'legacy', ok: true }] } })

    await pushOutbox(USER)

    const [, body] = api.post.mock.calls[0] as [string, BulkBody]
    expect(body.items[0].mustExist).toBeUndefined()
  })
})
