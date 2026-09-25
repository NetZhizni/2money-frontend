import http from '../../api/http'
import { db, type OutboxEntry, type SyncableEntity, type SyncIssue } from '../schema'
import { hasConfiguredServer } from '../../config/serverConfig'
import { DELETE_CASCADES, RESOURCE_PATH, type DeleteCascade, type SyncRow } from './registry'
import { noteAcked, pendingRecordIds, refetchRecords, tableOf } from './pull'
import { serverNow } from './clock'
import { withTabLock } from './lock'

/**
 * The offline write queue: every local mutation is written to Dexie and
 * queued here (see db/schema.ts's OutboxEntry), then replayed against the API
 * whenever there's a connection. Nothing in the app ever writes to the server
 * directly — that's what makes the whole app work identically offline.
 *
 * An entry is only ever taken off the queue for one of three reasons, and
 * never silently: the server took it; the server refused it for good (a 4xx —
 * replaying the identical request can only get the identical answer); or it
 * kept failing on the server's side MAX_ATTEMPTS times. Either of the last
 * two lands in db.syncIssues, which the UI shows (see
 * components/layout/SyncStatusBadge.vue), and the local copy is put back to
 * the server's version. The queue is strictly ordered, so without those two
 * exits one bad entry at its head would block every later write on the
 * device forever.
 */
function isTerminalStatus(status: number): boolean {
  // 401 is excluded because the auth interceptor refreshes the token and the
  // next attempt can genuinely succeed.
  return status !== 401 && status < 500
}

/**
 * How many times an entry may come back with a server-side error (a per-item
 * 5xx) before it's parked in syncIssues instead of retried again. Only
 * per-item verdicts count: a request that fails as a whole (offline, the
 * server down) says nothing about any one entry, so it never uses one up.
 */
export const MAX_ATTEMPTS = 3

// One drain at a time per profile: every local write kicks a push off, so
// a burst of edits (or a push racing the periodic sync) would otherwise run
// overlapping drains over the same queue rows. That's within this tab; the
// drain also holds a Web Lock (see lock.ts) against other tabs doing the same.
const pushInFlight = new Map<string, Promise<void>>()

const PUSH_CHUNK_SIZE = 200
const PUSH_TIMEOUT_MS = 30_000

const localWriteListeners = new Set<() => void>()

/** Calls `listener` after every change queued on this device — see orchestrator.ts, which follows one with a sync. Returns the unsubscribe. */
export function onLocalWrite(listener: () => void): () => void {
  localWriteListeners.add(listener)
  return () => localWriteListeners.delete(listener)
}

type BulkResult =
  /** `data`: the row as the server now has it, on an accepted upsert. */
  | { id: string; ok: true; data?: SyncRow }
  /** `reason`: see the backend's util/httpStatus.js reasonFor. */
  | { id: string; ok: false; status: number; reason: string; message?: string }

function statusOf(error: unknown): number | undefined {
  return (error as { response?: { status?: number } })?.response?.status
}

function issueFor(entry: OutboxEntry, kind: SyncIssue['kind'], reason: string, message?: string): SyncIssue {
  return {
    ownerId: entry.ownerId,
    kind,
    entity: entry.entity,
    op: entry.op,
    recordId: entry.recordId,
    ...(entry.payload ? { payload: entry.payload } : {}),
    reason,
    ...(message ? { message } : {}),
    editedAt: entry.createdAt,
    at: Date.now(),
  }
}

async function sendChunk(entity: SyncableEntity, op: OutboxEntry['op'], chunk: OutboxEntry[]): Promise<BulkResult[]> {
  const path = RESOURCE_PATH[entity]
  if (op === 'upsert') {
    const { data } = await http.post<{ items: BulkResult[] }>(
      `/${path}/bulk`,
      // editedAt: when the change was made, which is what the server settles
      // two devices' conflicting writes by — not when it happens to arrive.
      { items: chunk.map((e) => ({ ...e.payload, editedAt: e.createdAt })) },
      { timeout: PUSH_TIMEOUT_MS },
    )
    return data.items
  }
  // A POST rather than a DELETE with a body, which some proxies and CDNs drop.
  const { data } = await http.post<{ items: BulkResult[] }>(
    `/${path}/bulk-delete`,
    { items: chunk.map((e) => ({ id: e.recordId, editedAt: e.createdAt })) },
    { timeout: PUSH_TIMEOUT_MS },
  )
  return data.items
}

/**
 * Pushes one chunk through the bulk endpoint and settles its entries.
 * Returns true when the drain must stop here and retry later.
 */
async function pushChunk(entity: SyncableEntity, op: OutboxEntry['op'], chunk: OutboxEntry[]): Promise<boolean> {
  let items: BulkResult[]
  try {
    items = await sendChunk(entity, op, chunk)
  } catch (error) {
    // Too big for the server to even read: halve it until it fits, and give
    // up on a single entry that still doesn't.
    if (statusOf(error) === 413) {
      if (chunk.length > 1) {
        const half = Math.ceil(chunk.length / 2)
        return (await pushChunk(entity, op, chunk.slice(0, half))) || pushChunk(entity, op, chunk.slice(half))
      }
      await settle(entity, { settled: [chunk[0]], issues: [issueFor(chunk[0], 'failed', 'tooLarge')], refetch: [chunk[0]] })
      return false
    }
    // Otherwise not one entry in it was judged on its own merits — offline,
    // the server down, a whole-batch 4xx (auth trouble, a deactivated member)
    // — so the chunk stays queued, attempts untouched, and the next drain
    // retries it.
    console.warn(`[sync] outbox batch ${entity}/${op} (${chunk.length} entries) not delivered, will retry`, error)
    return true
  }

  // Matched by id, not position — and an entry the answer says nothing about
  // is kept queued rather than assumed delivered.
  const results = new Map(items.map((result) => [result.id, result]))
  const outcome: Outcome = { settled: [], acked: [], ackRows: [], issues: [], refetch: [], retry: [] }
  let stop = false
  for (const entry of chunk) {
    const result = results.get(entry.recordId)
    if (result?.ok) {
      outcome.settled.push(entry)
      outcome.acked!.push(entry.recordId)
      if (result.data) outcome.ackRows!.push(result.data)
    } else if (!result) {
      stop = true
    } else if (isTerminalStatus(result.status)) {
      outcome.settled.push(entry)
      outcome.issues.push(issueFor(entry, 'rejected', result.reason, result.message))
      outcome.refetch.push(entry)
    } else if ((entry.attempts ?? 0) + 1 >= MAX_ATTEMPTS) {
      outcome.settled.push(entry)
      outcome.issues.push(issueFor(entry, 'failed', 'failed', result.message))
      outcome.refetch.push(entry)
    } else {
      outcome.retry!.push(entry)
      stop = true
    }
  }
  await settle(entity, outcome)
  return stop
}

interface Outcome {
  /** Entries done with, whichever way. */
  settled: OutboxEntry[]
  /** Records the server confirmed, and the rows it confirmed them as. */
  acked?: string[]
  ackRows?: SyncRow[]
  issues: SyncIssue[]
  /** Entries given up on, whose record's local copy has to be put back to the server's — see restoreFromServer. */
  refetch: OutboxEntry[]
  /** Entries to try again later, one attempt used up. */
  retry?: OutboxEntry[]
}

/**
 * Applies a chunk's outcome in one Dexie transaction: settled entries leave
 * the queue, refused or failed ones are recorded as syncIssues, and every
 * record the server confirmed takes the server's row — the server may have
 * filled fields in (participantIds, a resolved currency), and that's the
 * version every other device now sees. A record with another write still
 * queued keeps its local copy; that write settles it.
 */
async function settle(entity: SyncableEntity, outcome: Outcome): Promise<void> {
  // Before the transaction, so a pull landing in the meantime already knows
  // to leave these records alone (see noteAcked).
  noteAcked(entity, outcome.acked ?? [])

  await db.transaction('rw', [db[entity], db.outbox, db.syncIssues], async () => {
    if (outcome.settled.length) await db.outbox.bulkDelete(outcome.settled.map((e) => e.localId!))
    for (const entry of outcome.retry ?? []) await db.outbox.update(entry.localId!, { attempts: (entry.attempts ?? 0) + 1 })
    if (outcome.issues.length) await db.syncIssues.bulkAdd(outcome.issues)
    if (outcome.ackRows?.length) {
      const pending = await pendingRecordIds(entity)
      const fresh = outcome.ackRows.filter((row) => !pending.has(row.id))
      if (fresh.length) await tableOf(entity).bulkPut(fresh)
    }
  })

  for (const issue of outcome.issues) {
    console.error(`[sync] ${issue.kind} ${entity}/${issue.op} ${issue.recordId}: ${issue.reason}`, issue.message ?? '')
  }
  if (outcome.refetch.length) await restoreFromServer(entity, outcome.refetch)
}

/**
 * The local copy still holds the changes the server didn't take — brings it
 * back in line with the server's (see refetchRecords): each entry's own
 * record, and for a delete, the rows it took along locally (see
 * OutboxEntry.cascade), which the server still has since the delete never
 * happened there. Parents first, so an account is back before its
 * transactions are. Best-effort: whatever fails stays as it is locally until
 * the next resync.
 */
async function restoreFromServer(entity: SyncableEntity, entries: OutboxEntry[]): Promise<void> {
  const byEntity = new Map<SyncableEntity, Set<string>>([[entity, new Set(entries.map((e) => e.recordId))]])
  for (const entry of entries) {
    for (const [child, ids] of Object.entries(entry.cascade ?? {}) as [SyncableEntity, string[]][]) {
      if (!byEntity.has(child)) byEntity.set(child, new Set())
      for (const id of ids) byEntity.get(child)!.add(id)
    }
  }
  for (const [target, ids] of byEntity) {
    await refetchRecords(target, [...ids]).catch((error) => console.error(`[sync] re-reading ${target} records failed`, error))
  }
}

/**
 * Drains this profile's queue, oldest first. Only ever pushes entries owned by
 * `currentUserId`: a device shared between two family members can hold another
 * profile's unsent writes, and those can only go out under that profile's own
 * token (see stores/server.ts's PendingOutboxError, which is what warns before
 * anything would discard them).
 *
 * Order is preserved strictly — an upsert of a record and its later delete
 * must not swap places — so a chunk that fails for a retryable reason stops the
 * whole drain rather than skipping ahead. Consecutive entries sharing an
 * entity+op are batched into one bulk request (see the backend's
 * sync/router.js); the run-length grouping below is what keeps that batching
 * from reordering anything.
 *
 * The queue is read only once this tab holds the drain's lock, so a drain
 * that had to wait for another tab's sees just what that one left behind —
 * never the same entries a second time.
 */
export async function pushOutbox(currentUserId: string | null): Promise<void> {
  if (!currentUserId || !navigator.onLine || !hasConfiguredServer()) return
  const existing = pushInFlight.get(currentUserId)
  if (existing) return existing

  const promise = withTabLock(`stork:outbox:${currentUserId}`, async () => {
    const entries = await db.outbox.where('ownerId').equals(currentUserId).sortBy('localId')

    let i = 0
    while (i < entries.length) {
      const { entity, op } = entries[i]
      let j = i + 1
      while (j < entries.length && entries[j].entity === entity && entries[j].op === op) j++
      const run = entries.slice(i, j)
      i = j

      for (let start = 0; start < run.length; start += PUSH_CHUNK_SIZE) {
        const stop = await pushChunk(entity, op, run.slice(start, start + PUSH_CHUNK_SIZE))
        if (stop) return
      }
    }
  })

  pushInFlight.set(currentUserId, promise)
  try {
    await promise
  } finally {
    pushInFlight.delete(currentUserId)
  }
}

function afterQueued(ownerId: string): void {
  void pushOutbox(ownerId)
  for (const listener of localWriteListeners) listener()
}

/**
 * Writes records to their local table AND queues them for the server, in one
 * Dexie transaction — so a tab closed (or a crash) in between can't leave a
 * change that exists on this device but will never be sent, nor a queued
 * change the device itself doesn't show. `ownerId` null (local mode, nobody
 * signed in), or no server configured: the local write only.
 *
 * Stamped with the server's clock (see clock.ts), not this device's: the
 * stamp is what the server compares against other devices' edits.
 */
export async function putAndQueue<T extends SyncRow>(entity: SyncableEntity, ownerId: string | null, records: T[]): Promise<void> {
  if (!records.length) return
  const queue = Boolean(ownerId) && hasConfiguredServer()
  const now = serverNow()
  await db.transaction('rw', db[entity], db.outbox, async () => {
    await tableOf(entity).bulkPut(records)
    if (queue) {
      await db.outbox.bulkAdd(
        records.map((record) => ({
          entity,
          op: 'upsert' as const,
          recordId: record.id,
          payload: record as unknown as Record<string, unknown>,
          ownerId: ownerId!,
          createdAt: now,
        })),
      )
    }
  })
  if (queue) afterQueued(ownerId!)
}

/**
 * Removes records locally AND queues their deletion, in one Dexie transaction
 * — see putAndQueue. The rows the server's delete cascades to (see
 * registry.ts's DELETE_CASCADES — an account's recurring templates) go in the same
 * step, but aren't queued themselves: the server removes them together with
 * their parent or not at all, so a refused delete can't leave half of it
 * applied there. Each delete entry remembers what it took along, so the
 * outbox can bring that back if the server refuses it (see settle). Stamped
 * with the server's clock, like putAndQueue.
 */
export async function deleteAndQueue(entity: SyncableEntity, ownerId: string | null, ids: string[]): Promise<void> {
  if (!ids.length) return
  const queue = Boolean(ownerId) && hasConfiguredServer()
  const now = serverNow()
  const cascades = DELETE_CASCADES[entity] ?? []
  await db.transaction('rw', [db[entity], db.outbox, ...cascades.map((c) => db[c.entity])], async () => {
    const cascaded = await removeCascaded(cascades, ids, ownerId)
    await tableOf(entity).bulkDelete(ids)
    if (queue) {
      await db.outbox.bulkAdd(
        ids.map((recordId) => ({
          entity,
          op: 'delete' as const,
          recordId,
          ownerId: ownerId!,
          createdAt: now,
          ...(cascaded.has(recordId) ? { cascade: cascaded.get(recordId) } : {}),
        })),
      )
    }
  })
  if (queue) afterQueued(ownerId!)
}

/**
 * Removes every row `cascades` takes along with the records `ids`, and says
 * which went with which — a transfer between two deleted accounts is listed
 * under both, so it comes back if either delete is refused.
 */
async function removeCascaded(
  cascades: DeleteCascade[],
  ids: string[],
  ownerId: string | null,
): Promise<Map<string, Partial<Record<SyncableEntity, string[]>>>> {
  const parents = new Set(ids)
  const byParent = new Map<string, Partial<Record<SyncableEntity, string[]>>>()
  for (const { entity, via, ownOnly } of cascades) {
    const table = db.table<Record<string, unknown>, string>(entity)
    // Through the indexes where the table has them (transactions does), a scan otherwise (templates are few).
    const candidates = via.every((field) => table.schema.idxByName[field])
      ? (await Promise.all(via.map((field) => table.where(field).anyOf(ids).toArray()))).flat()
      : await table.filter((row) => via.some((field) => parents.has(row[field] as string))).toArray()
    const rows = new Map(candidates.filter((row) => !ownOnly || row.ownerId === ownerId).map((row) => [row.id as string, row]))
    for (const [id, row] of rows) {
      for (const parent of new Set(via.map((field) => row[field] as string))) {
        if (!parents.has(parent)) continue
        const taken = byParent.get(parent) ?? {}
        ;(taken[entity] ??= []).push(id)
        byParent.set(parent, taken)
      }
    }
    await table.bulkDelete([...rows.keys()])
  }
  return byParent
}
