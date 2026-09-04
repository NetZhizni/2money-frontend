<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  usePeriodStore,
  PERIOD_GRANULARITY_LABEL_KEY,
  PERIOD_TODAY_LABEL_KEY,
  type PeriodGranularity,
} from '../../stores/period'
import { dateKey, MONTHS_SHORT } from '../../utils/format'
import { t } from '../../i18n'
import Modal from '../common/Modal.vue'

const period = usePeriodStore()
const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const pickYear = ref(period.year)
const pickDate = ref(dateKey(period.anchor))

// Stays permanently mounted — re-sync the local pickers from the store every
// time it's reopened (not just once at setup).
watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return
    pickYear.value = period.year
    pickDate.value = dateKey(period.anchor)
  },
)

const today = new Date()
const currentYear = today.getFullYear()
const currentMonth = today.getMonth()
const todayShortLabel = `${today.getDate()} ${MONTHS_SHORT[currentMonth]}`

const GRANULARITY_OPTIONS: PeriodGranularity[] = ['day', 'week', 'month', 'year', 'all']

function chooseGranularity(g: PeriodGranularity) {
  period.setGranularity(g)
  if (g === 'all') {
    emit('close')
    return
  }
  // Local pickers are only synced from the store on mount, so switching
  // granularity mid-session needs to re-sync them to the (now reset) period.
  pickYear.value = period.year
  pickDate.value = dateKey(period.anchor)
}

function chooseMonth(monthIdx: number) {
  period.set(pickYear.value, monthIdx)
  emit('close')
}

function chooseYear(y: number) {
  period.setYear(y)
  emit('close')
}

function chooseDate() {
  const ts = new Date(pickDate.value).getTime()
  if (Number.isNaN(ts)) return
  if (period.granularity === 'week') period.setWeek(ts)
  else period.setDay(ts)
  emit('close')
}

function chooseToday() {
  period.goToToday()
  emit('close')
}

const yearGrid = computed(() => {
  const base = Math.floor(pickYear.value / 12) * 12
  return Array.from({ length: 12 }, (_, i) => base + i)
})
</script>

<template>
  <Modal :open="open" :title="t('layout.periodPicker.title')" @close="emit('close')">
    <div class="segmented granularity-toggle">
      <button
        v-for="g in GRANULARITY_OPTIONS"
        :key="g"
        :class="{ active: period.granularity === g }"
        @click="chooseGranularity(g)"
      >
        {{ t(PERIOD_GRANULARITY_LABEL_KEY[g]) }}
      </button>
    </div>

    <button v-if="!period.isCurrentPeriod" class="today-btn" @click="chooseToday">
      {{ period.granularity === 'all' ? t('common.today') : t(PERIOD_TODAY_LABEL_KEY[period.granularity]) }}
    </button>

    <template v-if="period.granularity === 'month'">
      <div class="year-row">
        <button class="chevron" @click="pickYear--">‹</button>
        <span class="year">{{ pickYear }}</span>
        <button class="chevron" @click="pickYear++">›</button>
      </div>
      <div class="month-grid">
        <button
          v-for="(m, idx) in MONTHS_SHORT"
          :key="m"
          class="month-cell"
          :class="{
            active: idx === period.month && pickYear === period.year,
            current: idx === currentMonth && pickYear === currentYear,
          }"
          @click="chooseMonth(idx)"
        >
          {{ m }}
        </button>
      </div>
    </template>

    <template v-else-if="period.granularity === 'year'">
      <div class="month-grid year-grid">
        <button
          v-for="y in yearGrid"
          :key="y"
          class="month-cell"
          :class="{ active: y === period.year, current: y === currentYear }"
          @click="chooseYear(y)"
        >
          {{ y }}
        </button>
      </div>
    </template>

    <template v-else-if="period.granularity === 'day' || period.granularity === 'week'">
      <div class="date-pick-row">
        <input v-model="pickDate" type="date" />
        <button class="btn btn-primary" @click="chooseDate">{{ t('layout.periodPicker.go') }}</button>
      </div>
      <p class="today-hint">{{ t('layout.periodPicker.todayHint', { date: todayShortLabel }) }}</p>
    </template>
  </Modal>
</template>

<style scoped>
.granularity-toggle {
  margin-bottom: 14px;
}

.today-btn {
  display: block;
  width: 100%;
  border: none;
  background: var(--surface-2);
  color: var(--accent);
  font-size: 13px;
  font-weight: 600;
  padding: 8px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  margin-bottom: 10px;
}

.year-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
  margin-bottom: 10px;
  font-weight: 600;
}

.chevron {
  border: none;
  background: var(--surface-2);
  width: 28px;
  height: 28px;
  border-radius: 50%;
  cursor: pointer;
  color: var(--text-secondary);
}

.month-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
}

.year-grid {
  grid-template-columns: repeat(3, 1fr);
}

.month-cell {
  position: relative;
  border: none;
  background: var(--surface-2);
  padding: 8px 0;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 13px;
  color: var(--text-primary);
}

.month-cell.active {
  background: var(--accent);
  color: #fff;
}

/* A small dot marking today's actual month/year — independent of which cell
   is "active" (selected), so browsing a past period doesn't lose track of
   which cell today actually falls on. */
.month-cell.current::after {
  content: '';
  position: absolute;
  bottom: 3px;
  left: 50%;
  transform: translateX(-50%);
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--accent);
}

.month-cell.active.current::after {
  background: #fff;
}

.date-pick-row {
  display: flex;
  gap: 8px;
}

.date-pick-row input {
  flex: 1;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 8px 10px;
  font-size: 13px;
  color: var(--text-primary);
}

.today-hint {
  margin: 8px 0 0;
  font-size: 11.5px;
  color: var(--text-muted);
  text-align: center;
}
</style>
