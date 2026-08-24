import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { startOfMonth, endOfMonth, startOfDay, endOfDay, startOfWeek, endOfWeek } from '../utils/format'

export type PeriodGranularity = 'day' | 'week' | 'month' | 'year' | 'all'

function addDays(ts: number, days: number): number {
  const d = new Date(ts)
  d.setDate(d.getDate() + days)
  return d.getTime()
}

export const usePeriodStore = defineStore('period', () => {
  const now = new Date()
  const year = ref(now.getFullYear())
  const month = ref(now.getMonth()) // 0-11, only meaningful for granularity==='month'
  const anchor = ref(startOfDay(now.getTime())) // reference day, only meaningful for 'day'/'week'
  const granularity = ref<PeriodGranularity>('month')

  const start = computed(() => {
    switch (granularity.value) {
      case 'day':
        return startOfDay(anchor.value)
      case 'week':
        return startOfWeek(anchor.value)
      case 'month':
        return startOfMonth(year.value, month.value)
      case 'year':
        return new Date(year.value, 0, 1, 0, 0, 0, 0).getTime()
      case 'all':
        return Number.NEGATIVE_INFINITY
    }
  })

  const end = computed(() => {
    switch (granularity.value) {
      case 'day':
        return endOfDay(anchor.value)
      case 'week':
        return endOfWeek(anchor.value)
      case 'month':
        return endOfMonth(year.value, month.value)
      case 'year':
        return new Date(year.value, 11, 31, 23, 59, 59, 999).getTime()
      case 'all':
        return Number.POSITIVE_INFINITY
    }
  })

  function next() {
    switch (granularity.value) {
      case 'day':
        anchor.value = addDays(anchor.value, 1)
        break
      case 'week':
        anchor.value = addDays(anchor.value, 7)
        break
      case 'month':
        if (month.value === 11) {
          month.value = 0
          year.value++
        } else {
          month.value++
        }
        break
      case 'year':
        year.value++
        break
      case 'all':
        break
    }
  }

  function prev() {
    switch (granularity.value) {
      case 'day':
        anchor.value = addDays(anchor.value, -1)
        break
      case 'week':
        anchor.value = addDays(anchor.value, -7)
        break
      case 'month':
        if (month.value === 0) {
          month.value = 11
          year.value--
        } else {
          month.value--
        }
        break
      case 'year':
        year.value--
        break
      case 'all':
        break
    }
  }

  /** Jump to a specific month (used by the month picker) — always switches granularity to 'month'. */
  function set(y: number, m: number) {
    year.value = y
    month.value = m
    granularity.value = 'month'
  }

  /** Jump to a specific year (used by the year picker) — switches granularity to 'year'. */
  function setYear(y: number) {
    year.value = y
    granularity.value = 'year'
  }

  /** Jump to whichever day/week contains `ts` — used by the day/week date pickers. */
  function setDay(ts: number) {
    anchor.value = startOfDay(ts)
    granularity.value = 'day'
  }
  function setWeek(ts: number) {
    anchor.value = startOfDay(ts)
    granularity.value = 'week'
  }

  /** Switching granularity always snaps to "now" in the new granularity — least surprising default. */
  function setGranularity(g: PeriodGranularity) {
    granularity.value = g
    const today = new Date()
    if (g === 'day' || g === 'week') anchor.value = startOfDay(today.getTime())
    else if (g === 'month') {
      year.value = today.getFullYear()
      month.value = today.getMonth()
    } else if (g === 'year') {
      year.value = today.getFullYear()
    }
  }

  const isCurrentPeriod = computed(() => {
    const today = new Date()
    switch (granularity.value) {
      case 'day':
        return startOfDay(anchor.value) === startOfDay(today.getTime())
      case 'week':
        return startOfWeek(anchor.value) === startOfWeek(today.getTime())
      case 'month':
        return year.value === today.getFullYear() && month.value === today.getMonth()
      case 'year':
        return year.value === today.getFullYear()
      case 'all':
        return true
    }
  })

  function goToToday() {
    setGranularity(granularity.value)
  }

  return {
    year,
    month,
    anchor,
    granularity,
    start,
    end,
    next,
    prev,
    set,
    setYear,
    setDay,
    setWeek,
    setGranularity,
    isCurrentPeriod,
    goToToday,
  }
})
