import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  describeRemoteConfigError,
  fetchRemoteConfig,
  getCachedRemoteConfig,
  getPersistedLocalMode,
  getPersistedServerUrl,
  normalizeServerUrl,
  persistCachedRemoteConfig,
  persistLocalMode,
  persistServerUrl,
  type RemoteConfig,
} from '../config/serverConfig'
import { initFirebaseApp } from '../firebase'
import { db } from '../db/schema'
import { pushOutbox } from '../db/sync'
import { exportData, downloadBackup } from '../db/backup'
import { useAuthStore } from './auth'

export type ServerMode = 'unconfigured' | 'local' | 'remote'

/**
 * Thrown by switchTo() when the outbox still holds entries that are about to
 * be silently discarded by the wipe — either because they belong to a
 * DIFFERENT profile than the one currently signed in (`foreignCount`, see
 * pushOutbox's own doc comment for why it can't act on those), or because
 * they're this profile's OWN entries and the best-effort push right before
 * this check couldn't actually deliver them — typically because the device
 * is offline right now, in which case pushOutbox no-ops instantly rather
 * than failing loudly (`ownCount`). Callers (useChangeServer.ts) catch this,
 * tell the user exactly what's about to be lost and why, and retry with
 * `{ force: true }` only once they've explicitly accepted that.
 */
export class PendingOutboxError extends Error {
  ownCount: number
  foreignCount: number
  constructor(ownCount: number, foreignCount: number) {
    super(
      `${ownCount} of this profile's own outbox entries never reached the server, and ${foreignCount} belong to another profile on this device — both would be discarded`,
    )
    this.name = 'PendingOutboxError'
    this.ownCount = ownCount
    this.foreignCount = foreignCount
  }
}

/**
 * Which server (if any) this device talks to, and what it needs to reach
 * it — the one piece of state App.vue's top-level bootstrap branches on
 * (see its `mode` usage) before anything Firebase/auth-related can happen.
 * See src/config/serverConfig.ts for the underlying persistence + fetch,
 * and views/ServerSetupView.vue / SettingsModal.vue's "Server" section for
 * the UI that drives this.
 */
export const useServerStore = defineStore('server', () => {
  const mode = ref<ServerMode>('unconfigured')
  const serverUrl = ref<string | null>(null)
  const remoteConfig = ref<RemoteConfig | null>(null)
  /** True only while App.vue's very first boot decision is still pending — see init(). */
  const initializing = ref(true)
  const connecting = ref(false)
  const connectError = ref<string | null>(null)

  /**
   * Runs once, at app boot (called from App.vue). Resumes whatever this
   * device was last configured as. A previously-connected server boots
   * from the CACHED config first (works fully offline, see
   * getCachedRemoteConfig) and only refreshes it in the background —
   * never blocks the boot splash on a network round trip for a device
   * that's already set up.
   */
  async function init(): Promise<void> {
    const authStore = useAuthStore()
    const persistedUrl = getPersistedServerUrl()

    if (persistedUrl) {
      const cached = getCachedRemoteConfig()
      if (cached) {
        try {
          await bootRemote(persistedUrl, cached)
          void refreshInBackground(persistedUrl)
          initializing.value = false
          return
        } catch (error) {
          // A cached config firebase/app itself rejects (corrupt storage, an
          // app update that changed what's expected here) — fall through to
          // fetching a fresh one below instead of getting stuck on the boot
          // splash forever.
          console.warn('[server] cached remote config failed to boot, re-fetching', error)
        }
      }
      // Either no cache yet (storage was partially cleared, or the very
      // first connect() never finished), or the cache above didn't work —
      // there's nothing usable to boot Firebase with, so this must fetch.
      try {
        const config = await fetchRemoteConfig(persistedUrl)
        persistCachedRemoteConfig(config)
        await bootRemote(persistedUrl, config)
      } catch {
        // Offline (or the server is genuinely gone) on a device that never
        // finished setup — nothing usable to show; fall through to
        // ServerSetupView rather than getting stuck on a splash screen.
        mode.value = 'unconfigured'
      }
      initializing.value = false
      return
    }

    if (getPersistedLocalMode()) {
      mode.value = 'local'
      authStore.startLocalMode()
      initializing.value = false
      return
    }

    mode.value = 'unconfigured'
    initializing.value = false
  }

  async function bootRemote(url: string, config: RemoteConfig): Promise<void> {
    serverUrl.value = url
    remoteConfig.value = config
    mode.value = 'remote'
    await initFirebaseApp(config.firebase)
    useAuthStore().startRemoteAuth()
  }

  /** Best-effort — a stale cached config (Firebase project rotated, receiptScanning toggled) self-heals next time this device is online, without ever blocking boot on it. */
  async function refreshInBackground(url: string): Promise<void> {
    try {
      const fresh = await fetchRemoteConfig(url)
      persistCachedRemoteConfig(fresh)
      remoteConfig.value = fresh
    } catch {
      // unreachable right now — keep using the cached config already booted with
    }
  }

  /**
   * First-time setup from ServerSetupView — normally there's no existing
   * server-tied data on this device yet, so unlike switchTo() below this
   * doesn't need to push/back up anything first. It DOES still guard against
   * wiping being skipped when it shouldn't be: `mode === 'unconfigured'` (the
   * only state that renders ServerSetupView) isn't only reached by a truly
   * fresh device — init() also falls back to it when a PREVIOUSLY connected
   * device can't boot (offline + no/broken cached config, see init()'s catch
   * below), while leaving that previous server's synced rows sitting
   * untouched in Dexie. Connecting from there — to the same server or a
   * different one — must not let those linger: `hasLeftoverLocalData()`
   * catches exactly that and wipes first, same as switchTo(), rather than
   * silently merging a new server's data on top of an old one's (dangling
   * `syncCursors` alone would be enough to make the very first pull from a
   * genuinely different server come back empty — see its doc comment).
   * Still reloads once connected either way (see switchTo's doc comment for
   * why: src/api/http.ts's baseURL is read once at module-eval time, and a
   * reload is the simplest way to make sure every module that read it
   * re-evaluates against the newly-persisted URL).
   */
  async function connect(rawUrl: string): Promise<void> {
    connecting.value = true
    connectError.value = null
    try {
      const normalized = normalizeServerUrl(rawUrl)
      const config = await fetchRemoteConfig(normalized)
      if (await hasLeftoverLocalData()) await wipeLocalState()
      persistServerUrl(normalized)
      persistCachedRemoteConfig(config)
      persistLocalMode(false)
      location.reload()
    } catch (error) {
      connectError.value = describeRemoteConfigError(error)
      connecting.value = false
      throw error
    }
  }

  /**
   * First-time "skip the server, work offline only" from ServerSetupView —
   * normally nothing to lose yet, so no wipe needed, just start the local
   * profile in place with no reload. Same caveat as connect() above though:
   * if this device actually has a previous server's data left over (see its
   * doc comment), that must be wiped first rather than silently handed to
   * what the user believes is a brand-new local profile — categories
   * especially, since they're an unfiltered, family-wide table (see
   * db/sync.ts) that would otherwise show up unchanged under the new "local"
   * identity. Only reloads in that (rare) branch, to fully re-derive every
   * singleton against the now-empty DB — the common, truly-fresh-device path
   * stays instant, no reload flash.
   */
  async function goLocalFirstTime(): Promise<void> {
    if (await hasLeftoverLocalData()) {
      await wipeLocalState()
      persistServerUrl(null)
      persistLocalMode(true)
      location.reload()
      return
    }
    persistServerUrl(null)
    persistLocalMode(true)
    mode.value = 'local'
    useAuthStore().startLocalMode()
    initializing.value = false
  }

  /**
   * Switching this device's identity while it already has data tied to the
   * current one — a different server (see SettingsModal's "Change server"),
   * local mode, or moving a local-only device onto a server for the first
   * time. Always destructive: a different server means a different
   * Postgres `users` table (backend/src/middleware/auth.js) and usually a
   * different Firebase project entirely, so there is no meaningful
   * "reconcile" here, only "start over as if this were a new device" — see
   * SettingsModal.vue's confirmChangeServer/confirmGoLocal for exactly
   * what the user is told before this runs. Callers MUST confirm with the
   * user first — this itself never asks.
   *
   * Two extra safety nets beyond the wipe itself:
   *  - `PendingOutboxError` (thrown, never silently swallowed) if the
   *    best-effort push right below couldn't actually clear the outbox —
   *    this profile's own entries (device is offline/server unreachable
   *    right now) and/or another profile's on a shared device — see the
   *    error class's own doc comment. Pass `force: true` only once the
   *    caller has told the user exactly what that would discard and
   *    they've accepted it anyway.
   *  - `autoBackupBeforeWipe` downloads a JSON snapshot of whatever this
   *    profile can still export, so forgetting the manual "Export JSON"
   *    step the confirm dialog recommends doesn't mean losing everything.
   */
  async function switchTo(
    target: { toMode: 'local' } | { toMode: 'remote'; url: string },
    opts?: { force?: boolean },
  ): Promise<void> {
    const authStore = useAuthStore()
    const wasRemote = mode.value === 'remote'

    // Best-effort: give any still-queued offline edit one last chance to
    // reach the server we're about to disconnect from, rather than
    // silently discarding it in the wipe below. Only ever covers the
    // CURRENTLY signed-in profile's own queue (pushOutbox can't act under
    // anyone else's token) — see the pending-outbox check right after for
    // why that matters, and for what happens when this can't actually
    // deliver anything (offline right now: pushOutbox returns instantly,
    // without throwing, leaving the queue exactly as full as before).
    if (wasRemote && authStore.uid) {
      try {
        await pushOutbox(authStore.uid)
      } catch {
        // Unexpected failure mid-push (pushOutbox itself is normally
        // resilient) — the pending-outbox check right after still catches
        // whatever's left queued either way.
      }
    }

    // Validate the new server BEFORE destroying anything — a typo'd URL
    // must not cost this device its current data.
    let normalizedUrl: string | null = null
    let newConfig: RemoteConfig | null = null
    if (target.toMode === 'remote') {
      normalizedUrl = normalizeServerUrl(target.url)
      newConfig = await fetchRemoteConfig(normalizedUrl)
    }

    if (!opts?.force) {
      // Only meaningful in remote mode: a local profile's own outbox
      // entries never had a server to reach in the first place (see
      // goLocalFirstTime's doc comment) — that's expected and already
      // covered by autoBackupBeforeWipe below, not a "push silently
      // failed" situation worth a second confirmation over.
      const ownPending = wasRemote && authStore.uid ? await db.outbox.where('ownerId').equals(authStore.uid).count() : 0
      const foreignPending = await countForeignOutbox(authStore.uid)
      if (ownPending > 0 || foreignPending > 0) {
        throw new PendingOutboxError(ownPending, foreignPending)
      }
    }

    await autoBackupBeforeWipe(authStore.uid)
    await wipeLocalState()

    if (target.toMode === 'remote') {
      persistServerUrl(normalizedUrl!)
      persistCachedRemoteConfig(newConfig!)
      persistLocalMode(false)
    } else {
      persistServerUrl(null)
      persistLocalMode(true)
    }

    // A full reload — rather than tearing down the live Firebase app /
    // Pinia stores / sync listeners in place — is deliberate, same
    // reasoning as src/i18n/locale.ts's setLocaleSetting: re-deriving
    // every singleton from scratch on a fresh load is far simpler and
    // safer than hot-swapping a running session onto a different
    // backend/Firebase project.
    location.reload()
  }

  return {
    mode,
    serverUrl,
    remoteConfig,
    initializing,
    connecting,
    connectError,
    init,
    connect,
    goLocalFirstTime,
    switchTo,
  }
})

async function wipeLocalState(): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((table) => table.clear()))
  })
  try {
    // Device-local caches keyed to the PREVIOUS server's identity — a
    // stale cached profile/timestamp here would otherwise briefly flash
    // wrong data (or a wrong "last synced" time) after the reload, before
    // the new session even signs in. Per-device UI preferences (locale,
    // number/date format, theme) are deliberately left alone — those
    // aren't tied to any server/account.
    localStorage.removeItem('2money:profile')
    localStorage.removeItem('2money:lastSyncedAt')
  } catch {
    // Storage unavailable — the reload below still resets every in-memory singleton either way.
  }
}

/**
 * Whether Dexie already holds rows from a previous session — checked by
 * connect()/goLocalFirstTime() before treating this device as genuinely
 * fresh (see their doc comments for the boot-failure path that makes that
 * assumption unsafe). Looks across every table wipeLocalState() would clear,
 * for the same reason wipeLocalState() itself doesn't pick and choose: any
 * one of them (a stale `syncCursors` row especially) is enough to corrupt
 * the very first sync against whatever server/mode comes next.
 */
async function hasLeftoverLocalData(): Promise<boolean> {
  const counts = await Promise.all(db.tables.map((table) => table.count()))
  return counts.some((count) => count > 0)
}

/**
 * Outbox entries queued under a DIFFERENT profile than `currentUid` — see
 * PendingOutboxError's doc comment for why switchTo() treats this as a hard
 * stop rather than something pushOutbox can clean up on its own.
 * `currentUid == null` (shouldn't happen in practice — switchTo is only ever
 * reachable once signed in) is treated as "everything is foreign" so nothing
 * queued gets discarded unnoticed.
 */
async function countForeignOutbox(currentUid: string | null): Promise<number> {
  if (!currentUid) return db.outbox.count()
  return db.outbox.where('ownerId').notEqual(currentUid).count()
}

/**
 * Last-resort safety net for switchTo()'s wipe: downloads a JSON snapshot of
 * whatever exportData() can still read for the current profile (own
 * accounts/transactions/budgets/templates, plus the family's shared
 * categories — see db/backup.ts's own doc comment on exactly what's
 * included/excluded) — the same file the "Export JSON" button in Settings
 * produces, just triggered automatically instead of relying on the user to
 * click it before confirming a destructive switch. Best-effort only: must
 * never block or fail the switch itself (no profile yet, download blocked,
 * storage/quota issues, …) — the confirm dialog's own advice to back up
 * manually still stands as the fallback either way.
 */
async function autoBackupBeforeWipe(currentUid: string | null): Promise<void> {
  if (!currentUid) return
  try {
    const payload = await exportData()
    downloadBackup(payload)
  } catch (error) {
    console.warn('[server] automatic pre-switch backup failed, proceeding without one', error)
  }
}
