<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import MdiIcon from '../common/MdiIcon.vue'
import Modal from '../common/Modal.vue'
import { backendOnline, lastSyncedAt, pendingCount } from '../../db/syncStatus'
import { resyncFromServer } from '../../db/sync'
import { useAuthStore } from '../../stores/auth'
import { usePopupsStore } from '../../stores/popups'
import { relativeTime, pluralize } from '../../utils/format'
import { t } from '../../i18n'

const authStore = useAuthStore()
const popups = usePopupsStore()
const showDetails = ref(false)

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
  <div class="sync-status">
    <button
      class="icon-btn"
      :aria-label="backendOnline ? t('sync.serverOnlineAria') : t('sync.serverOfflineAria')"
      @click="showDetails = true"
    >
      <MdiIcon
        :name="backendOnline ? 'mdiCloudCheckOutline' : 'mdiCloudOffOutline'"
        :size="22"
        :color="backendOnline ? 'var(--income)' : 'var(--expense)'"
      />
      <span v-if="pendingCount > 0" class="pending-dot">{{ pendingCount > 9 ? '9+' : pendingCount }}</span>
    </button>

    <Modal :open="showDetails" :title="t('sync.title')" @close="showDetails = false">
      <div class="status-row">
        <span class="dot" :class="backendOnline ? 'online' : 'offline'" />
        <span>{{ backendOnline ? t('sync.serverOnline') : t('sync.serverOffline') }}</span>
      </div>
      <p class="line">{{ lastSyncedLabel }}</p>
      <p v-if="pendingCount > 0" class="line pending">{{ t('sync.pendingLine', { label: pendingLabel }) }}</p>
      <p v-else class="line ok">{{ t('sync.allSynced') }}</p>

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
</style>
