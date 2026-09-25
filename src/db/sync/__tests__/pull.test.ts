import { beforeEach, describe, expect, test, vi, type Mock } from 'vitest'

vi.mock('../../../api/http', () => ({ default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }))
vi.mock('../../../config/serverConfig', () => ({ hasConfiguredServer: () => true }))

import http from '../../../api/http'
import { db } from '../../schema'
import { clearPullCache, noteAcked, PAGE_SIZE, pullEntity, pullMany } from '../pull'
import { serverNow } from '../clock'

const api = http as unknown as { get: Mock; post: Mock; delete: Mock }

const row = (id: string, name = 'server') => ({ id, name, currency: 'UAH', deletedAt: null })

type PullBody = { cursors: Record<string, number | null>; after: Record<string, string>; limit: number }

beforeEach(async () => {
  vi.resetAllMocks()
  clearPullCache()
  await Promise.all(db.tables.map((table) => table.clear()))
})

describe('pullMany', () => {
  test('applies every page, and stores the FIRST page’s cursor once the last page is in', async () => {
    api.post
      .mockResolvedValueOnce({ data: { syncedAt: 1_000, entities: { accounts: [row('a1')] }, next: { accounts: 'a1' } } })
      .mockResolvedValueOnce({ data: { syncedAt: 2_000, entities: { accounts: [row('a2')] }, next: {} } })

    const { ok, changed } = await pullMany(['accounts'], { scope: 'all' }, 'test')

    expect(ok).toEqual([true])
    expect(changed).toBe(true)
    expect((await db.accounts.toArray()).map((a) => a.id)).toEqual(['a1', 'a2'])
    expect(await db.syncCursors.get('accounts:all')).toEqual({ entity: 'accounts:all', since: 1_000 })

    const [, first] = api.post.mock.calls[0] as [string, PullBody]
    const [, second] = api.post.mock.calls[1] as [string, PullBody]
    expect(first).toMatchObject({ cursors: { accounts: null }, after: {}, limit: PAGE_SIZE })
    expect(second).toMatchObject({ cursors: { accounts: null }, after: { accounts: 'a1' } })
  })

  test('a paged pull cut short keeps the old cursor, so the next one starts over', async () => {
    await db.syncCursors.put({ entity: 'accounts:all', since: 500 })
    api.post
      .mockResolvedValueOnce({ data: { syncedAt: 1_000, entities: { accounts: [row('a1')] }, next: { accounts: 'a1' } } })
      .mockRejectedValueOnce(new Error('Network Error'))

    const { ok } = await pullMany(['accounts'], { scope: 'all' }, 'test')

    expect(ok).toEqual([false])
    expect(await db.accounts.get('a1')).toBeDefined()
    expect(await db.syncCursors.get('accounts:all')).toEqual({ entity: 'accounts:all', since: 500 })
  })

  test('pages each entity on its own', async () => {
    api.post
      .mockResolvedValueOnce({ data: { syncedAt: 1_000, entities: { accounts: [row('a1')], tags: [row('t1')] }, next: { accounts: 'a1' } } })
      .mockResolvedValueOnce({ data: { syncedAt: 2_000, entities: { accounts: [row('a2')] }, next: {} } })

    const { ok } = await pullMany(['accounts', 'tags'], { scope: 'all' }, 'test')

    expect(ok).toEqual([true, true])
    const [, second] = api.post.mock.calls[1] as [string, PullBody]
    expect(Object.keys(second.cursors)).toEqual(['accounts'])
    expect(await db.syncCursors.get('tags:all')).toMatchObject({ since: 1_000 })
    expect(await db.syncCursors.get('accounts:all')).toMatchObject({ since: 1_000 })
  })

  test('leaves a record alone while a write of ours to it is still queued', async () => {
    await db.accounts.put(row('a', 'my unsent edit') as never)
    await db.outbox.add({ entity: 'accounts', op: 'upsert', recordId: 'a', ownerId: 'u', createdAt: 1 })
    api.post.mockResolvedValueOnce({ data: { syncedAt: 1_000, entities: { accounts: [row('a', 'older server copy')] }, next: {} } })

    await pullMany(['accounts'], { scope: 'all' }, 'test')

    expect(await db.accounts.get('a')).toMatchObject({ name: 'my unsent edit' })
  })

  test('does not overwrite a record whose write was confirmed after the pull set off', async () => {
    await db.accounts.put(row('acked', 'confirmed version') as never)
    api.post.mockImplementationOnce(async () => {
      // The push lands while this pull's request is still out — its snapshot predates it.
      noteAcked('accounts', ['acked'])
      return { data: { syncedAt: 1_000, entities: { accounts: [row('acked', 'pre-write snapshot')] }, next: {} } }
    })

    await pullMany(['accounts'], { scope: 'all' }, 'test')

    expect(await db.accounts.get('acked')).toMatchObject({ name: 'confirmed version' })
  })

  test('reports whether anything came down at all', async () => {
    api.post.mockResolvedValueOnce({ data: { syncedAt: 1_000, entities: { accounts: [] }, next: {} } })
    const { changed } = await pullMany(['accounts'], { scope: 'all' }, 'test')
    expect(changed).toBe(false)
  })

  test('measures this device’s clock against the server’s from every answer', async () => {
    const deviceNow = 1_000_000
    vi.spyOn(Date, 'now').mockReturnValue(deviceNow)
    api.post.mockResolvedValueOnce({ data: { syncedAt: 1_000, serverNow: deviceNow + 180_000, entities: { accounts: [] }, next: {} } })

    await pullMany(['accounts'], { scope: 'all' }, 'test')

    expect(serverNow()).toBe(deviceNow + 180_000)
    vi.restoreAllMocks()
  })
})

describe('pullEntity', () => {
  test('pages through GET the same way', async () => {
    api.get
      .mockResolvedValueOnce({ data: { syncedAt: 1_000, items: [row('a1')], next: 'a1' } })
      .mockResolvedValueOnce({ data: { syncedAt: 2_000, items: [row('a2')], next: null } })

    await pullEntity('accounts', { scope: 'all' })

    expect((await db.accounts.toArray()).map((a) => a.id)).toEqual(['a1', 'a2'])
    expect(await db.syncCursors.get('accounts:all')).toMatchObject({ since: 1_000 })
    const [, config] = api.get.mock.calls[1] as [string, { params: Record<string, unknown> }]
    expect(config.params).toMatchObject({ scope: 'all', limit: PAGE_SIZE, after: 'a1' })
  })
})
