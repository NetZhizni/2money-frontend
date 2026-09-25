import { beforeEach, describe, expect, test, vi, type Mock } from 'vitest'

vi.mock('../../../api/http', () => ({ default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }))
vi.mock('../../../config/serverConfig', () => ({ hasConfiguredServer: () => true }))

import http from '../../../api/http'
import { db } from '../../schema'
import { deleteAndQueue, MAX_ATTEMPTS, pushOutbox, putAndQueue } from '../outbox'
import { clearPullCache, pullMany } from '../pull'
import { canRetry } from '../issues'

const api = http as unknown as { get: Mock; post: Mock; delete: Mock }
const USER = 'user-1'

type Item = { id: string; [key: string]: unknown }
type BulkBody = { items: Item[] }

// Queue with the device offline, so the push every write kicks off on its
// own doesn't race the one the test runs explicitly.
async function queuedOffline(work: () => Promise<void>) {
  vi.stubGlobal('navigator', { onLine: false })
  await work()
  vi.stubGlobal('navigator', { onLine: true })
}

const account = (id: string, name = 'local') => ({ id, name, currency: 'UAH' })

beforeEach(async () => {
  vi.resetAllMocks()
  clearPullCache()
  await Promise.all(db.tables.map((table) => table.clear()))
})

describe('putAndQueue / deleteAndQueue', () => {
  test('write the record and its outbox entry together', async () => {
    await queuedOffline(() => putAndQueue('accounts', USER, [account('a')]))
    expect(await db.accounts.get('a')).toMatchObject({ name: 'local' })
    expect(await db.outbox.toArray()).toMatchObject([{ entity: 'accounts', op: 'upsert', recordId: 'a', ownerId: USER }])

    await queuedOffline(() => deleteAndQueue('accounts', USER, ['a']))
    expect(await db.accounts.get('a')).toBeUndefined()
    expect((await db.outbox.toArray()).map((e) => e.op)).toEqual(['upsert', 'delete'])
  })

  test('without a signed-in owner, only write locally', async () => {
    await putAndQueue('accounts', null, [account('a')])
    expect(await db.accounts.get('a')).toBeDefined()
    expect(await db.outbox.count()).toBe(0)
  })
})

describe('pushOutbox', () => {
  test('sends when each change was made, and takes the server’s row as the local copy', async () => {
    await queuedOffline(() => putAndQueue('accounts', USER, [account('a')]))
    const [entry] = await db.outbox.toArray()
    api.post.mockResolvedValueOnce({ data: { items: [{ id: 'a', ok: true, data: { ...account('a', 'as stored'), deletedAt: null } }] } })

    await pushOutbox(USER)

    const [url, body] = api.post.mock.calls[0] as [string, BulkBody]
    expect(url).toBe('/accounts/bulk')
    expect(body.items[0]).toMatchObject({ id: 'a', editedAt: entry.createdAt })
    expect(await db.outbox.count()).toBe(0)
    expect(await db.accounts.get('a')).toMatchObject({ name: 'as stored' })
  })

  test('sends deletes with their edit time too, after the upsert that came before them', async () => {
    await queuedOffline(async () => {
      await putAndQueue('accounts', USER, [account('a')])
      await deleteAndQueue('accounts', USER, ['a'])
    })
    api.post.mockResolvedValue({ data: { items: [{ id: 'a', ok: true }] } })

    await pushOutbox(USER)

    expect(api.post.mock.calls.map(([url]) => url)).toEqual(['/accounts/bulk', '/accounts/bulk-delete'])
    const [, body] = api.post.mock.calls[1] as [string, BulkBody]
    expect(body.items[0]).toMatchObject({ id: 'a', editedAt: expect.any(Number) })
    expect(api.delete).not.toHaveBeenCalled() // a DELETE body can be dropped on the way
    expect(await db.outbox.count()).toBe(0)
  })

  test('a refused change becomes an issue, and the local copy goes back to the server’s', async () => {
    await queuedOffline(() => putAndQueue('accounts', USER, [account('a', 'mine')]))
    api.post.mockImplementation(async (url: string) => {
      if (url === '/accounts/bulk') {
        return { data: { items: [{ id: 'a', ok: false, status: 409, reason: 'stale', message: 'changed later' }] } }
      }
      return { data: { items: [{ ...account('a', 'theirs'), deletedAt: null }] } } // /accounts/by-ids
    })

    await pushOutbox(USER)

    expect(await db.outbox.count()).toBe(0)
    expect(await db.syncIssues.toArray()).toMatchObject([
      { kind: 'rejected', reason: 'stale', entity: 'accounts', recordId: 'a', ownerId: USER, payload: { name: 'mine' } },
    ])
    expect(await db.accounts.get('a')).toMatchObject({ name: 'theirs' })
  })

  test('an operation filed under a category another device deleted is refused and removed here, kept only in its issue', async () => {
    await queuedOffline(() => putAndQueue('transactions', USER, [{ id: 't', categoryId: 'deleted-elsewhere', amount: 100 }]))
    api.post.mockImplementation(async (url: string) => {
      if (url === '/transactions/bulk') return { data: { items: [{ id: 't', ok: false, status: 409, reason: 'parentDeleted' }] } }
      return { data: { items: [] } } // /transactions/by-ids: the server never took it
    })

    await pushOutbox(USER)

    expect(await db.transactions.get('t')).toBeUndefined()
    const [issue] = await db.syncIssues.toArray()
    expect(issue).toMatchObject({ kind: 'rejected', reason: 'parentDeleted', payload: { amount: 100 } })
    // Nothing offers a way to file it elsewhere yet — sending it again would only be refused again.
    expect(canRetry(issue)).toBe(false)
  })

  test('a server-side failure holds the queue, then is parked as an issue after MAX_ATTEMPTS', async () => {
    await queuedOffline(async () => {
      await putAndQueue('accounts', USER, [account('poison')])
      await putAndQueue('categories', USER, [{ id: 'c', name: 'after it' }])
    })
    api.post.mockImplementation(async (url: string, body: BulkBody) => {
      if (url === '/accounts/bulk') return { data: { items: [{ id: 'poison', ok: false, status: 500, message: 'boom' }] } }
      if (url === '/accounts/by-ids') return { data: { items: [] } }
      return { data: { items: body.items.map((item) => ({ id: item.id, ok: true })) } }
    })

    for (let attempt = 1; attempt < MAX_ATTEMPTS; attempt++) {
      await pushOutbox(USER)
      const poison = await db.outbox.filter((e) => e.recordId === 'poison').first()
      expect(poison?.attempts).toBe(attempt)
      expect(api.post.mock.calls.some(([url]) => url === '/categories/bulk')).toBe(false)
    }

    await pushOutbox(USER)
    expect(await db.syncIssues.toArray()).toMatchObject([{ kind: 'failed', reason: 'failed', recordId: 'poison' }])
    expect(api.post.mock.calls.some(([url]) => url === '/categories/bulk')).toBe(true)
    expect(await db.outbox.count()).toBe(0)
  })

  test('a request that fails as a whole keeps everything queued and uses up no attempts', async () => {
    await queuedOffline(() => putAndQueue('accounts', USER, [account('a')]))
    api.post.mockRejectedValue(new Error('Network Error'))

    for (let i = 0; i < MAX_ATTEMPTS + 1; i++) await pushOutbox(USER)

    const [entry] = await db.outbox.toArray()
    expect(entry.attempts ?? 0).toBe(0)
    expect(await db.syncIssues.count()).toBe(0)
  })

  test('a batch too large for the server is split until the oversized entry is isolated', async () => {
    await queuedOffline(() => putAndQueue('accounts', USER, [account('a'), account('big'), account('c')]))
    api.post.mockImplementation(async (url: string, body: BulkBody) => {
      if (url === '/accounts/by-ids') return { data: { items: [] } }
      if (body.items.length > 1 || body.items[0].id === 'big') throw { response: { status: 413 } }
      return { data: { items: [{ id: body.items[0].id, ok: true }] } }
    })

    await pushOutbox(USER)

    expect(await db.outbox.count()).toBe(0)
    expect(await db.syncIssues.toArray()).toMatchObject([{ kind: 'failed', reason: 'tooLarge', recordId: 'big' }])
    expect((await db.accounts.toArray()).map((a) => a.id).sort()).toEqual(['a', 'c'])
  })
})

describe('deleting an account', () => {
  const OTHER = 'user-2'

  // Plain tables (Table<any>): these tests only care about the fields the cascade reads.
  async function seed() {
    await db.table('accounts').put(account('a'))
    await db.table('transactions').bulkPut([
      { id: 't-from', ownerId: USER, accountId: 'a' },
      { id: 't-into', ownerId: USER, accountId: 'other', toAccountId: 'a' },
      { id: 't-theirs', ownerId: OTHER, accountId: 'theirs', toAccountId: 'a' },
      { id: 't-elsewhere', ownerId: USER, accountId: 'other' },
    ])
    await db.table('recurringTemplates').bulkPut([
      { id: 'r-mine', ownerId: USER, accountId: 'a' },
      { id: 'r-theirs', ownerId: OTHER, accountId: 'theirs', toAccountId: 'a' },
      { id: 'r-elsewhere', ownerId: USER, accountId: 'other' },
    ])
  }

  const ids = async (table: 'transactions' | 'recurringTemplates') => (await db.table(table).toCollection().primaryKeys()).sort()

  test('takes what the server cascades to along locally, in one step, and queues only the account', async () => {
    await seed()
    await queuedOffline(() => deleteAndQueue('accounts', USER, ['a']))

    expect(await db.accounts.get('a')).toBeUndefined()
    // Every template on it goes; operations never do (the server refuses
    // the delete while any are left — see stores/accounts.ts's remove()).
    expect(await ids('transactions')).toEqual(['t-elsewhere', 't-from', 't-into', 't-theirs'])
    expect(await ids('recurringTemplates')).toEqual(['r-elsewhere'])

    const [entry, ...rest] = await db.outbox.toArray()
    expect(rest).toEqual([])
    expect(entry).toMatchObject({ entity: 'accounts', op: 'delete', recordId: 'a' })
    expect(entry.cascade?.transactions).toBeUndefined()
    expect(entry.cascade?.recurringTemplates?.sort()).toEqual(['r-mine', 'r-theirs'])
  })

  test('a pull while the delete is still queued does not put those rows back', async () => {
    await seed()
    await queuedOffline(() => deleteAndQueue('accounts', USER, ['a']))
    api.post.mockResolvedValueOnce({
      data: { syncedAt: 1, entities: { recurringTemplates: [{ id: 'r-mine', ownerId: USER, accountId: 'a', deletedAt: null }] }, next: {} },
    })

    await pullMany(['recurringTemplates'], { scope: 'all' }, 'test')

    expect(await db.recurringTemplates.get('r-mine')).toBeUndefined()
  })

  test('a refused delete brings the account back with everything it took along', async () => {
    await seed()
    await queuedOffline(() => deleteAndQueue('accounts', USER, ['a']))
    const byIds = (body: { ids: string[] }, fields: object) => ({ data: { items: body.ids.map((id) => ({ id, ...fields, deletedAt: null })) } })
    api.post.mockImplementation(async (url: string, body: { ids: string[] }) => {
      if (url === '/accounts/bulk-delete') return { data: { items: [{ id: 'a', ok: false, status: 409, reason: 'inUse' }] } }
      if (url === '/accounts/by-ids') return byIds(body, { name: 'renamed elsewhere' })
      if (url === '/recurring-templates/by-ids') return byIds(body, { ownerId: USER })
      throw new Error(`unexpected ${url}`)
    })

    await pushOutbox(USER)

    expect(await db.accounts.get('a')).toMatchObject({ name: 'renamed elsewhere' })
    expect(await ids('transactions')).toEqual(['t-elsewhere', 't-from', 't-into', 't-theirs'])
    expect(await ids('recurringTemplates')).toEqual(['r-elsewhere', 'r-mine', 'r-theirs'])
    expect(await db.syncIssues.toArray()).toMatchObject([{ op: 'delete', recordId: 'a', reason: 'inUse' }])
  })
})
