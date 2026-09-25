import { beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('../../../api/http', () => ({ default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }))
vi.mock('../../../config/serverConfig', () => ({ hasConfiguredServer: () => true }))
vi.mock('../../syncStatus', () => ({ backendOnline: { value: true }, markSynced: vi.fn() }))
vi.mock('../../../i18n', () => ({ t: (key: string) => key }))

import { db, type SyncIssue } from '../../schema'
import { canRetry, ISSUE_TTL_MS, MAX_ISSUES, pruneIssues, retryIssue } from '../issues'
import { MAX_SYNC_INTERVAL_MS, MIN_SYNC_INTERVAL_MS, nextSyncDelay } from '../orchestrator'

const issue = (overrides: Partial<SyncIssue>): SyncIssue => ({
  ownerId: 'u',
  kind: 'rejected',
  entity: 'accounts',
  op: 'upsert',
  recordId: 'a',
  payload: { id: 'a', name: 'mine' },
  reason: 'stale',
  editedAt: 1,
  at: 2,
  ...overrides,
})

beforeEach(async () => {
  vi.stubGlobal('navigator', { onLine: false }) // keep retries queued rather than pushed
  await Promise.all(db.tables.map((table) => table.clear()))
})

describe('canRetry', () => {
  test('only where sending again could come out differently', () => {
    expect(canRetry(issue({ kind: 'failed', reason: 'failed' }))).toBe(true)
    expect(canRetry(issue({ kind: 'failed', reason: 'discarded', op: 'delete', payload: undefined }))).toBe(true)
    expect(canRetry(issue({ reason: 'stale' }))).toBe(true)
    // What it pointed at may have reached the server since (its own write, sent again).
    expect(canRetry(issue({ reason: 'reference' }))).toBe(true)
    expect(canRetry(issue({ reason: 'reference', op: 'delete', payload: undefined }))).toBe(false)
    for (const reason of ['deleted', 'parentDeleted', 'owner', 'currencyLocked', 'invalid']) {
      expect(canRetry(issue({ reason }))).toBe(false)
    }
  })
})

describe('pruneIssues', () => {
  test('drops issues past ISSUE_TTL_MS and beyond the newest MAX_ISSUES, for that profile only', async () => {
    const now = 2_000_000_000_000
    await db.syncIssues.bulkAdd([
      ...Array.from({ length: MAX_ISSUES + 2 }, (_, i) => issue({ at: now - i })),
      issue({ at: now - ISSUE_TTL_MS - 1 }),
      issue({ ownerId: 'someone-else', at: now - ISSUE_TTL_MS - 1 }),
    ])

    await pruneIssues('u', now)

    const left = await db.syncIssues.where('ownerId').equals('u').toArray()
    expect(left).toHaveLength(MAX_ISSUES)
    expect(Math.min(...left.map((i) => i.at))).toBe(now - (MAX_ISSUES - 1))
    expect(await db.syncIssues.where('ownerId').equals('someone-else').count()).toBe(1)
  })
})

describe('retryIssue', () => {
  test('re-applies the change locally, queues it as a new edit and drops the issue', async () => {
    const id = await db.syncIssues.add(issue({}))
    const before = Date.now()

    await retryIssue({ ...issue({}), id })

    expect(await db.accounts.get('a')).toMatchObject({ name: 'mine' })
    const [entry] = await db.outbox.toArray()
    expect(entry).toMatchObject({ op: 'upsert', recordId: 'a', ownerId: 'u' })
    expect(entry.createdAt).toBeGreaterThanOrEqual(before)
    expect(await db.syncIssues.count()).toBe(0)
  })
})

describe('nextSyncDelay', () => {
  test('backs off while idle, and snaps back on any activity', () => {
    let delay = MIN_SYNC_INTERVAL_MS
    const seen = []
    for (let i = 0; i < 4; i++) seen.push((delay = nextSyncDelay(delay, false)))
    expect(seen).toEqual([30_000, 60_000, MAX_SYNC_INTERVAL_MS, MAX_SYNC_INTERVAL_MS])
    expect(nextSyncDelay(delay, true)).toBe(MIN_SYNC_INTERVAL_MS)
  })
})
