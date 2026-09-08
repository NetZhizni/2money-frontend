import { ref } from 'vue'
import { useServerStore, PendingOutboxError } from '../stores/server'
import { usePopupsStore } from '../stores/popups'
import { describeRemoteConfigError } from '../config/serverConfig'
import { pluralize } from '../utils/format'
import { t } from '../i18n'

type SwitchTarget = { toMode: 'local' } | { toMode: 'remote'; url: string }

/** `t('sync.pendingRecords.*')`, pluralized for `count` — shared by both halves of describePendingOutbox() below. */
function pendingRecordsLabel(count: number): string {
  return pluralize(count, {
    one: t('sync.pendingRecords.one'),
    few: t('sync.pendingRecords.few'),
    many: t('sync.pendingRecords.many'),
    other: t('sync.pendingRecords.other'),
  })
}

/**
 * Builds the confirm-dialog message for a PendingOutboxError — up to two
 * sentences, one per count that's actually nonzero (a device can hit both at
 * once: offline right now AND has another profile's queued edits).
 */
function describePendingOutbox(cause: PendingOutboxError): string {
  const parts: string[] = []
  if (cause.ownCount > 0) {
    parts.push(t('server.pendingOutboxOwn', { count: cause.ownCount, label: pendingRecordsLabel(cause.ownCount) }))
  }
  if (cause.foreignCount > 0) {
    parts.push(t('server.pendingOutboxForeign', { count: cause.foreignCount, label: pendingRecordsLabel(cause.foreignCount) }))
  }
  return parts.join(' ')
}

/**
 * "Change this device's server" — shared by SettingsModal.vue's "Server"
 * section (signed in) and LoginView.vue's "not this server?" link (signed
 * out, see its own doc comment for why that one exists too). Each caller
 * gets its own independent state (this is a plain composable, not a Pinia
 * store) since the two are never shown at once, but the confirm-and-wipe
 * logic — the actually risky part — lives in exactly one place.
 */
export function useChangeServer() {
  const server = useServerStore()
  const popups = usePopupsStore()

  const showField = ref(false)
  const newUrl = ref('')
  const switching = ref(false)
  const error = ref('')

  function open() {
    showField.value = true
  }

  function cancel() {
    showField.value = false
    newUrl.value = ''
    error.value = ''
  }

  /**
   * Runs switchTo(), shared by confirmChange()/confirmGoLocal() below —
   * switchTo() reloads the page on success (see its doc comment), so the
   * catch path here is the only one that leaves this composable's state
   * worth updating. `PendingOutboxError` (see stores/server.ts) gets its own
   * second confirm instead of just being reported like any other failure:
   * it means either this profile's own edits couldn't actually reach the
   * server just now (offline?) and/or another profile's on a shared device
   * still has edits nobody's had a chance to send — silently discarding
   * either (or silently keeping them by refusing outright) is wrong. The
   * user needs to see exactly what's at risk and explicitly choose to
   * proceed anyway, which re-runs this with `force: true`.
   */
  async function attemptSwitch(target: SwitchTarget, force = false): Promise<void> {
    switching.value = true
    error.value = ''
    try {
      await server.switchTo(target, { force })
    } catch (cause) {
      switching.value = false
      if (cause instanceof PendingOutboxError) {
        popups.confirmDialog({
          title: t('server.pendingOutboxTitle'),
          message: describePendingOutbox(cause),
          confirmLabel: t('server.pendingOutboxButton'),
          danger: true,
          onConfirm: () => attemptSwitch(target, true),
        })
        return
      }
      error.value = t(describeRemoteConfigError(cause))
      popups.closeConfirm()
    }
  }

  function confirmChange() {
    const url = newUrl.value.trim()
    if (!url) return
    popups.confirmDialog({
      title: t('server.switchConfirmTitle'),
      message: t('server.switchConfirmMessage'),
      confirmLabel: t('server.switchConfirmButton'),
      danger: true,
      onConfirm: () => attemptSwitch({ toMode: 'remote', url }),
    })
  }

  function confirmGoLocal() {
    popups.confirmDialog({
      title: t('server.goLocalConfirmTitle'),
      message: t('server.goLocalConfirmMessage'),
      confirmLabel: t('server.goLocalConfirmButton'),
      danger: true,
      onConfirm: () => attemptSwitch({ toMode: 'local' }),
    })
  }

  return { showField, newUrl, switching, error, open, cancel, confirmChange, confirmGoLocal }
}
