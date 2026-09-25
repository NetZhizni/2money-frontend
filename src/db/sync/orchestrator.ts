import { db, type SyncIssue } from '../schema'
import { backendOnline, markSynced } from '../syncStatus'
import { hasConfiguredServer } from '../../config/serverConfig'
import { t } from '../../i18n'
import { pruneIssues } from './issues'
import { onLocalWrite, pushOutbox } from './outbox'
import { pullMany, clearPullCache } from './pull'
import { SYNC_ENTITIES } from './registry'

// The family directory hardly ever changes (someone joins, or is renamed), so
// the idle timer asks for it only this often — see fullSync's `usersIfDue`.
export const USERS_REFRESH_MS = 5 * 60_000
let usersPulledAt = 0

/**
 * One full round trip: push everything queued locally, then pull every
 * entity's delta and the family directory (one request per page — see
 * pullMany). Push first — otherwise a pull could overwrite a local edit that
 * hasn't reached the server yet with the server's older copy of it.
 *
 * With `usersIfDue` (the periodic timer), the directory is only asked for
 * when the last copy is older than USERS_REFRESH_MS; every other sync — the
 * app coming back into view, a manual one — always asks.
 *
 * "Last synced" (see db/syncStatus.ts) only advances when every entity pulled
 * cleanly, so a partial success isn't reported to the user as a good sync.
 * `changed` says whether anything came down — see startAutoSync.
 */
export async function fullSync(currentUserId: string | null, { usersIfDue = false } = {}): Promise<{ changed: boolean }> {
  if (!currentUserId || !navigator.onLine || !hasConfiguredServer()) return { changed: false }
  await pushOutbox(currentUserId)
  const users = !usersIfDue || Date.now() - usersPulledAt >= USERS_REFRESH_MS
  const { ok, usersOk, changed } = await pullMany(SYNC_ENTITIES, { scope: 'all' }, 'sync', { users })
  if (users && usersOk) usersPulledAt = Date.now()
  if (ok.every(Boolean)) markSynced()
  return { changed }
}

/**
 * The user-triggered "something's wrong with my local copy" escape hatch (see
 * SyncStatusBadge.vue): drop every synced table and cursor, then re-pull from
 * scratch. It tries one last push first; anything that still couldn't be
 * delivered is moved into db.syncIssues rather than thrown away with the rest
 * of the local state — the user sees it listed and can send it again once the
 * reload is done.
 *
 * Only this profile's outbox rows are touched; another profile signed in on
 * the same device keeps its own unsent writes.
 */
export async function resyncFromServer(currentUserId: string | null): Promise<void> {
  if (!currentUserId) throw new Error(t('sync.notAuthenticated'))
  if (!backendOnline.value) throw new Error(t('sync.noServerConnection'))

  await pushOutbox(currentUserId)

  await db.transaction(
    'rw',
    [db.accounts, db.categories, db.tags, db.transactions, db.recurringTemplates, db.budgets, db.receipts, db.syncCursors, db.users, db.outbox, db.syncIssues],
    async () => {
      const unsent = await db.outbox.where('ownerId').equals(currentUserId).toArray()
      if (unsent.length) {
        const now = Date.now()
        await db.syncIssues.bulkAdd(
          unsent.map(
            (entry): SyncIssue => ({
              ownerId: entry.ownerId,
              kind: 'failed',
              entity: entry.entity,
              op: entry.op,
              recordId: entry.recordId,
              ...(entry.payload ? { payload: entry.payload } : {}),
              reason: 'discarded',
              editedAt: entry.createdAt,
              at: now,
            }),
          ),
        )
      }
      await Promise.all([
        db.accounts.clear(),
        db.categories.clear(),
        db.tags.clear(),
        db.transactions.clear(),
        db.recurringTemplates.clear(),
        db.budgets.clear(),
        db.receipts.clear(),
        db.syncCursors.clear(),
        db.users.clear(),
        db.outbox.where('ownerId').equals(currentUserId).delete(),
      ])
    },
  )

  clearPullCache()

  const { ok, usersOk } = await pullMany(SYNC_ENTITIES, { scope: 'all' }, 'resync', { users: true })
  if (usersOk && ok.every(Boolean)) markSynced()
  else throw new Error(t('sync.partialLoadFailure'))
}

// The periodic sync is what stands in for push notifications: another family
// member's change shows up here within one interval while the app is on
// screen. Short while anything is going on; backing off towards the longer
// one while nothing is, so an open-but-idle tab isn't a steady stream of
// requests — which on a serverless database is also what would keep it from
// ever scaling down. A tick that finds nothing new costs the server two small
// queries whatever the entity count (see the backend's engine.changes), and
// the family directory only rides along every USERS_REFRESH_MS.
export const MIN_SYNC_INTERVAL_MS = 15_000
export const MAX_SYNC_INTERVAL_MS = 60_000

/**
 * How soon a full sync follows a change made on this device. The push itself
 * leaves at once (see outbox.ts); this is the pull after it, so someone using
 * the app sees the family's latest right away instead of whenever the
 * backed-off timer comes round. Long enough that a burst of edits (a scanned
 * receipt's several operations) is one sync, not one each.
 */
export const AFTER_WRITE_SYNC_MS = 2_000

/** The wait before the next periodic sync: back to the shortest after any activity, otherwise double the last one, up to the longest. */
export function nextSyncDelay(previous: number, active: boolean): number {
  return active ? MIN_SYNC_INTERVAL_MS : Math.min(previous * 2, MAX_SYNC_INTERVAL_MS)
}

/**
 * Keeps this device in step with the family while it's in use, started once a
 * profile is signed in (see stores/auth.ts) and stopped when it isn't. Four
 * triggers, all cheap because pulls coalesce and pushes dedupe: coming back to
 * the app, regaining connectivity, a change made here (AFTER_WRITE_SYNC_MS
 * later), and a timer — but the timer only while the app is actually visible.
 * A backgrounded tab makes no periodic requests at all; it catches up the
 * moment it's shown again.
 *
 * "Activity", for pacing the timer (see nextSyncDelay), is either direction:
 * rows came down on the last sync, or this device queued a change since the
 * one before.
 *
 * Returns its own teardown — sign-out and profile switches must not leave a
 * previous session's timer running against the new one's data. All of its
 * state lives in this call, so two sessions can never share (or orphan) a
 * timer.
 */
export function startAutoSync(getUserId: () => string | null): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  let timerDueAt = 0
  let delay = MIN_SYNC_INTERVAL_MS
  let wroteSinceLastRun = false
  let stopped = false

  // Never pushes an already-scheduled sync further out: a change made just
  // before the periodic tick doesn't postpone that tick.
  const schedule = (ms: number) => {
    if (stopped) return
    const dueAt = Date.now() + ms
    if (timer && timerDueAt <= dueAt) return
    if (timer) clearTimeout(timer)
    timerDueAt = dueAt
    timer = setTimeout(() => void run(false), ms)
  }

  const run = async (force: boolean) => {
    // A run that didn't come from the timer (runNow) replaces whatever the
    // timer had pending — forgetting it instead would leave it to fire later
    // as a second, parallel chain of syncs.
    if (timer) clearTimeout(timer)
    timer = null
    if (stopped) return
    // Hidden: stay idle until visibilitychange brings it back.
    if (!force && document.visibilityState !== 'visible') return
    const wroteSince = wroteSinceLastRun
    wroteSinceLastRun = false
    let changed = false
    try {
      ;({ changed } = await fullSync(getUserId(), { usersIfDue: !force }))
    } catch (error) {
      console.error('[sync] periodic sync failed', error)
    }
    delay = nextSyncDelay(delay, changed || wroteSince)
    schedule(delay)
  }

  const runNow = () => {
    delay = MIN_SYNC_INTERVAL_MS
    void run(true)
  }
  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') runNow()
  }
  const stopWatchingWrites = onLocalWrite(() => {
    wroteSinceLastRun = true
    schedule(AFTER_WRITE_SYNC_MS)
  })

  window.addEventListener('online', runNow)
  document.addEventListener('visibilitychange', onVisibilityChange)
  const uid = getUserId()
  if (uid) void pruneIssues(uid).catch((error) => console.error('[sync] pruning old sync issues failed', error))
  runNow()

  return () => {
    stopped = true
    if (timer) clearTimeout(timer)
    timer = null
    stopWatchingWrites()
    window.removeEventListener('online', runNow)
    document.removeEventListener('visibilitychange', onVisibilityChange)
  }
}
