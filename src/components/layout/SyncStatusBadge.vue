<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import MdiIcon from '../common/MdiIcon.vue'
import Modal from '../common/Modal.vue'
import { backendOnline, lastSyncedAt, pendingCount } from '../../db/syncStatus'
import { canRetry, dismissAllIssues, dismissIssue, resyncFromServer, retryIssue, toLocalTime } from '../../db/sync'
import type { SyncIssue } from '../../db/schema'
import { useAuthStore } from '../../stores/auth'
import { usePopupsStore } from '../../stores/popups'
import { useSyncIssuesStore } from '../../stores/syncIssues'
import { formatMoney, relativeTime, pluralize } from '../../utils/format'
import { t, type MessageKey } from '../../i18n'

const authStore = useAuthStore()
const popups = usePopupsStore()
const syncIssues = useSyncIssuesStore()

// Local mode (see stores/server.ts) has no server to be reachable/unreachable
// from and no outbox that will ever drain — this badge's entire premise
// doesn't apply, so it renders nothing rather than a permanently-offline icon.

// Ticks while the badge is on screen so "N min ago" doesn't go stale without a re-render.
const now = ref(Date.now())
let tickHandle: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  tickHandle = setInterval(() => {
    now.value = Date.now()
  }, 15_000)
})
onUnmounted(() => {
  if (tickHandle) clearInterval(tickHandle)
})

const lastSyncedLabel = computed(() =>
  lastSyncedAt.value === null ? t('sync.notSyncedYet') : t('sync.syncedAgo', { time: relativeTime(lastSyncedAt.value, now.value) }),
)

const pendingLabel = computed(() => {
  const n = pendingCount.value
  const word = pluralize(n, {
    one: t('sync.pendingRecords.one'),
    few: t('sync.pendingRecords.few'),
    many: t('sync.pendingRecords.many'),
    other: t('sync.pendingRecords.other'),
  })
  return `${n} ${word}`
})

// Changes the server didn't take (see stores/syncIssues.ts) — they outrank
// "online"/"offline" on the icon, since they need the user to look.
const hasIssues = computed(() => syncIssues.issues.length > 0)

// Server reason codes (see the backend's util/httpStatus.js reasonFor) plus
// the outbox's own — anything else falls back to the server's message.
const KNOWN_REASONS = new Set([
  'stale',
  'deleted',
  'parentDeleted',
  'owner',
  'currencyLocked',
  'inUse',
  'notFound',
  'reference',
  'invalid',
  'conflict',
  'failed',
  'discarded',
  'tooLarge',
  'server',
])

/** "Account: Mono", "Transaction: ₴250.00 · Coffee" — whatever the queued record itself says about what it was. */
function issueTitle(issue: SyncIssue): string {
  const label = t(`sync.entity.${issue.entity}` as MessageKey)
  const p = issue.payload ?? {}
  const name = typeof p.name === 'string' ? p.name : typeof p.merchant === 'string' ? p.merchant : ''
  const amount = typeof p.amount === 'number' && typeof p.currency === 'string' ? formatMoney(p.amount, p.currency) : ''
  const note = typeof p.note === 'string' ? p.note : ''
  const detail = name || [amount, note].filter(Boolean).join(' · ')
  const what = detail ? `${label}: ${detail}` : label
  return issue.op === 'delete' ? t('sync.issues.deletion', { what }) : what
}

function issueReason(issue: SyncIssue): string {
  if (KNOWN_REASONS.has(issue.reason)) return t(`sync.reason.${issue.reason}` as MessageKey)
  return issue.message || t('sync.reason.server')
}

const busyIssueId = ref<number | null>(null)
async function onRetry(issue: SyncIssue) {
  busyIssueId.value = issue.id ?? null
  try {
    await retryIssue(issue)
  } finally {
    busyIssueId.value = null
  }
}

const resyncing = ref(false)
const resyncStatus = ref('')
// Explicit flag, not a sniff of resyncStatus's text — the message is locale-dependent,
// its wording can't be used to infer success/failure.
const resyncError = ref(false)

function openResyncConfirm() {
  popups.confirmDialog({
    title: t('sync.resyncConfirmTitle'),
    message: t('sync.resyncConfirmMessage'),
    confirmLabel: t('sync.resyncConfirmButton'),
    danger: true,
    onConfirm: async () => {
      resyncing.value = true
      resyncStatus.value = ''
      try {
        await resyncFromServer(authStore.uid)
        resyncStatus.value = t('sync.resyncSuccess')
        resyncError.value = false
      } catch (error) {
        resyncStatus.value = (error as Error).message || t('sync.resyncFailure')
        resyncError.value = true
      } finally {
        resyncing.value = false
        popups.closeConfirm()
      }
    },
  })
}
</script>

<template>
  <!-- Root stays mounted (and reserves the same 40x40 footprint as the other
       header icon buttons) even in local mode, so the header row stays
       symmetric and "Всі рахунки" doesn't drift off-center; only the
       contents are conditional on there being a server to report on. -->
  <div class="sync-status">
    <button
      v-if="!authStore.localMode"
      class="icon-btn"
      :aria-label="
        hasIssues ? t('sync.issues.badgeAria') : backendOnline ? t('sync.serverOnlineAria') : t('sync.serverOfflineAria')
      "
      @click="syncIssues.openDetails()"
    >
      <MdiIcon
        :name="hasIssues ? 'mdiCloudAlertOutline' : backendOnline ? 'mdiCloudCheckOutline' : 'mdiCloudOffOutline'"
        :size="22"
        :color="backendOnline && !hasIssues ? 'var(--income)' : 'var(--expense)'"
      />
      <span v-if="pendingCount > 0" class="pending-dot">{{ pendingCount > 9 ? '9+' : pendingCount }}</span>
    </button>

    <Modal
      v-if="!authStore.localMode"
      :open="syncIssues.detailsOpen"
      :title="t('sync.title')"
      @close="syncIssues.detailsOpen = false"
    >
      <div class="status-row">
        <span class="dot" :class="backendOnline ? 'online' : 'offline'" />
        <span>{{ backendOnline ? t('sync.serverOnline') : t('sync.serverOffline') }}</span>
      </div>
      <p class="line">{{ lastSyncedLabel }}</p>
      <p v-if="pendingCount > 0" class="line pending">{{ t('sync.pendingLine', { label: pendingLabel }) }}</p>
      <p v-else-if="!hasIssues" class="line ok">{{ t('sync.allSynced') }}</p>

      <div v-if="hasIssues" class="field issues">
        <div class="issues-head">
          <label>{{ t('sync.issues.title') }}</label>
          <button class="link-btn" @click="dismissAllIssues(authStore.uid!)">{{ t('sync.issues.dismissAll') }}</button>
        </div>
        <p class="hint">{{ t('sync.issues.hint') }}</p>
        <ul class="issue-list">
          <li v-for="issue in syncIssues.issues" :key="issue.id" class="issue">
            <div class="issue-text">
              <span class="issue-title">{{ issueTitle(issue) }}</span>
              <span class="issue-reason">{{ issueReason(issue) }} · {{ relativeTime(toLocalTime(issue.editedAt), now) }}</span>
            </div>
            <div class="issue-actions">
              <button
                v-if="canRetry(issue)"
                class="btn btn-ghost"
                :disabled="busyIssueId === issue.id"
                @click="onRetry(issue)"
              >
                {{ issue.kind === 'failed' ? t('sync.issues.retry') : t('sync.issues.applyMine') }}
              </button>
              <button class="btn btn-ghost" :disabled="busyIssueId === issue.id" @click="dismissIssue(issue.id!)">
                {{ t('sync.issues.dismiss') }}
              </button>
            </div>
          </li>
        </ul>
      </div>

      <div class="field">
        <label>{{ t('sync.resyncLabel') }}</label>
        <p class="hint">{{ t('sync.resyncHint') }}</p>
        <button
          class="btn btn-danger resync-btn"
          :disabled="resyncing || !backendOnline"
          @click="openResyncConfirm"
        >
          {{ resyncing ? t('sync.resyncing') : t('sync.resyncButton') }}
        </button>
        <p v-if="!backendOnline" class="hint">{{ t('sync.resyncOfflineHint') }}</p>
        <p v-if="resyncStatus" class="status" :class="{ error: !backendOnline || resyncError }">
          {{ resyncStatus }}
        </p>
      </div>
    </Modal>
  </div>
</template>

<style lang="scss" scoped>
.sync-status {
  position: relative;
  width: 40px;
  height: 40px;
  flex-shrink: 0;
}

.icon-btn {
  border: none;
  background: transparent;
  color: var(--text-primary);
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border-radius: 50%;
  position: relative;
  @include transition();
}

.icon-btn:active {
  transform: scale(0.88);
}

.pending-dot {
  position: absolute;
  top: 2px;
  right: 2px;
  min-width: 15px;
  height: 15px;
  padding: 0 3px;
  border-radius: 999px;
  background: var(--expense);
  color: #fff;
  font-size: 9.5px;
  font-weight: 700;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.status-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: var(--text-primary);
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.dot.online {
  background: var(--income);
}

.dot.offline {
  background: var(--expense);
}

.line {
  margin: 8px 0 0;
  color: var(--text-secondary);
  font-size: 13px;
}

.line.pending {
  color: var(--expense);
}

.line.ok {
  color: var(--income);
}

.field {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
}

.field label {
  font-size: 13px;
  font-weight: 600;
}

.hint {
  font-size: 12px;
  color: var(--text-muted);
  margin: 4px 0 0;
}

.resync-btn {
  width: 100%;
  margin-top: 10px;
}

.status {
  font-size: 13px;
  color: var(--income);
  margin: 8px 0 0;
}

.status.error {
  color: var(--expense);
}

.issues-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.link-btn {
  border: none;
  background: none;
  padding: 0;
  font-size: 12px;
  color: var(--text-muted);
  cursor: pointer;
  text-decoration: underline;
}

.issue-list {
  list-style: none;
  margin: 10px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 40vh;
  overflow-y: auto;
}

.issue {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
}

.issue-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.issue-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  overflow-wrap: anywhere;
}

.issue-reason {
  font-size: 12px;
  color: var(--expense);
}

.issue-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.issue-actions .btn {
  padding: 6px 12px;
  font-size: 12px;
}
</style>
