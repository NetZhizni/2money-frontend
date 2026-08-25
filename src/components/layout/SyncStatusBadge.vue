<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import MdiIcon from '../common/MdiIcon.vue'
import { backendOnline, lastSyncedAt, pendingCount } from '../../db/syncStatus'
import { relativeTimeUk } from '../../utils/format'

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
</script>

<template>
  <div class="sync-status">
    <button
      class="icon-btn"
      :aria-label="backendOnline ? 'Статус синхронізації: сервер онлайн' : 'Статус синхронізації: немає зв’язку з сервером'"
      @click="showDetails = !showDetails"
    >
      <MdiIcon
        :name="backendOnline ? 'mdiCloudCheckOutline' : 'mdiCloudOffOutline'"
        :size="22"
        :color="backendOnline ? 'var(--income)' : 'var(--expense)'"
      />
      <span v-if="pendingCount > 0" class="pending-dot">{{ pendingCount > 9 ? '9+' : pendingCount }}</span>
    </button>

    <template v-if="showDetails">
      <div class="scrim" @click="showDetails = false" />
      <div class="popover" @mousedown.stop>
        <div class="status-row">
          <span class="dot" :class="backendOnline ? 'online' : 'offline'" />
          <span>{{ backendOnline ? 'Сервер онлайн' : 'Немає зв’язку з сервером' }}</span>
        </div>
        <p class="line">{{ lastSyncedLabel }}</p>
        <p v-if="pendingCount > 0" class="line pending">Очікує синхронізації: {{ pendingLabel }}</p>
        <p v-else class="line ok">Усі дані синхронізовано</p>
      </div>
    </template>
  </div>
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

.scrim {
  position: fixed;
  inset: 0;
  z-index: 10;
}

.popover {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  background: var(--surface);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  padding: 12px 14px;
  z-index: 50;
  width: 230px;
  font-size: 13px;
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
}

.line.pending {
  color: var(--expense);
}

.line.ok {
  color: var(--income);
}
</style>
