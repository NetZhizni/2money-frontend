<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Modal from '../common/Modal.vue'
import MdiIcon from '../common/MdiIcon.vue'
import { dateKey, MONTHS_UK, MONTHS_UK_SHORT, MONTHS_UK_GENITIVE } from '../../utils/format'

const props = defineProps<{
  open: boolean
  date: string // yyyy-mm-dd
  showRecurring: boolean
  recurring: boolean
  recurringSummary?: string
}>()
const emit = defineEmits<{ close: []; 'update:date': [string]; 'update:recurring': [boolean] }>()

const todayKey = computed(() => dateKey(Date.now()))
const yesterdayKey = computed(() => dateKey(Date.now() - 24 * 60 * 60 * 1000))

function shortLabel(key: string): string {
  const [, month, day] = key.split('-').map(Number)
  return `${day} ${MONTHS_UK_GENITIVE[month - 1]}`
}

const todayLabel = computed(() => shortLabel(todayKey.value))
const yesterdayLabel = computed(() => shortLabel(yesterdayKey.value))

function parseKey(key: string): { year: number; month: number; day: number } {
  const [year, month, day] = key.split('-').map(Number)
  return { year, month: month - 1, day }
}

function keyOf(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function titleCase(s: string): string {
  return s.charAt(0) + s.slice(1).toLowerCase()
}

// Which month/year the calendar grid is currently showing — independent of
// the selected date so the user can browse without changing the selection.
const initial = parseKey(props.date || todayKey.value)
const viewYear = ref(initial.year)
const viewMonth = ref(initial.month)
const pickerMode = ref<'days' | 'months'>('days')

// Reset the visible month/mode to match the current selection every time the
// popup is (re)opened — it stays mounted permanently, so this is the only
// hook we get for "just opened".
watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return
    const parsed = parseKey(props.date || todayKey.value)
    viewYear.value = parsed.year
    viewMonth.value = parsed.month
    pickerMode.value = 'days'
  },
)

const monthYearLabel = computed(() => `${titleCase(MONTHS_UK[viewMonth.value])} ${viewYear.value}`)

function shiftMonth(delta: number) {
  let m = viewMonth.value + delta
  let y = viewYear.value
  if (m < 0) { m = 11; y-- }
  else if (m > 11) { m = 0; y++ }
  viewMonth.value = m
  viewYear.value = y
}

function selectMonth(month: number) {
  viewMonth.value = month
  pickerMode.value = 'days'
}

const WEEKDAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд']

interface CalendarCell { key: string; day: number; otherMonth: boolean }

const calendarCells = computed<CalendarCell[]>(() => {
  const year = viewYear.value
  const month = viewMonth.value
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7 // Monday = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const daysInPrevMonth = new Date(year, month, 0).getDate()

  const cells: CalendarCell[] = []
  for (let i = firstWeekday - 1; i >= 0; i--) {
    const day = daysInPrevMonth - i
    const m = month === 0 ? 11 : month - 1
    const y = month === 0 ? year - 1 : year
    cells.push({ key: keyOf(y, m, day), day, otherMonth: true })
  }
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ key: keyOf(year, month, day), day, otherMonth: false })
  }
  const trailing = (7 - (cells.length % 7)) % 7
  for (let day = 1; day <= trailing; day++) {
    const m = month === 11 ? 0 : month + 1
    const y = month === 11 ? year + 1 : year
    cells.push({ key: keyOf(y, m, day), day, otherMonth: true })
  }
  return cells
})

function pick(key: string) {
  emit('update:date', key)
  emit('close')
}
</script>

<template>
  <Modal :open="open" title="Дата" top @close="emit('close')">
    <div class="calendar">
      <div v-if="pickerMode === 'days'" class="cal-header">
        <button type="button" class="cal-nav" aria-label="Попередній місяць" @click="shiftMonth(-1)">
          <MdiIcon name="mdiChevronLeft" :size="22" />
        </button>
        <button type="button" class="cal-title" @click="pickerMode = 'months'">
          {{ monthYearLabel }}
          <MdiIcon name="mdiChevronDown" :size="16" />
        </button>
        <button type="button" class="cal-nav" aria-label="Наступний місяць" @click="shiftMonth(1)">
          <MdiIcon name="mdiChevronRight" :size="22" />
        </button>
      </div>

      <template v-if="pickerMode === 'days'">
        <div class="weekday-row">
          <span v-for="label in WEEKDAY_LABELS" :key="label" class="weekday-cell">{{ label }}</span>
        </div>
        <div class="day-grid">
          <button
            v-for="cell in calendarCells"
            :key="cell.key"
            type="button"
            class="day-cell"
            :class="{ other: cell.otherMonth, today: cell.key === todayKey, selected: cell.key === props.date }"
            @click="pick(cell.key)"
          >
            {{ cell.day }}
          </button>
        </div>
      </template>

      <template v-else>
        <div class="year-stepper">
          <button type="button" class="cal-nav" aria-label="Попередній рік" @click="viewYear--">
            <MdiIcon name="mdiChevronLeft" :size="22" />
          </button>
          <span class="year-label">{{ viewYear }}</span>
          <button type="button" class="cal-nav" aria-label="Наступний рік" @click="viewYear++">
            <MdiIcon name="mdiChevronRight" :size="22" />
          </button>
        </div>
        <div class="month-grid">
          <button
            v-for="(label, idx) in MONTHS_UK_SHORT"
            :key="label"
            type="button"
            class="month-cell"
            :class="{ selected: idx === viewMonth }"
            @click="selectMonth(idx)"
          >
            {{ label }}
          </button>
        </div>
      </template>
    </div>

    <div class="quick-row">
      <button type="button" class="quick-btn" :class="{ active: props.date === yesterdayKey }" @click="pick(yesterdayKey)">
        <MdiIcon name="mdiWeatherNight" :size="18" />
        <span class="quick-title">Вчора</span>
        <span class="quick-sub">{{ yesterdayLabel }}</span>
      </button>
      <button type="button" class="quick-btn" :class="{ active: props.date === todayKey }" @click="pick(todayKey)">
        <MdiIcon name="mdiWhiteBalanceSunny" :size="18" />
        <span class="quick-title">Сьогодні</span>
        <span class="quick-sub">{{ todayLabel }}</span>
      </button>
    </div>

    <button v-if="showRecurring" type="button" class="row toggle-row" @click="emit('update:recurring', !recurring)">
      <span class="row-icon"><MdiIcon name="mdiRepeat" :size="20" color="var(--text-secondary)" /></span>
      <span class="row-label">Повторення</span>
      <span class="row-value">{{ recurring ? recurringSummary || 'Так' : 'Ні' }}</span>
    </button>
  </Modal>
</template>

<style scoped>
.row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  border: none;
  background: var(--surface-2);
  border-radius: var(--radius-sm);
  padding: 12px 14px;
  margin-bottom: 10px;
  cursor: pointer;
  text-align: left;
  position: relative;
}

.row-icon {
  display: flex;
  flex-shrink: 0;
}

.row-label {
  flex: 1;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.row-value {
  font-size: 13.5px;
  color: var(--text-secondary);
}

.calendar {
  background: var(--surface-2);
  border-radius: var(--radius-sm);
  padding: 10px 12px 12px;
  margin-bottom: 10px;
}

.cal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.cal-nav {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  border-radius: 50%;
  cursor: pointer;
  flex-shrink: 0;
}

.cal-title {
  display: flex;
  align-items: center;
  gap: 4px;
  border: none;
  background: transparent;
  color: var(--text-primary);
  font-size: 14.5px;
  font-weight: 600;
  cursor: pointer;
  padding: 6px 8px;
  border-radius: var(--radius-sm);
}

.weekday-row {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  margin-bottom: 4px;
}

.weekday-cell {
  text-align: center;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-muted);
  padding: 4px 0;
}

.day-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
}

.day-cell {
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--text-primary);
  font-size: 13.5px;
  border-radius: 50%;
  cursor: pointer;
}

.day-cell.other {
  color: var(--text-muted);
}

.day-cell.today {
  box-shadow: inset 0 0 0 1px var(--accent);
  color: var(--accent);
}

.day-cell.selected {
  background: var(--accent);
  color: #fff;
}

.year-stepper {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin-bottom: 10px;
}

.year-label {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  min-width: 56px;
  text-align: center;
}

.month-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}

.month-cell {
  border: none;
  background: var(--surface);
  color: var(--text-primary);
  font-size: 13.5px;
  padding: 10px 0;
  border-radius: var(--radius-sm);
  cursor: pointer;
}

.month-cell.selected {
  background: var(--accent);
  color: #fff;
}

.quick-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 10px;
}

.quick-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  border: none;
  background: var(--surface-2);
  border-radius: var(--radius-sm);
  padding: 14px 10px;
  color: var(--text-secondary);
  cursor: pointer;
}

.quick-btn.active {
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: var(--accent);
}

.quick-title {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text-primary);
}

.quick-btn.active .quick-title {
  color: var(--accent);
}

.quick-sub {
  font-size: 11.5px;
  color: var(--text-muted);
}
</style>
