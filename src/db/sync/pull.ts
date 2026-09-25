import http from '../../api/http'
import { db, type SyncableEntity, type SyncCursor, type UserDirectoryEntry } from '../schema'
import { hasConfiguredServer } from '../../config/serverConfig'
import { RESOURCE_PATH, type SyncRow } from './registry'
import { noteServerTime } from './clock'

type PullScope = { scope: 'all' } | undefined

const USERS_KEY = 'users'
const PULL_COALESCE_MS = 5_000
const pullCache = new Map<string, { promise: Promise<void>; settledAt: number | null }>()

/**
 * Rows per entity per request. A first load of years of family history comes
 * down as a series of pages rather than one response that has to fit in
 * memory (and in the timeout) all at once — see the backend's
 * sync/engine.js listRows for how paging stays consistent while rows change.
 */
export const PAGE_SIZE = 1000

/** Ids per by-ids request — see refetchRecords. */
const REFETCH_CHUNK_SIZE = 500

/**
 * Many unrelated places ask for a fresh pull of the same entity at once (a
 * view mounting, a store waking up, the periodic sync, returning to the tab) —
 * this collapses that burst into a single request: callers arriving while one
 * is in flight await it, and one that just finished is reused for a short
 * window instead of immediately refetching the same delta.
 *
 * It's also what keeps at most one pull per cursor in flight at a time — two
 * overlapping pulls of the same entity could land out of order and leave the
 * older snapshot on top.
 */
function recentPull(key: string): Promise<void> | undefined {
  const cached = pullCache.get(key)
  if (cached && (cached.settledAt === null || Date.now() - cached.settledAt < PULL_COALESCE_MS)) return cached.promise
  return undefined
}

function trackPull(key: string, work: Promise<void>): Promise<void> {
  const entry: { promise: Promise<void>; settledAt: number | null } = { promise: null as unknown as Promise<void>, settledAt: null }
  entry.promise = work.finally(() => {
    entry.settledAt = Date.now()
  })
  pullCache.set(key, entry)
  return entry.promise
}

export function clearPullCache(): void {
  pullCache.clear()
}

function cursorKeyFor(entity: SyncableEntity, opts: PullScope): SyncCursor['entity'] {
  return opts?.scope ? (`${entity}:${opts.scope}` as const) : entity
}

export function tableOf(entity: SyncableEntity) {
  return db[entity] as unknown as { bulkPut: (rows: SyncRow[]) => Promise<unknown>; bulkDelete: (ids: string[]) => Promise<void> }
}

/**
 * Every record of `entity` with a write of ours still queued — its local copy
 * is newer than anything the server can tell us. That includes rows removed
 * along with a delete still queued (see OutboxEntry.cascade): until that
 * delete lands, the server still has them, and a pull would put them back.
 */
export async function pendingRecordIds(entity: SyncableEntity): Promise<Set<string>> {
  const ids = new Set<string>()
  await db.outbox.each((entry) => {
    if (entry.entity === entity) ids.add(entry.recordId)
    for (const id of entry.cascade?.[entity] ?? []) ids.add(id)
  })
  return ids
}

// Writes the server has confirmed, numbered in the order they were confirmed
// — see noteAcked. Forgotten after a while: no pull runs anywhere near that
// long, so an older confirmation can no longer be racing one.
let ackSeq = 0
const acked = new Map<string, { seq: number; at: number }>()
const ACK_MEMORY_MS = 10 * 60_000

/**
 * Called by the outbox for every write the server just confirmed. A pull
 * whose request went out before that confirmation can still be carrying the
 * record's PREVIOUS server copy (its snapshot predates the write) — and by
 * the time it's applied, the write is no longer queued, so applyDelta's
 * pending check can't catch it: the old version would flash back until the
 * next pull. Numbering confirmations lets applyDelta skip exactly those rows.
 * Nothing is lost by skipping them: that pull's cursor predates the write
 * too, so the next pull brings the confirmed version back regardless.
 */
export function noteAcked(entity: SyncableEntity, ids: string[]): void {
  if (!ids.length) return
  const now = Date.now()
  ackSeq += 1
  for (const id of ids) acked.set(`${entity}:${id}`, { seq: ackSeq, at: now })
  for (const [key, entry] of acked) if (now - entry.at > ACK_MEMORY_MS) acked.delete(key)
}

function ackedSince(entity: SyncableEntity, id: string, seq: number): boolean {
  const entry = acked.get(`${entity}:${id}`)
  return entry !== undefined && entry.seq > seq
}

/**
 * Merges one page of an entity's delta into Dexie — and, on the LAST page
 * (`cursor` non-null), advances its cursor, in the same Dexie transaction so
 * a mid-pull failure can't leave the table updated but the cursor stale (or
 * the reverse, which would skip those changes forever). Earlier pages leave
 * the cursor alone: it has to stay the one from the FIRST page until every
 * page is in (see the backend's sync/engine.js listRows), and an interrupted
 * paged pull simply starts over from the old cursor next time.
 *
 * A record with a write of ours still queued is skipped — whether that's an
 * edit or a delete: the server's copy is older, and applying it would flash
 * the old version back (or resurrect a deleted record) until the push lands.
 * Once it does, the server's updated_at moves past this cursor and the next
 * pull brings it back anyway; if the server refuses it instead, the outbox
 * re-reads it explicitly (see refetchRecords). The same goes for a record
 * whose write was confirmed after this pull set off (see noteAcked).
 */
async function applyDelta(
  entity: SyncableEntity,
  cursorKey: SyncCursor['entity'],
  items: SyncRow[],
  cursor: number | null,
  ackSeqAtStart: number,
): Promise<void> {
  const table = tableOf(entity)
  await db.transaction('rw', db[entity], db.outbox, db.syncCursors, async () => {
    const pendingIds = await pendingRecordIds(entity)
    const puts: SyncRow[] = []
    const deletes: string[] = []
    for (const item of items) {
      if (pendingIds.has(item.id) || ackedSince(entity, item.id, ackSeqAtStart)) continue
      if (item.deletedAt) deletes.push(item.id)
      else puts.push(item)
    }
    if (deletes.length) await table.bulkDelete(deletes)
    if (puts.length) await table.bulkPut(puts)
    if (cursor !== null) await db.syncCursors.put({ entity: cursorKey, since: cursor })
  })
}

/** The family directory (see stores/profiles.ts). Not delta-synced — it's a handful of rows, so each pull replaces the set outright, which also prunes members who are no longer listed. */
async function applyUserDirectory(users: UserDirectoryEntry[]): Promise<void> {
  await db.transaction('rw', db.users, async () => {
    const freshIds = new Set(users.map((u) => u.id))
    const staleIds = (await db.users.toCollection().primaryKeys()).filter((id) => !freshIds.has(id as string))
    if (staleIds.length) await db.users.bulkDelete(staleIds)
    await db.users.bulkPut(users)
  })
}

/** The database's clock, which every pull answer carries — see the backend's sync/engine.js readClock. */
interface ServerClock {
  syncedAt: number
  serverNow: number
}

interface ListPage extends ServerClock {
  items: SyncRow[]
  /** Where to continue from, or null on the last page. */
  next: string | null
}

/** Sends one pull request, and takes the measurement of this device's clock its answer carries (see clock.ts). */
async function timed<T extends ServerClock>(request: () => Promise<{ data: T }>): Promise<T> {
  const sentAt = Date.now()
  const { data } = await request()
  noteServerTime(data.serverNow, sentAt, Date.now())
  return data
}

/**
 * Delta-pulls one entity into Dexie. Each pull sends the cursor saved from the
 * last successful one (see db/schema.ts's SyncCursor) and asks only for what
 * changed since — the server answers with its own cursor (see the backend's
 * sync/engine.js readClock), which is stored as the next one once every page
 * is in.
 *
 * `scope: 'all'` asks for the family-wide view instead of just this profile's
 * rows; it tracks a separate cursor (`"<entity>:all"`) because the two answer
 * different questions and would otherwise clobber each other's bookmark into
 * silently incomplete pulls.
 */
export async function pullEntity(entity: SyncableEntity, opts?: PullScope): Promise<void> {
  if (!hasConfiguredServer()) return
  const cursorKey = cursorKeyFor(entity, opts)
  return (
    recentPull(cursorKey) ??
    trackPull(
      cursorKey,
      (async () => {
        const ackSeqAtStart = ackSeq
        const since = (await db.syncCursors.get(cursorKey))?.since
        let syncedAt: number | null = null
        let after: string | null = null
        do {
          const params = {
            ...(opts?.scope ? { scope: opts.scope } : {}),
            ...(since ? { since } : {}),
            limit: PAGE_SIZE,
            ...(after ? { after } : {}),
          }
          const data = await timed(() => http.get<ListPage>(`/${RESOURCE_PATH[entity]}`, { params }))
          syncedAt ??= data.syncedAt
          after = data.next
          await applyDelta(entity, cursorKey, data.items, after ? null : syncedAt, ackSeqAtStart)
        } while (after)
      })(),
    )
  )
}

interface SyncPullResponse extends ServerClock {
  entities: Partial<Record<SyncableEntity, SyncRow[]>>
  /** Entities with more pages to come, and where each continues from. */
  next: Partial<Record<SyncableEntity, string>>
  users?: UserDirectoryEntry[]
}

function deferred() {
  let resolve!: () => void
  let reject!: (error: unknown) => void
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/**
 * Pulls several entities — and, with `users`, the family directory — through
 * the backend's POST /sync/pull: one request per page for all of them,
 * instead of a GET each. This is what every periodic sync tick runs, so it's
 * the difference between one request and eight. An entity that already has a
 * pull in flight (or one that just finished) is awaited rather than asked for
 * again — see recentPull.
 *
 * Paging is per entity: each request only lists the entities that still have
 * pages to come, and each one's cursor is stored once its own last page is in.
 *
 * Reports success per entity rather than as a unit, so one entity's trouble
 * doesn't discard the others' fresh data. An entity the server leaves out of
 * its answer (a server older than this client) counts as failed and keeps its
 * cursor. `changed` says whether any rows at all came down — what the
 * periodic sync paces itself by (see orchestrator.ts).
 */
export async function pullMany(
  entities: SyncableEntity[],
  opts: PullScope,
  logLabel: string,
  { users = false } = {},
): Promise<{ ok: boolean[]; usersOk: boolean; changed: boolean }> {
  if (!hasConfiguredServer()) return { ok: entities.map(() => true), usersOk: true, changed: false }

  const waits = new Map<SyncableEntity, Promise<void>>()
  const toFetch: SyncableEntity[] = []
  for (const entity of entities) {
    const inFlight = recentPull(cursorKeyFor(entity, opts))
    if (inFlight) waits.set(entity, inFlight)
    else toFetch.push(entity)
  }
  let usersWait = users ? recentPull(USERS_KEY) : undefined
  const fetchUsers = users && !usersWait
  let changed = false

  if (toFetch.length || fetchUsers) {
    const done = new Map(toFetch.map((entity) => [entity, deferred()]))
    for (const [entity, { promise }] of done) waits.set(entity, trackPull(cursorKeyFor(entity, opts), promise))
    const usersDone = fetchUsers ? deferred() : undefined
    if (usersDone) usersWait = trackPull(USERS_KEY, usersDone.promise)

    const drive = async () => {
      const ackSeqAtStart = ackSeq
      const since = new Map(
        await Promise.all(
          toFetch.map(async (entity) => [entity, (await db.syncCursors.get(cursorKeyFor(entity, opts)))?.since ?? null] as const),
        ),
      )
      let syncedAt: number | null = null
      let remaining = toFetch
      let after: Partial<Record<SyncableEntity, string>> = {}
      let wantUsers = fetchUsers

      while (remaining.length || wantUsers) {
        const body = {
          cursors: Object.fromEntries(remaining.map((entity) => [entity, since.get(entity)])),
          after,
          limit: PAGE_SIZE,
          ...(opts?.scope ? { scope: opts.scope } : {}),
          users: wantUsers,
        }
        const data = await timed(() => http.post<SyncPullResponse>('/sync/pull', body))
        syncedAt ??= data.syncedAt

        if (wantUsers) {
          wantUsers = false
          if (!data.users) usersDone!.reject(new Error('server response has no "users"'))
          else await applyUserDirectory(data.users).then(usersDone!.resolve, usersDone!.reject)
        }

        const stillPaging: SyncableEntity[] = []
        const nextAfter: Partial<Record<SyncableEntity, string>> = {}
        for (const entity of remaining) {
          const items = data.entities[entity]
          if (!items) {
            done.get(entity)!.reject(new Error(`server response has no "${entity}"`))
            continue
          }
          if (items.length) changed = true
          const more = data.next[entity]
          try {
            await applyDelta(entity, cursorKeyFor(entity, opts), items, more ? null : syncedAt, ackSeqAtStart)
          } catch (error) {
            done.get(entity)!.reject(error)
            continue
          }
          if (more) {
            stillPaging.push(entity)
            nextAfter[entity] = more
          } else {
            done.get(entity)!.resolve()
          }
        }
        remaining = stillPaging
        after = nextAfter
      }
    }

    // A failed request fails everything still waiting on one; settling an
    // entity that already finished is a no-op.
    drive().catch((error) => {
      for (const { reject } of done.values()) reject(error)
      usersDone?.reject(error)
    })
  }

  const settle = (promise: Promise<void>, what: string) =>
    promise
      .then(() => true)
      .catch((error) => {
        console.error(`[sync] ${logLabel} pull ${what}${opts ? '?scope=all' : ''} failed`, error)
        return false
      })

  const [ok, usersOk] = await Promise.all([
    Promise.all(entities.map((entity) => settle(waits.get(entity)!, entity))),
    usersWait ? settle(usersWait, USERS_KEY) : Promise.resolve(true),
  ])
  return { ok, usersOk, changed }
}

/** The family directory on its own — see applyUserDirectory. */
export async function pullUserDirectory(): Promise<void> {
  if (!navigator.onLine || !hasConfiguredServer()) return
  return (
    recentPull(USERS_KEY) ??
    trackPull(
      USERS_KEY,
      (async () => {
        const { data } = await http.get<UserDirectoryEntry[]>('/users')
        await applyUserDirectory(data)
      })(),
    )
  )
}

/**
 * Re-reads specific records from the server and makes the local copy match
 * it exactly — for writes the server just refused for good (see outbox.ts).
 * The local copy still holds the refused version, and since the server's own
 * copy didn't change, no delta pull would ever bring it back: without this
 * the two would stay apart until a manual resync.
 *
 * A record the server doesn't have at all (a create it refused) is removed
 * locally. One with another write of ours still queued is left alone — that
 * later write settles it.
 *
 * Asked for in chunks: a refused account delete brings back every
 * transaction it took along, which can be more than one request may carry
 * (see the backend's sync/router.js MAX_BULK_ITEMS).
 */
export async function refetchRecords(entity: SyncableEntity, ids: string[]): Promise<void> {
  if (!ids.length || !hasConfiguredServer()) return
  for (let start = 0; start < ids.length; start += REFETCH_CHUNK_SIZE) {
    const chunk = ids.slice(start, start + REFETCH_CHUNK_SIZE)
    const { data } = await http.post<{ items: SyncRow[] }>(`/${RESOURCE_PATH[entity]}/by-ids`, { ids: chunk })
    const table = tableOf(entity)
    await db.transaction('rw', db[entity], db.outbox, async () => {
      const pendingIds = await pendingRecordIds(entity)
      const found = new Map(data.items.map((item) => [item.id, item]))
      const puts: SyncRow[] = []
      const deletes: string[] = []
      for (const id of chunk) {
        if (pendingIds.has(id)) continue
        const item = found.get(id)
        if (item && !item.deletedAt) puts.push(item)
        else deletes.push(id)
      }
      if (deletes.length) await table.bulkDelete(deletes)
      if (puts.length) await table.bulkPut(puts)
    })
  }
}
