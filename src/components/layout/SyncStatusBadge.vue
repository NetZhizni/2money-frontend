<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import MdiIcon from '../common/MdiIcon.vue'
import Modal from '../common/Modal.vue'
import ConfirmDialog from '../common/ConfirmDialog.vue'
import { backendOnline, lastSyncedAt, pendingCount } from '../../db/syncStatus'
import { resyncFromServer } from '../../db/sync'
import { useAuthStore } from '../../stores/auth'
import { relativeTimeUk } from '../../utils/format'

const authStore = useAuthStore()
const showDetails = ref(false)

// Ticks while the badge is on screen so "N хв тому" doesn't go stale without a re-render.
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
  lastSyncedAt.value === null ? 'Ще не синхронізовано' : `Синхронізовано ${relativeTimeUk(lastSyncedAt.value, now.value)}`,
)

const pendingLabel = computed(() => {
  const n = pendingCount.value
  return `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'запис' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'записи' : 'записів'}`
})

const showResyncConfirm = ref(false)
const resyncing = ref(false)
const resyncStatus = ref('')

async function handleResyncConfirmed() {
  resyncing.value = true
  resyncStatus.value = ''
  try {
    await resyncFromServer(authStore.uid)
    resyncStatus.value = 'Локальні дані оновлено із сервера.'
  } catch (error) {
    resyncStatus.value = (error as Error).message || 'Не вдалося оновити дані.'
  } finally {
    resyncing.value = false
    showResyncConfirm.value = false
  }
}
</script>

<template>
  <div class="sync-status">
    <button
      class="icon-btn"
      :aria-label="backendOnline ? 'Статус синхронізації: сервер онлайн' : 'Статус синхронізації: немає зв’язку з сервером'"
      @click="showDetails = true"
    >
      <MdiIcon
        :name="backendOnline ? 'mdiCloudCheckOutline' : 'mdiCloudOffOutline'"
        :size="22"
        :color="backendOnline ? 'var(--income)' : 'var(--expense)'"
      />
      <span v-if="pendingCount > 0" class="pending-dot">{{ pendingCount > 9 ? '9+' : pendingCount }}</span>
    </button>

    <Modal v-if="showDetails" title="Синхронізація" @close="showDetails = false">
      <div class="status-row">
        <span class="dot" :class="backendOnline ? 'online' : 'offline'" />
        <span>{{ backendOnline ? 'Сервер онлайн' : 'Немає зв’язку з сервером' }}</span>
      </div>
      <p class="line">{{ lastSyncedLabel }}</p>
      <p v-if="pendingCount > 0" class="line pending">Очікує синхронізації: {{ pendingLabel }}</p>
      <p v-else class="line ok">Усі дані синхронізовано</p>

      <div class="field">
        <label>Перезавантажити дані</label>
        <p class="hint">
          Видаляє дані, збережені локально на цьому пристрої, і завантажує їх заново із сервера.
          На сервері нічого не змінюється — корисно, якщо локальні дані виглядають застарілими або
          пошкодженими.
        </p>
        <button
          class="btn btn-danger resync-btn"
          :disabled="resyncing || !backendOnline"
          @click="showResyncConfirm = true"
        >
          {{ resyncing ? 'Оновлення…' : 'Оновити дані із сервера' }}
        </button>
        <p v-if="!backendOnline" class="hint">Недоступно без з’єднання із сервером.</p>
        <p v-if="resyncStatus" class="status" :class="{ error: !backendOnline || resyncStatus.startsWith('Не') || resyncStatus.startsWith('Є') }">
          {{ resyncStatus }}
        </p>
      </div>
    </Modal>
  </div>

  <ConfirmDialog
    v-if="showResyncConfirm"
    title="Оновити дані із сервера?"
    message="Дані на цьому пристрої буде видалено і завантажено заново із сервера. Незбережені локальні зміни, якщо є, спершу буде надіслано на сервер."
    confirm-label="Оновити"
    danger
    @close="showResyncConfirm = false"
    @confirm="handleResyncConfirmed"
  />
</template>

<style scoped>
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
