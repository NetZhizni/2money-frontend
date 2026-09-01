<script setup lang="ts">
import { computed, ref } from 'vue'
import { usePeriodStore } from '../../stores/period'
import { MONTHS_UK, MONTHS_UK_SHORT, MONTHS_UK_GENITIVE } from '../../utils/format'
import MdiIcon from '../common/MdiIcon.vue'
import PeriodPickerPopover from './PeriodPickerPopover.vue'

const period = usePeriodStore()

const showPeriodPicker = ref(false)

function daysInCurrentMonth(): number {
  return new Date(period.year, period.month + 1, 0).getDate()
}

const periodLabel = computed(() => {
  switch (period.granularity) {
    case 'day': {
      const d = new Date(period.anchor)
      return `${d.getDate()} ${MONTHS_UK_GENITIVE[d.getMonth()]} ${d.getFullYear()}`
    }
    case 'week': {
      const s = new Date(period.start)
      const e = new Date(period.end)
      return s.getMonth() === e.getMonth()
        ? `${s.getDate()}–${e.getDate()} ${MONTHS_UK_SHORT[s.getMonth()]}`
        : `${s.getDate()} ${MONTHS_UK_SHORT[s.getMonth()]} – ${e.getDate()} ${MONTHS_UK_SHORT[e.getMonth()]}`
    }
    case 'month':
      return `${MONTHS_UK[period.month]} ${period.year}`
    case 'year':
      return String(period.year)
    case 'all':
      return 'Весь час'
  }
})
</script>

<template>
  <div class="period-row">
    <button
      v-if="period.granularity !== 'all'"
      class="chevron"
      aria-label="Попередній період"
      @click="period.prev()"
    >
      <MdiIcon name="mdiChevronLeft" :size="22" />
    </button>

    <button
      class="period-pill"
      :class="{ 'period-pill--current': period.isCurrentPeriod }"
      @click="showPeriodPicker = true"
    >
      <span v-if="period.granularity === 'month'" class="day-badge">{{ daysInCurrentMonth() }}</span>
      <span>{{ periodLabel }}</span>
      <MdiIcon name="mdiChevronDown" :size="16" />
    </button>
    <PeriodPickerPopover :open="showPeriodPicker" @close="showPeriodPicker = false" />

    <button
      v-if="period.granularity !== 'all'"
      class="chevron"
      aria-label="Наступний період"
      @click="period.next()"
    >
      <MdiIcon name="mdiChevronRight" :size="22" />
    </button>
  </div>
</template>

<style scoped>
.period-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 24px;
  flex-shrink: 0;
  background: var(--page-bg);
}

.chevron {
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.12s ease;
}

.chevron:active {
  transform: scale(0.85);
}

.period-pill {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--surface);
  border: none;
  border-radius: var(--radius-pill);
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: var(--text-primary);
  cursor: pointer;
  box-shadow: var(--shadow-sm);
  transition: transform 0.12s ease;
}

.period-pill:active {
  transform: scale(0.96);
}

.period-pill--current {
  background: color-mix(in srgb, var(--accent) 14%, var(--surface));
  color: var(--accent);
}

.period-pill--current .day-badge {
  background: color-mix(in srgb, var(--accent) 20%, transparent);
  color: var(--accent);
}

.day-badge {
  background: var(--surface-2);
  border-radius: 50%;
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
}
</style>
