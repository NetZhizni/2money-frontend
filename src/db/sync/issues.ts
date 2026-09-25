import { db, type SyncIssue } from '../schema'
import { deleteAndQueue, putAndQueue } from './outbox'
import type { SyncRow } from './registry'

/**
 * Whether sending a change the server didn't take once more can come out any
 * differently:
 *   - 'failed' — it never got a verdict (the server kept erroring, or a
 *     resync wiped it before it was sent), so yes;
 *   - rejected as 'stale' — someone changed the record later, and re-sending
 *     is the user deciding their version should win after all (it goes out
 *     as a new edit, so it's now the latest);
 *   - rejected as 'reference' — it points at a record the server didn't have
 *     yet, usually one whose own write failed first; once that one is sent
 *     again (it's listed too), this can go through;
 *   - any other rejection (deleted, filed under something deleted, not
 *     theirs, the currency lock, deleting something that still has
 *     operations, bad data) would only be refused again.
 */
export function canRetry(issue: SyncIssue): boolean {
  if (issue.kind === 'failed') return issue.op === 'delete' || Boolean(issue.payload)
  return issue.reason === 'stale' || (issue.reason === 'reference' && Boolean(issue.payload))
}

/** Re-applies the change locally as if it had just been made, queues it again, and drops the issue. */
export async function retryIssue(issue: SyncIssue): Promise<void> {
  if (!canRetry(issue)) return
  if (issue.op === 'delete') await deleteAndQueue(issue.entity, issue.ownerId, [issue.recordId])
  else await putAndQueue(issue.entity, issue.ownerId, [issue.payload as unknown as SyncRow])
  await db.syncIssues.delete(issue.id!)
}

export async function dismissIssue(id: number): Promise<void> {
  await db.syncIssues.delete(id)
}

export async function dismissAllIssues(ownerId: string): Promise<void> {
  await db.syncIssues.where('ownerId').equals(ownerId).delete()
}

/** How long an issue nobody dealt with stays listed, and how many are kept at most — see pruneIssues. */
export const ISSUE_TTL_MS = 30 * 86_400_000
export const MAX_ISSUES = 200

/**
 * Drops this profile's issues older than ISSUE_TTL_MS, and any past the
 * newest MAX_ISSUES. Each has long had its toast (see stores/syncIssues.ts);
 * without this the list only ever grows for someone who never dismisses.
 * Run once per session, when sync starts (see orchestrator.ts).
 */
export async function pruneIssues(ownerId: string, now = Date.now()): Promise<void> {
  const newestFirst = await db.syncIssues.where('ownerId').equals(ownerId).reverse().sortBy('at')
  const expired = newestFirst.filter((issue, index) => index >= MAX_ISSUES || now - issue.at > ISSUE_TTL_MS)
  if (expired.length) await db.syncIssues.bulkDelete(expired.map((issue) => issue.id!))
}
